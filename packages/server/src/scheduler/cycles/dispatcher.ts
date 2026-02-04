/**
 * Dispatcher Cycle - runs ready tasks
 *
 * Responsibilities:
 * - Get pending sequenced tasks with resolved dependencies
 * - Check concurrency limits (soft cap with dynamic scaling)
 * - Dispatch tasks via agent harness
 * - Broadcast SSE events
 * - Trigger Shepherd when tasks complete
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import { startTaskLog, appendLog, completeTaskLog, getTaskLogEntries } from '../../logs'
import {
  buildMycelContext,
  buildAgentsSection,
  buildSkillsSection,
  buildMcpSection,
} from '../../prompts/context'
import { getTelegramService } from '../../telegram'
import { formatTaskCompleted, formatTaskFailed, formatTaskRetrying, type TaskInfo, type TaskRetryInfo } from '../../telegram/messages'
import { shouldRetry, buildRetryContext, parseRetryContext, resolveModel } from '../../agents/fallback'

// Track currently running tasks (task_id -> start time)
const runningTasks = new Map<string, number>()

/** Send task completion notification via Telegram */
function notifyTaskComplete(taskInfo: TaskInfo): void {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return

  const msg = formatTaskCompleted(taskInfo)
  telegram.sendMessage(msg).catch((e) => console.error('[Dispatcher] Notify error:', e))
}

/** Send task failure notification via Telegram */
function notifyTaskFailed(taskInfo: TaskInfo): void {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return

  const msg = formatTaskFailed(taskInfo)
  telegram.sendMessage(msg).catch((e) => console.error('[Dispatcher] Notify error:', e))
}

/** Send task retrying notification via Telegram */
function notifyTaskRetrying(retryInfo: TaskRetryInfo): void {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return

  const msg = formatTaskRetrying(retryInfo)
  telegram.sendMessage(msg).catch((e) => console.error('[Dispatcher] Notify error:', e))
}

/**
 * Handle retry logic for a failed task.
 * Returns true if the task was reset for retry, false if it should follow normal failure flow.
 */
async function handleRetry(
  taskId: string,
  task: { title: string; repo_path: string; retry_context: string | null },
  agent: string,
  model: string | null | undefined,
  error: string,
  durationSeconds: number | null,
): Promise<boolean> {
  const decision = shouldRetry(agent, model, task.retry_context)

  if (!decision.retry || !decision.fallbackModel) {
    return false
  }

  const retryContext = buildRetryContext(agent, model, error, durationSeconds, task.retry_context)
  const existing = parseRetryContext(task.retry_context)
  const attempt = existing ? existing.attempt : 0

  // Reset task to pending with upgraded model
  await queries.updateTask(taskId, {
    status: 'pending',
    model: decision.fallbackModel,
    error: null,
    result: null,
    started_at: null,
    completed_at: null,
    duration_seconds: null,
    cost_usd: null,
    retry_context: retryContext,
  })

  console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} retrying with ${agent}/${decision.fallbackModel} (was ${resolveModel(agent, model)})`)

  notifyTaskRetrying({
    id: taskId,
    title: task.title,
    repo_path: task.repo_path,
    failed_agent: agent,
    failed_model: resolveModel(agent, model),
    error,
    retry_agent: agent,
    retry_model: decision.fallbackModel,
    attempt,
  })

  broadcast('task:retrying', {
    type: 'task:retrying',
    task_id: taskId,
    failed_model: resolveModel(agent, model),
    retry_model: decision.fallbackModel,
    attempt: attempt + 1,
    timestamp: new Date().toISOString(),
  })

  return true
}

/**
 * Cancel tasks that depend on a failed task.
 * Dependents can't run correctly without their prerequisite - running them
 * would just cause cascading failures. Cancel with context so discovery
 * can see the full picture and recreate the chain if needed.
 */
async function cancelDependents(failedTaskId: string, failedTitle: string): Promise<void> {
  try {
    const allPending = await queries.getTasks({ status: 'pending', limit: 200 })
    for (const task of allPending) {
      const deps = JSON.parse(task.depends_on ?? '[]') as string[]
      if (deps.includes(failedTaskId)) {
        await queries.updateTask(task.id, {
          status: 'cancelled',
          error: `Cancelled: dependency "${failedTitle}" (${failedTaskId.slice(0, 8)}) failed`,
          completed_at: new Date().toISOString(),
        })
        console.log(`[Dispatcher] Cancelled task ${task.id.slice(0, 8)} (dep ${failedTaskId.slice(0, 8)} failed)`)

        broadcast('task:failed', {
          type: 'task:failed',
          task_id: task.id,
          error: `Dependency failed: ${failedTitle}`,
          timestamp: new Date().toISOString(),
        })

        // Recursively cancel tasks that depended on this one too
        await cancelDependents(task.id, task.title)
      }
    }
  } catch (error) {
    console.error('[Dispatcher] Error cancelling dependents:', error)
  }
}

/**
 * Calculate current concurrency limit based on queue size.
 * Soft cap model: scales up when queue is large.
 */
function calculateConcurrencyLimit(config: SchedulerConfig, queueSize: number): number {
  const base = config.max_concurrent_tasks

  if (queueSize <= 5) {
    return base
  }

  // Scale up: base + queue/5
  const scaled = base + Math.floor(queueSize / 5)

  // Cap at ceiling
  return Math.min(scaled, config.max_concurrent_ceiling)
}

/**
 * Run a single task via the agent harness.
 */
async function runTask(task: Awaited<ReturnType<typeof queries.getTask>>): Promise<void> {
  if (!task) return

  const taskId = task.id
  const agent = (task.agent ?? 'claude') as 'claude' | 'codex' | 'gemini' | 'cline' | 'cursor'
  const model = task.model ?? undefined
  const repoPath = task.repo_path

  // Build context-enriched prompt
  const basePrompt = task.prompt ?? task.title
  const mycelContext = buildMycelContext({
    role: 'task_agent',
    agentId: agent,
    model,
    taskId,
    taskTitle: task.title,
  })
  const agentsSection = buildAgentsSection()
  const skillsSection = buildSkillsSection([], repoPath)
  const mcpSection = buildMcpSection(agent)

  // Inject previous error context if this is a retry
  const retryCtx = parseRetryContext(task.retry_context)
  let retrySection = ''
  if (retryCtx && retryCtx.history.length > 0) {
    const lastAttempt = retryCtx.history[retryCtx.history.length - 1]
    retrySection = `\n\n---\n\n**PREVIOUS ATTEMPT FAILED**\nA previous attempt with ${lastAttempt.agent}/${lastAttempt.model} failed with the following error. Learn from this and avoid the same mistake:\n\n\`\`\`\n${lastAttempt.error}\n\`\`\`\n`
  }

  // Compose full prompt with all context injections
  const prompt = `${basePrompt}${retrySection}

---

${mycelContext}

${agentsSection}
${skillsSection ? `\n${skillsSection}` : ''}
${mcpSection ? `\n${mcpSection}` : ''}`

  console.log(`[Dispatcher] Running task ${taskId.slice(0, 8)}: ${task.title}`)

  // Track running task
  runningTasks.set(taskId, Date.now())

  // Update task status to running
  const startTime = new Date().toISOString()
  await queries.updateTask(taskId, {
    status: 'running',
    started_at: startTime,
  })

  // Broadcast task started event
  broadcast('task:started', {
    type: 'task:started',
    task_id: taskId,
    agent,
    model,
    timestamp: startTime,
  })

  // Start logging for this task
  startTaskLog(taskId)

  try {
    // Dispatch to agent
    const result = await dispatch({
      agent,
      prompt,
      cwd: repoPath,
      model,
      taskId,
      timeout: task.timeout_seconds ?? undefined,
      onStart: (pid) => {
        // Store PID in spec_context for orphan detection after server restart
        queries.updateTask(taskId, {
          spec_context: JSON.stringify({ pid }),
        }).catch(() => {}) // fire-and-forget
      },
      onOutput: (chunk, stream = 'stdout') => {
        // Store in log buffer
        appendLog(taskId, chunk, stream)
        // Broadcast output chunks for streaming
        broadcast('task:output', {
          type: 'task:output',
          task_id: taskId,
          chunk,
          stream,
          timestamp: new Date().toISOString(),
        })
      },
    })

    const completedTime = new Date().toISOString()

    if (result.success) {
      // Task completed successfully
      await queries.updateTask(taskId, {
        status: 'done',
        result: result.output,
        cost_usd: result.cost_usd,
        duration_seconds: result.duration_seconds,
        completed_at: completedTime,
      })

      broadcast('task:completed', {
        type: 'task:completed',
        task_id: taskId,
        duration_seconds: result.duration_seconds,
        cost_usd: result.cost_usd,
        timestamp: completedTime,
      })

      console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} completed successfully`)

      // Auto-notify via Telegram
      notifyTaskComplete({
        id: taskId, title: task.title, status: 'done', repo_path: repoPath,
        agent, model, cost_usd: result.cost_usd, duration_seconds: result.duration_seconds,
        created_at: task.created_at, completed_at: completedTime,
      })

      // Record fruiting session with full log buffer
      const logEntries = getTaskLogEntries(taskId)
      queries.createFruitingSession({
        task_id: taskId, repo_path: repoPath, agent, model,
        context_trace: {
          layers: [
            { name: 'basePrompt', size: basePrompt.length },
            { name: 'mycelContext', size: mycelContext.length },
            { name: 'agentsSection', size: agentsSection.length },
            { name: 'skillsSection', size: skillsSection.length },
            { name: 'mcpSection', size: mcpSection.length },
          ],
          total_size: prompt.length,
        },
        full_prompt: prompt,
        session_log: logEntries ?? undefined,
      }).catch((e) => console.error('[Dispatcher] Failed to record fruiting session:', e))
    } else {
      // Task failed - check if we should retry with a fallback model
      const retried = await handleRetry(
        taskId, task, agent, model,
        result.output, result.duration_seconds ?? null,
      )

      // Record fruiting session with full log buffer (even on failure/retry)
      const logEntries = getTaskLogEntries(taskId)
      queries.createFruitingSession({
        task_id: taskId, repo_path: repoPath, agent, model,
        context_trace: {
          layers: [
            { name: 'basePrompt', size: basePrompt.length },
            { name: 'mycelContext', size: mycelContext.length },
            { name: 'agentsSection', size: agentsSection.length },
            { name: 'skillsSection', size: skillsSection.length },
            { name: 'mcpSection', size: mcpSection.length },
          ],
          total_size: prompt.length,
        },
        full_prompt: prompt,
        session_log: logEntries ?? undefined,
      }).catch((e) => console.error('[Dispatcher] Failed to record fruiting session:', e))

      if (!retried) {
        // No retry available - follow normal failure flow
        await queries.updateTask(taskId, {
          status: 'failed',
          error: result.output,
          duration_seconds: result.duration_seconds,
          completed_at: completedTime,
        })

        broadcast('task:failed', {
          type: 'task:failed',
          task_id: taskId,
          error: result.output.slice(0, 500),
          timestamp: completedTime,
        })

        console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} failed: ${result.output.slice(0, 100)}`)

        notifyTaskFailed({
          id: taskId, title: task.title, status: 'failed', repo_path: repoPath,
          agent, model, error: result.output, duration_seconds: result.duration_seconds,
          created_at: task.created_at, completed_at: completedTime,
        })

        // Cancel tasks that depended on this one
        await cancelDependents(taskId, task.title)
      }
    }
  } catch (error) {
    // Unexpected error - check if we should retry
    const errorMsg = error instanceof Error ? error.message : String(error)
    const completedTime = new Date().toISOString()

    console.error(`[Dispatcher] Task ${taskId.slice(0, 8)} dispatch error:`, error)

    const retried = await handleRetry(
      taskId, task, agent, model, errorMsg, null,
    )

    if (!retried) {
      await queries.updateTask(taskId, {
        status: 'failed',
        error: errorMsg,
        completed_at: completedTime,
      })

      broadcast('task:failed', {
        type: 'task:failed',
        task_id: taskId,
        error: errorMsg,
        error_type: 'dispatch_error',
        timestamp: completedTime,
      })

      // Cancel tasks that depended on this one
      await cancelDependents(taskId, task.title)

      notifyTaskFailed({
        id: taskId, title: task.title, status: 'failed', repo_path: repoPath,
        agent, model, error: errorMsg,
        created_at: task.created_at, completed_at: completedTime,
      })
    }
  } finally {
    // Remove from running tasks
    runningTasks.delete(taskId)
    // Mark log as complete
    completeTaskLog(taskId)
  }
}

/**
 * Get current running task count.
 */
export function getRunningTaskCount(): number {
  return runningTasks.size
}

/**
 * Run the dispatcher cycle.
 */
export async function runDispatcherCycle(config: SchedulerConfig): Promise<void> {
  console.log('[Dispatcher] Starting cycle...')

  // Get pending tasks that are ready to run
  const readyTasks = await queries.getReadyTasks(20)

  if (readyTasks.length === 0) {
    console.log('[Dispatcher] No tasks ready to run')
    return
  }

  console.log(`[Dispatcher] Found ${readyTasks.length} ready tasks`)

  // Calculate concurrency limit
  const limit = calculateConcurrencyLimit(config, readyTasks.length)
  const currentRunning = getRunningTaskCount()
  const availableSlots = limit - currentRunning

  if (availableSlots <= 0) {
    console.log(`[Dispatcher] At concurrency limit (${currentRunning}/${limit})`)
    return
  }

  // Take as many tasks as we have slots for
  const tasksToRun = readyTasks.slice(0, availableSlots)

  console.log(`[Dispatcher] Running ${tasksToRun.length} tasks (${currentRunning + tasksToRun.length}/${limit} concurrent)`)

  // Run tasks in parallel (fire and forget)
  // Each task manages its own lifecycle
  for (const task of tasksToRun) {
    // Don't await - run in background
    runTask(task).catch((error) => {
      console.error(`[Dispatcher] Background task error for ${task.id}:`, error)
    })
  }
}

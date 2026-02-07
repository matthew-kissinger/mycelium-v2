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

import { SchedulerConfig, type AgentType } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { extractError, recordSuccess, recordFailure, isAgentAvailable } from '../../agents/health'
import { broadcast } from '../../sse'
import { startTaskLog, appendLog, completeTaskLog, getTaskLogEntries } from '../../logs'
import {
  buildMycelContext,
  buildAgentsSectionWithCredits,
  buildSkillsSection,
  buildMcpSection,
  buildMemorySection,
  selectTaskSkills,
  detectAllSkillsForRepo,
} from '../../prompts/context'
import { getTelegramService } from '../../telegram'
import { formatTaskCompleted, formatTaskFailed, formatTaskRetrying, type TaskInfo, type TaskRetryInfo } from '../../telegram/messages'
import { bufferTaskEvent } from '../../telegram/buffer'
import { shouldRetry, buildRetryContext, parseRetryContext, resolveModel } from '../../agents/fallback'
import { prepareWorkspace, cleanupWorkspace, captureWorktreeDiff, pushBranchToGithub } from '../../agents/workspace'
import { parseAgentOutput, parseClaudeSessionId } from '../../agents/output-parser'

// Track currently running tasks (task_id -> {start time, agent, repo})
const runningTasks = new Map<string, { startTime: number; agent: string; repoPath: string }>()

// Maximum concurrent tasks per repo (prevents worktree conflicts)
const MAX_PER_REPO = 3

// Atomic repo slot counter - prevents race between filter and runTask
const repoSlots = new Map<string, number>()

/** Acquire a repo concurrency slot. Returns false if at limit. */
function acquireRepoSlot(repoPath: string): boolean {
  const current = (repoSlots.get(repoPath) ?? 0) + getRunningTasksForRepo(repoPath)
  if (current >= MAX_PER_REPO) return false
  repoSlots.set(repoPath, (repoSlots.get(repoPath) ?? 0) + 1)
  return true
}

/** Release a repo concurrency slot. */
function releaseRepoSlot(repoPath: string): void {
  const current = repoSlots.get(repoPath) ?? 0
  if (current <= 1) {
    repoSlots.delete(repoPath)
  } else {
    repoSlots.set(repoPath, current - 1)
  }
}

/**
 * Subscription agents to use as defaults for unassigned tasks.
 * Rotates through them to maximize paid subscriptions.
 * Free agents are for simple tasks assigned explicitly by discovery.
 */
const DEFAULT_AGENTS = ['claude', 'cursor', 'codex', 'gemini', 'copilot', 'kiro'] as const
let defaultAgentIndex = 0

/**
 * Pick a subscription agent for tasks with no assigned agent.
 * Round-robins through subscription agents to maximize paid usage.
 */
function pickDefaultAgent(): string {
  const agent = DEFAULT_AGENTS[defaultAgentIndex % DEFAULT_AGENTS.length]
  defaultAgentIndex++
  return agent
}

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
  // Don't retry quota errors - upgrading model won't help, same quota applies
  const extracted = extractError(agent, error)
  if (extracted.errorType === 'quota') {
    console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} failed with quota error, skipping retry`)
    return false
  }

  const decision = shouldRetry(agent, model, task.retry_context)

  if (!decision.retry || !decision.fallbackModel) {
    return false
  }

  const retryContext = buildRetryContext(agent, model, error, durationSeconds, task.retry_context)
  const existing = parseRetryContext(task.retry_context)
  const attempt = existing ? existing.attempt : 0

  // Reset task to pending with upgraded model (and optionally different agent)
  const retryAgent = decision.fallbackAgent ?? agent
  const updateFields: Record<string, unknown> = {
    status: 'pending',
    model: decision.fallbackModel,
    error: null,
    result: null,
    started_at: null,
    completed_at: null,
    duration_seconds: null,
    cost_usd: null,
    retry_context: retryContext,
  }
  if (decision.fallbackAgent) {
    updateFields.agent = decision.fallbackAgent
  }
  await queries.updateTask(taskId, updateFields as any)

  console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} retrying with ${retryAgent}/${decision.fallbackModel} (was ${resolveModel(agent, model)})`)

  notifyTaskRetrying({
    id: taskId,
    title: task.title,
    repo_path: task.repo_path,
    failed_agent: agent,
    failed_model: resolveModel(agent, model),
    error,
    retry_agent: retryAgent,
    retry_model: decision.fallbackModel,
    attempt,
  })

  broadcast('task:retrying', {
    type: 'task:retrying',
    task_id: taskId,
    failed_agent: agent,
    retry_agent: retryAgent,
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
  const agent = (task.agent ?? pickDefaultAgent()) as AgentType
  const model = task.model ?? undefined
  const provider = (task as any).provider as 'openrouter' | 'cline' | undefined
  const repoPath = task.repo_path

  // Build context-enriched prompt
  const basePrompt = task.prompt ?? task.title

  // Fetch dependency results for tasks with depends_on
  let dependencySection = ''
  const depIds = JSON.parse(task.depends_on ?? '[]') as string[]
  if (depIds.length > 0) {
    const depSummaries: string[] = []
    for (const depId of depIds) {
      const depTask = await queries.getTask(depId)
      if (depTask && depTask.status === 'done') {
        const result = depTask.result ?? '(no result recorded)'
        const truncated = result.length > 500 ? result.slice(0, 500) + '...' : result
        depSummaries.push(`### Task #${depId.slice(0, 8)}: ${depTask.title} (by ${depTask.agent ?? 'unknown'})\n${truncated}`)
      }
    }
    if (depSummaries.length > 0) {
      dependencySection = `\n\n## Completed Dependencies\n${depSummaries.join('\n\n')}\n`
    }
  }

  const mycelContext = buildMycelContext({
    role: 'task_agent',
    agentId: agent,
    model,
    taskId,
    taskTitle: task.title,
  })
  // Use async version to include live credits/quota info
  const agentsSection = await buildAgentsSectionWithCredits()

  // Merge skills: explicit (from task) + keyword-matched + auto-detected
  const explicitSkills: string[] = JSON.parse((task as any).skills ?? '[]')
  const repoSkills = detectAllSkillsForRepo(repoPath)
  const keywordSkills = selectTaskSkills(repoSkills, task.title, task.prompt ?? undefined)
  // Dedup: explicit first, then keyword, fill remaining up to 5
  const mergedSkills = [...new Set([...explicitSkills, ...keywordSkills])]
  // Fill from repoSkills if under limit
  if (mergedSkills.length < 5) {
    for (const skill of repoSkills) {
      if (mergedSkills.length >= 5) break
      if (!mergedSkills.includes(skill)) mergedSkills.push(skill)
    }
  }
  const finalSkills = mergedSkills.slice(0, 5)

  const skillsSection = buildSkillsSection(finalSkills, repoPath)
  const mcpSection = buildMcpSection(agent)
  const memorySection = await buildMemorySection(repoPath)

  // Inject previous error context if this is a retry
  const retryCtx = parseRetryContext(task.retry_context)
  let retrySection = ''
  if (retryCtx && retryCtx.history.length > 0) {
    const lastAttempt = retryCtx.history[retryCtx.history.length - 1]
    retrySection = `\n\n---\n\n**PREVIOUS ATTEMPT FAILED**\nA previous attempt with ${lastAttempt.agent}/${lastAttempt.model} failed with the following error. Learn from this and avoid the same mistake:\n\n\`\`\`\n${lastAttempt.error}\n\`\`\`\n`
  }

  // Compose full prompt with all context injections
  const prompt = `${basePrompt}${dependencySection}${retrySection}

---

${mycelContext}

${agentsSection}
${skillsSection ? `\n${skillsSection}` : ''}
${mcpSection ? `\n${mcpSection}` : ''}
${memorySection ? `\n${memorySection}` : ''}`

  console.log(`[Dispatcher] Running task ${taskId.slice(0, 8)}: ${task.title}`)

  // Track running task
  runningTasks.set(taskId, { startTime: Date.now(), agent, repoPath })

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

  // Prepare isolated worktree workspace
  let worktreePath: string | null = null
  let branchName: string | null = null
  try {
    const workspace = await prepareWorkspace(taskId, repoPath)
    worktreePath = workspace.worktreePath
    branchName = workspace.branchName
    console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} using worktree: ${worktreePath}`)

    // Store worktree info immediately
    await queries.updateTask(taskId, {
      worktree_path: worktreePath,
      branch_name: branchName,
    })
  } catch (error) {
    console.error(`[Dispatcher] Failed to create worktree for task ${taskId.slice(0, 8)}, using repo directly:`, error)
    // Fall back to running in the original repo if worktree creation fails
  }

  // Use worktree path if available, otherwise fall back to repo path
  const workingDir = worktreePath ?? repoPath

  // Check for Claude session ID from a previous attempt (for --resume on retry)
  let resumeSessionId: string | undefined
  if (agent === 'claude' && task.retry_context) {
    try {
      const specCtx = task.spec_context ? JSON.parse(task.spec_context) : {}
      if (specCtx.session_id) {
        resumeSessionId = specCtx.session_id
        console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} resuming Claude session ${resumeSessionId}`)
      }
    } catch { /* ignore parse errors */ }
  }

  try {
    // Dispatch to agent
    const result = await dispatch({
      agent,
      prompt,
      cwd: workingDir,
      model,
      provider,
      taskId,
      sessionId: resumeSessionId,
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

    // Extract Claude session ID for potential resume on retry
    if (agent === 'claude') {
      const sessionId = parseClaudeSessionId(result.output)
      if (sessionId) {
        const existing = task.spec_context ? JSON.parse(task.spec_context) : {}
        await queries.updateTask(taskId, {
          spec_context: JSON.stringify({ ...existing, session_id: sessionId }),
        })
      }
    }

    if (result.success) {
      // Parse structured output markers from agent output
      const parsed = parseAgentOutput(result.output)

      // Task completed successfully - keep worktree for shepherd evaluation
      await queries.updateTask(taskId, {
        status: 'done',
        result: result.output,
        parsed_result: parsed ?? undefined,
        cost_usd: result.cost_usd,
        duration_seconds: result.duration_seconds,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
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

      // Push branch to GitHub (non-blocking, best-effort)
      if (branchName && worktreePath) {
        pushBranchToGithub(repoPath, branchName).then((pushResult) => {
          if (pushResult.pushed) {
            broadcast('github:push', {
              type: 'github:push' as const,
              repo_path: repoPath,
              branch: branchName!,
              task_id: taskId,
              timestamp: new Date().toISOString(),
            })
          }
        }).catch((e) => console.error(`[Dispatcher] GitHub push error for task ${taskId.slice(0, 8)}:`, e))
      }

      // Record success in health tracking
      recordSuccess(agent, model)

      // Auto-notify via Telegram (individual + buffer for batching)
      notifyTaskComplete({
        id: taskId, title: task.title, status: 'done', repo_path: repoPath,
        agent, model, cost_usd: result.cost_usd, duration_seconds: result.duration_seconds,
        created_at: task.created_at, completed_at: completedTime,
      })
      bufferTaskEvent(repoPath, {
        title: task.title, agent, status: 'done',
        duration_seconds: result.duration_seconds, cost_usd: result.cost_usd,
      })

      // Build context trace layers (shared between success/failure)
      const contextTrace = {
        layers: [
          { name: 'basePrompt', size: basePrompt.length },
          ...(dependencySection ? [{ name: 'dependencySection', size: dependencySection.length, dep_ids: depIds }] : []),
          { name: 'mycelContext', size: mycelContext.length },
          { name: 'agentsSection', size: agentsSection.length },
          { name: 'skillsSection', size: skillsSection.length },
          { name: 'mcpSection', size: mcpSection.length },
          ...(memorySection ? [{ name: 'memorySection', size: memorySection.length }] : []),
        ],
        total_size: prompt.length,
      }

      // Capture worktree diff for the fruiting session
      let worktreeDiff: { stat: string; diff: string; commits: number } | null = null
      if (worktreePath) {
        worktreeDiff = await captureWorktreeDiff(worktreePath)
      }

      // Record fruiting session with full log buffer and worktree diff
      const logEntries = getTaskLogEntries(taskId)
      queries.createFruitingSession({
        task_id: taskId, repo_path: repoPath, agent, model,
        context_trace: {
          ...contextTrace,
          ...(worktreeDiff ? {
            worktree_diff: worktreeDiff.stat,
            worktree_diff_full: worktreeDiff.diff,
            commit_count: worktreeDiff.commits,
          } : {}),
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
      const contextTrace = {
        layers: [
          { name: 'basePrompt', size: basePrompt.length },
          ...(dependencySection ? [{ name: 'dependencySection', size: dependencySection.length, dep_ids: depIds }] : []),
          { name: 'mycelContext', size: mycelContext.length },
          { name: 'agentsSection', size: agentsSection.length },
          { name: 'skillsSection', size: skillsSection.length },
          { name: 'mcpSection', size: mcpSection.length },
          ...(memorySection ? [{ name: 'memorySection', size: memorySection.length }] : []),
        ],
        total_size: prompt.length,
      }
      const logEntries = getTaskLogEntries(taskId)
      queries.createFruitingSession({
        task_id: taskId, repo_path: repoPath, agent, model,
        context_trace: contextTrace,
        full_prompt: prompt,
        session_log: logEntries ?? undefined,
      }).catch((e) => console.error('[Dispatcher] Failed to record fruiting session:', e))

      if (!retried) {
        // No retry available - follow normal failure flow
        // Extract meaningful error from agent output
        const { error: cleanError } = recordFailure(agent, model, result.output)

        await queries.updateTask(taskId, {
          status: 'failed',
          error: cleanError,
          duration_seconds: result.duration_seconds,
          completed_at: completedTime,
        })

        broadcast('task:failed', {
          type: 'task:failed',
          task_id: taskId,
          error: cleanError,
          timestamp: completedTime,
        })

        console.log(`[Dispatcher] Task ${taskId.slice(0, 8)} failed: ${cleanError}`)

        notifyTaskFailed({
          id: taskId, title: task.title, status: 'failed', repo_path: repoPath,
          agent, model, error: cleanError, duration_seconds: result.duration_seconds,
          created_at: task.created_at, completed_at: completedTime,
        })
        bufferTaskEvent(repoPath, {
          title: task.title, agent, status: 'failed',
          duration_seconds: result.duration_seconds,
        })

        // Cancel tasks that depended on this one
        await cancelDependents(taskId, task.title)

        // Cleanup worktree on final failure (no point keeping failed work)
        if (worktreePath) {
          cleanupWorkspace(taskId, repoPath).catch((e) =>
            console.error(`[Dispatcher] Worktree cleanup error for task ${taskId.slice(0, 8)}:`, e)
          )
        }
      } else if (worktreePath) {
        // Task is being retried - cleanup worktree so retry gets a fresh one
        cleanupWorkspace(taskId, repoPath).catch((e) =>
          console.error(`[Dispatcher] Worktree cleanup error for retry ${taskId.slice(0, 8)}:`, e)
        )
      }
    }
  } catch (error) {
    // Unexpected error - check if we should retry
    const errorMsg = error instanceof Error ? error.message : String(error)
    const completedTime = new Date().toISOString()

    console.error(`[Dispatcher] Task ${taskId.slice(0, 8)} dispatch error:`, error)

    // Record failure in health tracking
    recordFailure(agent, model, errorMsg)

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
      bufferTaskEvent(repoPath, {
        title: task.title, agent, status: 'failed',
      })

      // Cleanup worktree on final failure
      if (worktreePath) {
        cleanupWorkspace(taskId, repoPath).catch((e) =>
          console.error(`[Dispatcher] Worktree cleanup error for task ${taskId.slice(0, 8)}:`, e)
        )
      }
    } else if (worktreePath) {
      // Retry - cleanup worktree so retry gets a fresh one
      cleanupWorkspace(taskId, repoPath).catch((e) =>
        console.error(`[Dispatcher] Worktree cleanup error for retry ${taskId.slice(0, 8)}:`, e)
      )
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
 * Get count of currently running tasks for a specific repo.
 */
export function getRunningTasksForRepo(repoPath: string): number {
  let count = 0
  for (const info of runningTasks.values()) {
    if (info.repoPath === repoPath) count++
  }
  return count
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

  // Filter out tasks for unavailable agents (quota exceeded, etc.)
  const availableTasks = readyTasks.filter((task) => {
    const agent = task.agent ?? pickDefaultAgent()
    const model = task.model ?? undefined
    const availability = isAgentAvailable(agent, model)
    if (!availability.available) {
      console.log(`[Dispatcher] Skipping task ${task.id.slice(0, 8)} - ${agent}/${model ?? 'default'} unavailable: ${availability.reason}`)
      broadcast('task:skipped', {
        type: 'task:skipped',
        task_id: task.id,
        agent,
        reason: availability.reason ?? 'Agent unavailable',
        timestamp: new Date().toISOString(),
      })
      return false
    }
    return true
  })

  if (availableTasks.length === 0) {
    console.log('[Dispatcher] No tasks with available agents')
    return
  }

  // Calculate concurrency limit
  const limit = calculateConcurrencyLimit(config, availableTasks.length)
  const currentRunning = getRunningTaskCount()
  const availableSlots = limit - currentRunning

  if (availableSlots <= 0) {
    console.log(`[Dispatcher] At concurrency limit (${currentRunning}/${limit})`)
    return
  }

  // Atomically claim repo slots and dispatch tasks
  // This prevents the race where multiple tasks for the same repo
  // pass the filter before any of them start running
  let dispatched = 0
  for (const task of availableTasks) {
    if (dispatched >= availableSlots) break

    if (!acquireRepoSlot(task.repo_path)) {
      console.log(`[Dispatcher] Skipping task ${task.id.slice(0, 8)} - repo at limit (${MAX_PER_REPO}/${MAX_PER_REPO})`)
      continue
    }

    dispatched++
    // Don't await - run in background. Release slot in finally block.
    runTask(task).catch((error) => {
      console.error(`[Dispatcher] Background task error for ${task.id}:`, error)
    }).finally(() => {
      releaseRepoSlot(task.repo_path)
    })
  }

  if (dispatched === 0) {
    console.log('[Dispatcher] All repos at per-repo concurrency limit')
    return
  }

  console.log(`[Dispatcher] Running ${dispatched} tasks (${currentRunning + dispatched}/${limit} concurrent)`)
}

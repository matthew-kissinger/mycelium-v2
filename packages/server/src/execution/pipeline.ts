/**
 * Unified Task Execution Pipeline
 *
 * Single path for task execution used by both:
 * - Scheduler dispatcher cycle (automatic)
 * - API POST /tasks/:id/run (manual)
 *
 * Handles the full lifecycle:
 * 1. Worktree preparation
 * 2. Context building (deps, mycel, skills, MCP, memory, retry)
 * 3. Agent dispatch
 * 4. Result handling (success/failure/retry)
 * 5. Session recording
 * 6. Notifications
 */

import type { AgentType } from '@mycelium/shared'
import * as queries from '../db/queries'
import { dispatch } from '../agents/dispatch'
import { extractError, recordSuccess, recordFailure } from '../agents/health'
import { broadcast } from '../sse'
import { startTaskLog, appendLog, completeTaskLog, getTaskLogEntries } from '../logs'
import {
  buildMycelContext,
  buildSkillsSection,
  buildMcpSection,
  buildMemorySection,
  selectTaskSkills,
  detectAllSkillsForRepo,
} from '../prompts/context'
import { getTelegramService } from '../telegram'
import { formatTaskCompleted, formatTaskFailed, formatTaskRetrying, type TaskInfo, type TaskRetryInfo } from '../telegram/messages'
import { bufferTaskEvent } from '../telegram/buffer'
import { shouldRetry, buildRetryContext, parseRetryContext, resolveModel } from '../agents/fallback'
import { prepareWorkspace, cleanupWorkspace, captureWorktreeDiff, pushBranchToGithub } from '../agents/workspace'
import { parseAgentOutput, parseClaudeSessionId } from '../agents/output-parser'

// =============================================================================
// Types
// =============================================================================

/** Task record as returned by queries.getTask() */
export type TaskRecord = NonNullable<Awaited<ReturnType<typeof queries.getTask>>>

/** Options for pipeline execution */
export interface PipelineOptions {
  /** Called with PID after process spawns (for orphan detection) */
  onStart?: (pid: number) => void
  /** Called with output chunks for streaming */
  onOutput?: (chunk: string, stream?: 'stdout' | 'stderr') => void
  /** Called when task completes or fails */
  onComplete?: () => void
  /** If true, enable retry logic on failure. Scheduler sets true, API sets false. */
  enableRetry?: boolean
  /** If true, cancel dependent tasks on failure. Scheduler sets true, API sets false. */
  cancelDependents?: boolean
}

/** Result of pipeline execution */
export interface PipelineResult {
  success: boolean
  retried?: boolean
  error?: string
  duration_seconds?: number
  cost_usd?: number
}

// =============================================================================
// Prompt Building
// =============================================================================

/**
 * Build the full enriched prompt for a task.
 * Composes: base prompt + dependency results + retry context +
 * mycel context + skills + MCP + memory.
 */
export async function buildFullPrompt(
  task: TaskRecord,
  agent: string,
  model: string | undefined,
  worktreePath: string | null,
  branchName: string | null,
): Promise<{
  prompt: string
  basePrompt: string
  dependencySection: string
  mycelContext: string
  skillsSection: string
  mcpSection: string
  memorySection: string
  depIds: string[]
}> {
  const basePrompt = task.prompt ?? task.title
  const repoPath = task.repo_path

  // Fetch dependency results
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
    taskId: task.id,
    taskTitle: task.title,
    worktreePath: worktreePath ?? undefined,
    branchName: branchName ?? undefined,
  })

  // Merge skills: explicit (from task) + keyword-matched + auto-detected
  const explicitSkills: string[] = JSON.parse(task.skills ?? '[]')
  const repoSkills = detectAllSkillsForRepo(repoPath)
  const keywordSkills = selectTaskSkills(repoSkills, task.title, task.prompt ?? undefined)
  const mergedSkills = [...new Set([...explicitSkills, ...keywordSkills])]
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

  // Compose full prompt
  const prompt = `${basePrompt}${dependencySection}${retrySection}

---

${mycelContext}
${skillsSection ? `\n${skillsSection}` : ''}
${mcpSection ? `\n${mcpSection}` : ''}
${memorySection ? `\n${memorySection}` : ''}`

  return {
    prompt,
    basePrompt,
    dependencySection,
    mycelContext,
    skillsSection,
    mcpSection,
    memorySection,
    depIds,
  }
}

// =============================================================================
// Context Trace Building
// =============================================================================

function buildContextTrace(sections: {
  basePrompt: string
  dependencySection: string
  mycelContext: string
  skillsSection: string
  mcpSection: string
  memorySection: string
  depIds: string[]
  promptLength: number
}) {
  return {
    layers: [
      { name: 'basePrompt', size: sections.basePrompt.length },
      ...(sections.dependencySection ? [{ name: 'dependencySection', size: sections.dependencySection.length, dep_ids: sections.depIds }] : []),
      { name: 'mycelContext', size: sections.mycelContext.length },
      { name: 'skillsSection', size: sections.skillsSection.length },
      { name: 'mcpSection', size: sections.mcpSection.length },
      ...(sections.memorySection ? [{ name: 'memorySection', size: sections.memorySection.length }] : []),
    ],
    total_size: sections.promptLength,
  }
}

// =============================================================================
// Notification Helpers
// =============================================================================

function notifyTaskComplete(taskInfo: TaskInfo): void {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return
  const msg = formatTaskCompleted(taskInfo)
  telegram.sendMessage(msg).catch((e) => console.error('[Pipeline] Notify error:', e))
}

function notifyTaskFailed(taskInfo: TaskInfo): void {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return
  const msg = formatTaskFailed(taskInfo)
  telegram.sendMessage(msg).catch((e) => console.error('[Pipeline] Notify error:', e))
}

function notifyTaskRetrying(retryInfo: TaskRetryInfo): void {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return
  const msg = formatTaskRetrying(retryInfo)
  telegram.sendMessage(msg).catch((e) => console.error('[Pipeline] Notify error:', e))
}

// =============================================================================
// Retry Logic
// =============================================================================

/**
 * Handle retry logic for a failed task.
 * Returns true if the task was reset for retry.
 */
async function handleRetry(
  taskId: string,
  task: { title: string; repo_path: string; retry_context: string | null },
  agent: string,
  model: string | null | undefined,
  error: string,
  durationSeconds: number | null,
): Promise<boolean> {
  // Don't retry quota errors - upgrading model won't help
  const extracted = extractError(agent, error)
  if (extracted.errorType === 'quota') {
    console.log(`[Pipeline] Task ${taskId.slice(0, 8)} failed with quota error, skipping retry`)
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

  console.log(`[Pipeline] Task ${taskId.slice(0, 8)} retrying with ${retryAgent}/${decision.fallbackModel} (was ${resolveModel(agent, model)})`)

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
 */
async function cancelDependentTasks(failedTaskId: string, failedTitle: string): Promise<void> {
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
        console.log(`[Pipeline] Cancelled task ${task.id.slice(0, 8)} (dep ${failedTaskId.slice(0, 8)} failed)`)

        broadcast('task:failed', {
          type: 'task:failed',
          task_id: task.id,
          error: `Dependency failed: ${failedTitle}`,
          timestamp: new Date().toISOString(),
        })

        // Recursively cancel downstream dependents
        await cancelDependentTasks(task.id, task.title)
      }
    }
  } catch (error) {
    console.error('[Pipeline] Error cancelling dependents:', error)
  }
}

// =============================================================================
// Session Recording
// =============================================================================

function recordSession(
  taskId: string,
  repoPath: string,
  agent: string,
  model: string | undefined,
  contextTrace: ReturnType<typeof buildContextTrace>,
  prompt: string,
  worktreeDiff?: { stat: string; diff: string; commits: number } | null,
): void {
  const logEntries = getTaskLogEntries(taskId)
  queries.createFruitingSession({
    task_id: taskId,
    repo_path: repoPath,
    agent,
    model,
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
  }).catch((e) => console.error('[Pipeline] Failed to record fruiting session:', e))
}

// =============================================================================
// Success Handler
// =============================================================================

async function handleTaskSuccess(
  taskId: string,
  task: TaskRecord,
  agent: string,
  model: string | undefined,
  result: { output: string; cost_usd?: number; duration_seconds?: number; input_tokens?: number; output_tokens?: number },
  promptSections: Awaited<ReturnType<typeof buildFullPrompt>>,
  worktreePath: string | null,
  branchName: string | null,
): Promise<void> {
  const completedTime = new Date().toISOString()
  const repoPath = task.repo_path

  // Parse structured output markers
  const parsed = parseAgentOutput(result.output)

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

  console.log(`[Pipeline] Task ${taskId.slice(0, 8)} completed successfully`)

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
    }).catch((e) => console.error(`[Pipeline] GitHub push error for task ${taskId.slice(0, 8)}:`, e))
  }

  // Record success in health tracking
  recordSuccess(agent, model)

  // Telegram notifications
  notifyTaskComplete({
    id: taskId, title: task.title, status: 'done', repo_path: repoPath,
    agent, model, cost_usd: result.cost_usd, duration_seconds: result.duration_seconds,
    created_at: task.created_at, completed_at: completedTime,
  })
  bufferTaskEvent(repoPath, {
    title: task.title, agent, status: 'done',
    duration_seconds: result.duration_seconds, cost_usd: result.cost_usd,
  })

  // Build context trace and record session
  const contextTrace = buildContextTrace({
    ...promptSections,
    promptLength: promptSections.prompt.length,
  })

  let worktreeDiff: { stat: string; diff: string; commits: number } | null = null
  if (worktreePath) {
    worktreeDiff = await captureWorktreeDiff(worktreePath)
  }

  recordSession(taskId, repoPath, agent, model, contextTrace, promptSections.prompt, worktreeDiff)
}

// =============================================================================
// Failure Handler
// =============================================================================

async function handleTaskFailure(
  taskId: string,
  task: TaskRecord,
  agent: string,
  model: string | undefined,
  errorOutput: string,
  durationSeconds: number | null,
  promptSections: Awaited<ReturnType<typeof buildFullPrompt>>,
  worktreePath: string | null,
  options: PipelineOptions,
): Promise<boolean> {
  const repoPath = task.repo_path

  // Record session even on failure
  const contextTrace = buildContextTrace({
    ...promptSections,
    promptLength: promptSections.prompt.length,
  })
  recordSession(taskId, repoPath, agent, model, contextTrace, promptSections.prompt)

  // Retry logic (scheduler only by default)
  if (options.enableRetry !== false) {
    const retried = await handleRetry(
      taskId, task, agent, model, errorOutput, durationSeconds,
    )

    if (retried) {
      // Cleanup worktree so retry gets a fresh one
      if (worktreePath) {
        cleanupWorkspace(taskId, repoPath).catch((e) =>
          console.error(`[Pipeline] Worktree cleanup error for retry ${taskId.slice(0, 8)}:`, e)
        )
      }
      return true
    }
  }

  // No retry - follow normal failure flow
  const { error: cleanError } = recordFailure(agent, model, errorOutput)
  const completedTime = new Date().toISOString()

  await queries.updateTask(taskId, {
    status: 'failed',
    error: cleanError,
    duration_seconds: durationSeconds,
    completed_at: completedTime,
  })

  broadcast('task:failed', {
    type: 'task:failed',
    task_id: taskId,
    error: cleanError,
    timestamp: completedTime,
  })

  console.log(`[Pipeline] Task ${taskId.slice(0, 8)} failed: ${cleanError}`)

  notifyTaskFailed({
    id: taskId, title: task.title, status: 'failed', repo_path: repoPath,
    agent, model, error: cleanError, duration_seconds: durationSeconds,
    created_at: task.created_at, completed_at: completedTime,
  })
  bufferTaskEvent(repoPath, {
    title: task.title, agent, status: 'failed',
    duration_seconds: durationSeconds,
  })

  // Cancel dependent tasks
  if (options.cancelDependents !== false) {
    await cancelDependentTasks(taskId, task.title)
  }

  // Cleanup worktree on final failure
  if (worktreePath) {
    cleanupWorkspace(taskId, repoPath).catch((e) =>
      console.error(`[Pipeline] Worktree cleanup error for task ${taskId.slice(0, 8)}:`, e)
    )
  }

  return false
}

// =============================================================================
// Main Pipeline
// =============================================================================

/**
 * Execute a task through the full pipeline.
 *
 * Used by both the scheduler dispatcher and the API manual run endpoint.
 * Handles: worktree setup, prompt building, dispatch, result handling,
 * session recording, notifications, and retry logic.
 */
export async function executeTask(
  task: TaskRecord,
  agent: AgentType,
  model: string | undefined,
  provider: 'openrouter' | 'cline' | undefined,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const taskId = task.id
  const repoPath = task.repo_path

  console.log(`[Pipeline] Running task ${taskId.slice(0, 8)}: ${task.title}`)

  // Start logging
  startTaskLog(taskId)

  // Prepare isolated worktree workspace BEFORE building context
  let worktreePath: string | null = null
  let branchName: string | null = null
  try {
    const workspace = await prepareWorkspace(taskId, repoPath)
    worktreePath = workspace.worktreePath
    branchName = workspace.branchName
    console.log(`[Pipeline] Task ${taskId.slice(0, 8)} using worktree: ${worktreePath}`)

    await queries.updateTask(taskId, {
      worktree_path: worktreePath,
      branch_name: branchName,
    })
  } catch (error) {
    console.error(`[Pipeline] Failed to create worktree for task ${taskId.slice(0, 8)}, using repo directly:`, error)
  }

  const workingDir = worktreePath ?? repoPath

  // Build full enriched prompt
  const promptSections = await buildFullPrompt(task, agent, model, worktreePath, branchName)
  const { prompt } = promptSections

  // Check for Claude session ID from a previous attempt (for --resume on retry)
  let resumeSessionId: string | undefined
  if (agent === 'claude' && task.retry_context) {
    try {
      const specCtx = task.spec_context ? JSON.parse(task.spec_context) : {}
      if (specCtx.session_id) {
        resumeSessionId = specCtx.session_id
        console.log(`[Pipeline] Task ${taskId.slice(0, 8)} resuming Claude session ${resumeSessionId}`)
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
        // Store PID in spec_context for orphan detection
        queries.updateTask(taskId, {
          spec_context: JSON.stringify({ pid }),
        }).catch(() => {}) // fire-and-forget

        options.onStart?.(pid)
      },
      onOutput: (chunk, stream = 'stdout') => {
        appendLog(taskId, chunk, stream)
        broadcast('task:output', {
          type: 'task:output',
          task_id: taskId,
          chunk,
          stream,
          timestamp: new Date().toISOString(),
        })
        options.onOutput?.(chunk, stream)
      },
    })

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
      await handleTaskSuccess(taskId, task, agent, model, result, promptSections, worktreePath, branchName)
      return {
        success: true,
        duration_seconds: result.duration_seconds,
        cost_usd: result.cost_usd,
      }
    } else {
      const retried = await handleTaskFailure(
        taskId, task, agent, model,
        result.output, result.duration_seconds ?? null,
        promptSections, worktreePath, options,
      )
      return {
        success: false,
        retried,
        error: result.output,
        duration_seconds: result.duration_seconds,
      }
    }
  } catch (error) {
    // Unexpected error (dispatch throw, not agent failure)
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Pipeline] Task ${taskId.slice(0, 8)} dispatch error:`, error)

    // Record failure in health tracking
    recordFailure(agent, model, errorMsg)

    if (options.enableRetry !== false) {
      const retried = await handleRetry(
        taskId, task, agent, model, errorMsg, null,
      )

      if (retried) {
        if (worktreePath) {
          cleanupWorkspace(taskId, repoPath).catch((e) =>
            console.error(`[Pipeline] Worktree cleanup error for retry ${taskId.slice(0, 8)}:`, e)
          )
        }
        return { success: false, retried: true, error: errorMsg }
      }
    }

    const completedTime = new Date().toISOString()
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

    if (options.cancelDependents !== false) {
      await cancelDependentTasks(taskId, task.title)
    }

    notifyTaskFailed({
      id: taskId, title: task.title, status: 'failed', repo_path: repoPath,
      agent, model, error: errorMsg,
      created_at: task.created_at, completed_at: completedTime,
    })
    bufferTaskEvent(repoPath, {
      title: task.title, agent, status: 'failed',
    })

    if (worktreePath) {
      cleanupWorkspace(taskId, repoPath).catch((e) =>
        console.error(`[Pipeline] Worktree cleanup error for task ${taskId.slice(0, 8)}:`, e)
      )
    }

    return { success: false, error: errorMsg }
  } finally {
    completeTaskLog(taskId)
    options.onComplete?.()
  }
}

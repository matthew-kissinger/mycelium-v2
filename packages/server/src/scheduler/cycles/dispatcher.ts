/**
 * Dispatcher Cycle - runs ready tasks
 *
 * Responsibilities:
 * - Get pending sequenced tasks with resolved dependencies
 * - Check concurrency limits (soft cap with dynamic scaling)
 * - Dispatch tasks via the unified execution pipeline
 * - Track running tasks for concurrency management
 */

import { SchedulerConfig, type AgentType } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { isAgentAvailable } from '../../agents/health'
import { getCachedEnabledAgents } from '../../agents/registry-cache'
import { broadcast } from '../../sse'
import { executeTask } from '../../execution/pipeline'

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
 */
const FALLBACK_DEFAULT_AGENTS = ['claude', 'cursor', 'codex', 'gemini', 'copilot', 'kiro'] as const
let defaultAgentIndex = 0

function getDefaultAgents(): string[] {
  const enabledAgents = getCachedEnabledAgents()
  if (enabledAgents.length > 0) {
    return enabledAgents.map(a => a.id)
  }
  return [...FALLBACK_DEFAULT_AGENTS]
}

/** Pick a subscription agent for tasks with no assigned agent. */
function pickDefaultAgent(): string {
  const agents = getDefaultAgents()
  const agent = agents[defaultAgentIndex % agents.length]
  defaultAgentIndex++
  return agent
}

/**
 * Calculate current concurrency limit based on queue size.
 */
function calculateConcurrencyLimit(config: SchedulerConfig, queueSize: number): number {
  const base = config.max_concurrent_tasks
  if (queueSize <= 5) return base
  const scaled = base + Math.floor(queueSize / 5)
  return Math.min(scaled, config.max_concurrent_ceiling)
}

/**
 * Run a single task via the unified pipeline.
 */
async function runTask(task: Awaited<ReturnType<typeof queries.getTask>>): Promise<void> {
  if (!task) return

  const taskId = task.id
  const agent = (task.agent ?? pickDefaultAgent()) as AgentType
  const model = task.model ?? undefined
  const provider = task.provider as 'openrouter' | 'cline' | undefined

  // Track running task
  runningTasks.set(taskId, { startTime: Date.now(), agent, repoPath: task.repo_path })

  // Update task status to running
  const startTime = new Date().toISOString()
  await queries.updateTask(taskId, {
    status: 'running',
    started_at: startTime,
  })

  broadcast('task:started', {
    type: 'task:started',
    task_id: taskId,
    agent,
    model,
    timestamp: startTime,
  })

  try {
    await executeTask(task, agent, model, provider, {
      enableRetry: true,
      cancelDependents: true,
    })
  } finally {
    runningTasks.delete(taskId)
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

  const readyTasks = await queries.getReadyTasks(20)

  if (readyTasks.length === 0) {
    console.log('[Dispatcher] No tasks ready to run')
    return
  }

  console.log(`[Dispatcher] Found ${readyTasks.length} ready tasks`)

  // Filter out tasks for unavailable agents
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

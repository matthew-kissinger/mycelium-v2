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

// Track currently running tasks (task_id -> start time)
const runningTasks = new Map<string, number>()

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
  const prompt = task.prompt ?? task.title
  const repoPath = task.repo_path

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

  try {
    // Dispatch to agent
    const result = await dispatch({
      agent,
      prompt,
      cwd: repoPath,
      model,
      onOutput: (chunk) => {
        // Broadcast output chunks for streaming
        broadcast('task:output', {
          type: 'task:output',
          task_id: taskId,
          chunk,
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
    } else {
      // Task failed
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
    }
  } catch (error) {
    // Unexpected error
    const errorMsg = error instanceof Error ? error.message : String(error)
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

    console.error(`[Dispatcher] Task ${taskId.slice(0, 8)} dispatch error:`, error)
  } finally {
    // Remove from running tasks
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

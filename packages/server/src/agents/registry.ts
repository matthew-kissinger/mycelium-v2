/**
 * Process Registry for Agent Cleanup
 *
 * Tracks all running agent processes for proper cleanup on:
 * - Task cancellation
 * - Server shutdown (SIGINT/SIGTERM)
 *
 * Based on v1 implementation in mycelium/src/mycelium/backend/agents.py
 */

import { Subprocess } from 'bun'
import { db, schema } from '../db'
import { eq } from 'drizzle-orm'
import * as queries from '../db/queries'
import { broadcast } from '../sse'

// =============================================================================
// Types
// =============================================================================

export interface ProcessInfo {
  process: Subprocess<'ignore', 'pipe', 'pipe'>
  pid: number
  agent: string
  workspace: string
  startedAt: Date
}

// =============================================================================
// Registry State
// =============================================================================

// Map of task_id -> process info
const runningProcesses = new Map<string, ProcessInfo>()

// =============================================================================
// Core Registry Functions
// =============================================================================

/**
 * Register a running agent process for tracking.
 * Called when dispatch spawns a new agent.
 */
export function registerProcess(
  taskId: string,
  process: Subprocess<'ignore', 'pipe', 'pipe'>,
  agent: string,
  workspace: string
): void {
  const pid = process.pid
  if (!pid) {
    console.error(`[REGISTRY] Cannot register process without PID for task=${taskId.slice(0, 8)}`)
    return
  }

  runningProcesses.set(taskId, {
    process,
    pid,
    agent,
    workspace,
    startedAt: new Date(),
  })

  console.log(`[REGISTRY] Registered task=${taskId.slice(0, 8)}, pid=${pid}, agent=${agent}`)
}

/**
 * Unregister a completed agent process.
 * Called when dispatch completes (success or failure).
 */
export function unregisterProcess(taskId: string): void {
  const info = runningProcesses.get(taskId)
  if (info) {
    console.log(`[REGISTRY] Unregistered task=${taskId.slice(0, 8)}, pid=${info.pid}`)
    runningProcesses.delete(taskId)
  }
}

/**
 * Get count of running agent processes.
 */
export function getRunningProcessCount(): number {
  return runningProcesses.size
}

/**
 * Get info about all running processes.
 */
export function getRunningProcesses(): Map<string, ProcessInfo> {
  return new Map(runningProcesses)
}

// =============================================================================
// Process Termination
// =============================================================================

/**
 * Graceful terminate timeout in milliseconds.
 * If process doesn't exit after SIGTERM, we SIGKILL.
 */
const GRACEFUL_TIMEOUT_MS = 5000

/**
 * Kill a single agent process by task ID.
 * Used for task cancellation.
 *
 * Returns true if process was found and killed.
 */
export async function killProcess(taskId: string): Promise<boolean> {
  const info = runningProcesses.get(taskId)
  if (!info) {
    console.log(`[REGISTRY] No process found for task=${taskId.slice(0, 8)}`)
    return false
  }

  console.log(`[REGISTRY] Killing task=${taskId.slice(0, 8)}, pid=${info.pid}, agent=${info.agent}`)

  try {
    // Try graceful termination first
    info.process.kill('SIGTERM')

    // Wait for graceful exit or force kill after timeout
    const killed = await Promise.race([
      waitForProcessExit(info.process, info.pid),
      timeout(GRACEFUL_TIMEOUT_MS).then(() => false),
    ])

    if (!killed) {
      console.log(`[REGISTRY] Process ${info.pid} didn't exit gracefully, forcing SIGKILL`)
      info.process.kill('SIGKILL')

      // Try to kill with process.kill as backup
      try {
        process.kill(info.pid, 'SIGKILL')
      } catch (e) {
        // Process may already be dead
      }
    }

    // Handle Cline zombie cleanup if this is a Cline agent
    if (info.agent === 'cline') {
      await killClineZombies(info.workspace)
    }

    runningProcesses.delete(taskId)
    return true
  } catch (error) {
    console.error(`[REGISTRY] Error killing process for task=${taskId.slice(0, 8)}:`, error)
    runningProcesses.delete(taskId)
    return false
  }
}

/**
 * Kill all running agent processes.
 * Called on server shutdown.
 *
 * Returns number of processes killed.
 */
export async function killAllProcesses(): Promise<number> {
  const count = runningProcesses.size
  if (count === 0) {
    console.log('[REGISTRY] No processes to kill')
    return 0
  }

  console.log(`[REGISTRY] Killing ${count} running processes...`)

  const taskIds = Array.from(runningProcesses.keys())

  // Kill all processes in parallel
  await Promise.all(
    taskIds.map(async (taskId) => {
      const info = runningProcesses.get(taskId)
      if (!info) return

      try {
        // Graceful termination
        info.process.kill('SIGTERM')
      } catch (e) {
        // Ignore errors, process may already be dead
      }
    })
  )

  // Wait briefly for graceful exits
  await timeout(1000)

  // Force kill any remaining
  for (const taskId of taskIds) {
    const info = runningProcesses.get(taskId)
    if (info) {
      try {
        info.process.kill('SIGKILL')
        process.kill(info.pid, 'SIGKILL')
      } catch (e) {
        // Ignore, process may be dead
      }
    }
  }

  // Clean up any Cline zombies globally
  await killAllClineZombies()

  runningProcesses.clear()
  console.log(`[REGISTRY] Killed ${count} processes`)

  return count
}

// =============================================================================
// Cline Zombie Cleanup
// =============================================================================

/**
 * Kill Cline daemon processes for a specific workspace.
 *
 * Cline spawns cline-host and cline-core as background daemons (parent PID 1).
 * Simply killing the cline CLI process doesn't kill these daemons.
 * We use the platform module for cross-platform process killing.
 */
async function killClineZombies(workspace: string): Promise<void> {
  console.log(`[REGISTRY] Killing Cline zombies for workspace: ${workspace}`)

  try {
    // Import platform utilities dynamically to avoid circular deps
    const { killProcessByPattern } = await import('../platform')

    // Kill cline-host processes for this workspace
    await killProcessByPattern(`cline-host.*${workspace}`)

    // Kill cline-core processes (they are paired with host)
    await killProcessByPattern('cline-core')

    console.log(`[REGISTRY] Killed Cline daemons for workspace: ${workspace}`)
  } catch (error) {
    console.error(`[REGISTRY] Error killing Cline zombies:`, error)
  }
}

/**
 * Kill ALL Cline daemon processes (global cleanup on shutdown).
 */
async function killAllClineZombies(): Promise<void> {
  console.log('[REGISTRY] Killing all Cline zombie processes...')

  try {
    const { killProcessByPattern } = await import('../platform')

    // Kill all cline-host processes
    await Promise.race([
      killProcessByPattern('cline-host'),
      timeout(5000),
    ])

    // Kill all cline-core processes
    await Promise.race([
      killProcessByPattern('cline-core'),
      timeout(5000),
    ])
  } catch (error) {
    // Ignore errors - no processes may match
  }
}

// =============================================================================
// Dependency Clearing
// =============================================================================

/**
 * Clear task dependencies when a task is cancelled.
 * Removes the cancelled task from the depends_on list of all pending tasks.
 *
 * This prevents dependent tasks from being blocked forever when a task is cancelled.
 */
export async function clearDependencies(cancelledTaskIds: string[]): Promise<number> {
  if (cancelledTaskIds.length === 0) return 0

  const cancelledSet = new Set(cancelledTaskIds)

  // Get all pending tasks
  const allTasks = await queries.getTasks({ limit: 1000 })
  const pendingTasks = allTasks.filter((t) => t.status === 'pending')

  let unblocked = 0

  for (const task of pendingTasks) {
    const deps = JSON.parse(task.depends_on ?? '[]') as string[]
    if (deps.length === 0) continue

    // Filter out cancelled dependencies
    const newDeps = deps.filter((d) => !cancelledSet.has(d))

    if (newDeps.length < deps.length) {
      await queries.updateTask(task.id, {
        depends_on: newDeps,
      })
      unblocked++
      console.log(
        `[REGISTRY] Unblocked task=${task.id.slice(0, 8)}: removed ${deps.length - newDeps.length} cancelled deps`
      )
    }
  }

  if (unblocked > 0) {
    console.log(`[REGISTRY] Unblocked ${unblocked} tasks by clearing cancelled dependencies`)
  }

  return unblocked
}

// =============================================================================
// Shutdown Handler
// =============================================================================

/**
 * Full shutdown cleanup.
 * Kills all processes, marks running tasks as cancelled, and clears dependencies.
 */
export async function shutdown(): Promise<void> {
  console.log('[REGISTRY] Starting shutdown cleanup...')

  // Get running task IDs before killing
  const runningTaskIds = Array.from(runningProcesses.keys())

  // Kill all processes
  const killed = await killAllProcesses()

  // Mark running tasks as cancelled in database
  const cancelledIds: string[] = []
  for (const taskId of runningTaskIds) {
    try {
      const task = await queries.getTask(taskId)
      if (task && task.status === 'running') {
        await queries.updateTask(taskId, {
          status: 'cancelled',
          error: 'Cancelled: backend shutdown',
          completed_at: new Date().toISOString(),
        })
        cancelledIds.push(taskId)
        broadcast('task:cancelled', { id: taskId, status: 'cancelled', reason: 'backend_shutdown' })
        console.log(`[REGISTRY] Cancelled task=${taskId.slice(0, 8)}`)
      }
    } catch (error) {
      console.error(`[REGISTRY] Error cancelling task=${taskId.slice(0, 8)}:`, error)
    }
  }

  // Clear dependencies on cancelled tasks
  if (cancelledIds.length > 0) {
    await clearDependencies(cancelledIds)
  }

  console.log(`[REGISTRY] Shutdown complete: killed ${killed} processes, cancelled ${cancelledIds.length} tasks`)
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Wait for a process to exit.
 */
async function waitForProcessExit(
  proc: Subprocess<'ignore', 'pipe', 'pipe'>,
  pid: number
): Promise<boolean> {
  try {
    await proc.exited
    return true
  } catch {
    return false
  }
}

/**
 * Simple timeout promise.
 */
function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

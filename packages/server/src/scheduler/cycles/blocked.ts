/**
 * Blocked Check Cycle - detect stuck tasks
 *
 * Responsibilities:
 * - Find tasks running longer than stale threshold (35 min)
 * - Detect process-dead orphans (no live process for running task)
 * - Mark as needs_attention after 3 hours
 * - Auto-cancel as orphaned after 4 hours
 * - Cancel pending tasks whose dependencies have failed/cancelled
 *
 * Process tracking: The dispatcher registers processes in the in-memory
 * registry via dispatch(). After server restart, the registry is empty,
 * so we fall back to the PID stored in spec_context.
 */

import { readFileSync } from 'fs'
import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { broadcast } from '../../sse'
import { getRunningProcesses } from '../../agents/registry'
import { getTelegramService } from '../../telegram'
import { getActiveRuns } from '../active-runs'

// Thresholds in minutes
const STALE_THRESHOLD_MINUTES = 35 // Higher than max agent timeout (30 min)
const NEEDS_ATTENTION_HOURS = 3
const ORPHAN_THRESHOLD_HOURS = 4

/**
 * Check if a process with the given PID is genuinely alive (not a zombie).
 * signal 0 returns true for zombies since the PID still exists in the
 * process table, so we check /proc/<pid>/status for State: Z on Linux.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }

  // Check for zombie state via /proc on Linux
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf-8')
    const stateMatch = status.match(/^State:\s+(\S)/m)
    if (stateMatch && stateMatch[1] === 'Z') {
      return false
    }
  } catch {
    // /proc not available (non-Linux) - fall back to signal 0 result
  }

  return true
}

/**
 * Extract stored PID from task's spec_context field.
 * Returns null if not stored or invalid.
 */
function getStoredPid(task: { spec_context: string | null }): number | null {
  if (!task.spec_context) return null
  try {
    const ctx = JSON.parse(task.spec_context)
    return typeof ctx.pid === 'number' ? ctx.pid : null
  } catch {
    return null
  }
}

/**
 * Run the Blocked Check cycle.
 */
export async function runBlockedCheckCycle(config: SchedulerConfig): Promise<void> {
  console.log('[BlockedCheck] Starting cycle...')

  // Get all running tasks
  const runningTasks = await queries.getTasks({ status: 'running', limit: 100 })

  if (runningTasks.length === 0) {
    console.log('[BlockedCheck] No running tasks')
    return
  }

  const now = Date.now()
  let staleCount = 0
  let needsAttentionCount = 0
  let orphanedCount = 0

  // Get tracked processes to detect orphans (running in DB but no process)
  const trackedProcesses = getRunningProcesses()

  for (const task of runningTasks) {
    if (!task.started_at) continue

    const startedAt = new Date(task.started_at).getTime()
    const runningMinutes = (now - startedAt) / (1000 * 60)
    const runningHours = runningMinutes / 60

    // Check for process-dead orphans: task is "running" but no tracked process
    // Only check after 2 minutes to allow for startup time
    if (runningMinutes >= 2 && !trackedProcesses.has(task.id)) {
      // Not in registry - check stored PID as post-restart fallback.
      // After server restart the registry is empty, but the agent process
      // may still be running with the PID we stored in spec_context.
      const storedPid = getStoredPid(task)
      if (storedPid && isProcessAlive(storedPid)) {
        console.log(`[BlockedCheck] Task ${task.id.slice(0, 8)} not in registry but PID ${storedPid} is alive (${runningMinutes.toFixed(0)}min) - skipping`)
        if (runningMinutes >= STALE_THRESHOLD_MINUTES) {
          staleCount++
        }
        continue
      }

      console.log(`[BlockedCheck] Task ${task.id.slice(0, 8)} has no tracked process after ${runningMinutes.toFixed(0)}min - marking as failed`)

      const errorMsg = `Orphaned - agent process exited without reporting result (ran ${runningMinutes.toFixed(0)}min)`
      await queries.updateTask(task.id, {
        status: 'failed',
        error: errorMsg,
        completed_at: new Date().toISOString(),
        duration_seconds: (now - startedAt) / 1000,
      })

      broadcast('task:cancelled', {
        type: 'task:cancelled',
        task_id: task.id,
        reason: 'process_dead',
        timestamp: new Date().toISOString(),
      })

      // Notify via Telegram
      const telegram = getTelegramService()
      if (telegram?.isConnected()) {
        const repoName = task.repo_path?.split('/').pop() || '?'
        telegram.sendMessage(
          `<b>Orphaned Task</b>\n<code>${task.id.slice(0, 8)}</code> [${task.agent}/${task.model}]\n${repoName}: ${task.title}\n\n${errorMsg}`
        ).catch(() => {})
      }

      orphanedCount++
      continue
    }

    // Check for orphaned tasks (4+ hours)
    if (runningHours >= (config.orphan_cancel_timeout_sec / 3600)) {
      console.log(`[BlockedCheck] Task ${task.id.slice(0, 8)} orphaned after ${runningHours.toFixed(1)}h - cancelling`)

      await queries.updateTask(task.id, {
        status: 'failed',
        error: `Orphaned - exceeded ${ORPHAN_THRESHOLD_HOURS}h runtime limit`,
        completed_at: new Date().toISOString(),
      })

      broadcast('task:cancelled', {
        type: 'task:cancelled',
        task_id: task.id,
        reason: 'orphaned',
        timestamp: new Date().toISOString(),
      })

      orphanedCount++
      continue
    }

    // Check for tasks needing attention (3+ hours)
    if (runningHours >= (config.blocked_task_timeout_sec / 3600)) {
      console.log(`[BlockedCheck] Task ${task.id.slice(0, 8)} needs attention - running ${runningHours.toFixed(1)}h`)

      // We could add a needs_attention field, or just log/notify
      // For now, we'll broadcast an event
      broadcast('agent:blocked', {
        type: 'agent:blocked',
        run_id: task.id,
        agent_type: 'task' as any, // Not a system agent, but using same event type
        reason: `Running for ${runningHours.toFixed(1)} hours`,
        timestamp: new Date().toISOString(),
      })

      needsAttentionCount++
      continue
    }

    // Check for stale tasks (35+ min - should have timed out)
    if (runningMinutes >= STALE_THRESHOLD_MINUTES) {
      console.log(`[BlockedCheck] Task ${task.id.slice(0, 8)} is stale - running ${runningMinutes.toFixed(0)}min`)
      staleCount++
    }
  }

  console.log(`[BlockedCheck] Checked ${runningTasks.length} running tasks: ${staleCount} stale, ${needsAttentionCount} need attention, ${orphanedCount} orphaned`)

  // Second pass: cancel pending tasks whose dependencies have failed/cancelled
  const cancelledFromDeps = await cancelTasksWithFailedDeps()
  if (cancelledFromDeps > 0) {
    console.log(`[BlockedCheck] Cancelled ${cancelledFromDeps} tasks with failed/cancelled dependencies`)
  }

  // Third pass: clean up orphaned system agent runs
  // Check for runs in DB that are 'running' but not in active runs map
  await cleanupOrphanedSystemAgentRuns()
}

/**
 * Clean up system agent runs that are marked as 'running' in the DB
 * but are not in the active runs map (meaning the process died).
 */
async function cleanupOrphanedSystemAgentRuns(): Promise<void> {
  try {
    const dbRunning = await queries.getRuns({ status: 'running', limit: 50 })
    const activeRuns = getActiveRuns()
    const activeRunIds = new Set(activeRuns.map(r => r.run_id))

    let cleaned = 0
    for (const run of dbRunning) {
      // If not in active runs map, it's orphaned
      if (!activeRunIds.has(run.id)) {
        const age = ((Date.now() - new Date(run.started_at).getTime()) / 60000).toFixed(0)

        // Only clean up if older than 5 minutes (to avoid race with startup)
        if (parseInt(age) < 5) continue

        console.log(`[BlockedCheck] Marking orphaned ${run.agent_type} run ${run.id.slice(0, 8)} as failed (${age}min old)`)

        await queries.failRun(run.id, `Orphaned - process not in active runs after ${age}min`)

        broadcast('agent:failed', {
          type: 'agent:failed',
          run_id: run.id,
          agent_type: run.agent_type,
          error: 'Orphaned - process died',
          timestamp: new Date().toISOString(),
        })

        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[BlockedCheck] Cleaned up ${cleaned} orphaned system agent runs`)
    }
  } catch (error) {
    console.error('[BlockedCheck] Error cleaning orphaned system agent runs:', error)
  }
}

/**
 * Cancel pending tasks whose dependencies have failed or been cancelled.
 * This catches tasks that were missed by the dispatcher's cancelDependents
 * (e.g. tasks created after a dependency failed, or deps cancelled by other means).
 * Returns the total number of tasks cancelled (including recursive dependents).
 */
async function cancelTasksWithFailedDeps(): Promise<number> {
  let cancelledCount = 0

  try {
    const pendingTasks = await queries.getTasks({ status: 'pending', limit: 200 })
    if (pendingTasks.length === 0) return 0

    for (const task of pendingTasks) {
      const deps = JSON.parse(task.depends_on ?? '[]') as string[]
      if (deps.length === 0) continue

      // Check each dependency's status
      for (const depId of deps) {
        let depTask: { status: string; title: string } | null = null
        try {
          depTask = await queries.getTask(depId)
        } catch {
          continue
        }

        if (!depTask) continue

        if (depTask.status === 'failed' || depTask.status === 'cancelled') {
          const reason = `Cancelled: dependency "${depTask.title}" (${depId.slice(0, 8)}) is ${depTask.status}`
          await queries.updateTask(task.id, {
            status: 'cancelled',
            error: reason,
            completed_at: new Date().toISOString(),
          })

          console.log(`[BlockedCheck] Cancelled ${task.id.slice(0, 8)} - dep ${depId.slice(0, 8)} ${depTask.status}`)

          broadcast('task:failed', {
            type: 'task:failed',
            task_id: task.id,
            error: `Dependency ${depTask.status}: ${depTask.title}`,
            timestamp: new Date().toISOString(),
          })

          // Notify via Telegram
          const telegram = getTelegramService()
          if (telegram?.isConnected()) {
            const repoName = task.repo_path?.split('/').pop() || '?'
            telegram.sendMessage(
              `<b>Dep Cancelled</b>\n<code>${task.id.slice(0, 8)}</code> [${task.agent}/${task.model}]\n${repoName}: ${task.title}\n\nDep <code>${depId.slice(0, 8)}</code> ${depTask.status}`
            ).catch(() => {})
          }

          cancelledCount++

          // Recursively cancel tasks that depend on this now-cancelled task
          cancelledCount += await cancelDependentsOfTask(task.id, task.title)
          break // No need to check other deps, task is already cancelled
        }
      }
    }
  } catch (error) {
    console.error('[BlockedCheck] Error checking failed dependencies:', error)
  }

  return cancelledCount
}

/**
 * Recursively cancel tasks that depend on a cancelled task.
 * Similar to dispatcher's cancelDependents but used by blocked check.
 */
async function cancelDependentsOfTask(cancelledTaskId: string, cancelledTitle: string): Promise<number> {
  let count = 0
  try {
    const pending = await queries.getTasks({ status: 'pending', limit: 200 })
    for (const task of pending) {
      const deps = JSON.parse(task.depends_on ?? '[]') as string[]
      if (deps.includes(cancelledTaskId)) {
        await queries.updateTask(task.id, {
          status: 'cancelled',
          error: `Cancelled: dependency "${cancelledTitle}" (${cancelledTaskId.slice(0, 8)}) cancelled`,
          completed_at: new Date().toISOString(),
        })

        console.log(`[BlockedCheck] Cascade cancelled ${task.id.slice(0, 8)} (dep ${cancelledTaskId.slice(0, 8)} cancelled)`)

        broadcast('task:failed', {
          type: 'task:failed',
          task_id: task.id,
          error: `Dependency cancelled: ${cancelledTitle}`,
          timestamp: new Date().toISOString(),
        })

        count++
        count += await cancelDependentsOfTask(task.id, task.title)
      }
    }
  } catch (error) {
    console.error('[BlockedCheck] Error cascading cancellations:', error)
  }
  return count
}


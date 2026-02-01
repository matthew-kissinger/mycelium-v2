/**
 * Blocked Check Cycle - detect stuck tasks
 *
 * Responsibilities:
 * - Find tasks running longer than stale threshold (35 min)
 * - Mark as needs_attention after 3 hours
 * - Auto-cancel as orphaned after 4 hours
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { broadcast } from '../../sse'

// Thresholds in minutes
const STALE_THRESHOLD_MINUTES = 35 // Higher than max agent timeout (30 min)
const NEEDS_ATTENTION_HOURS = 3
const ORPHAN_THRESHOLD_HOURS = 4

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

  for (const task of runningTasks) {
    if (!task.started_at) continue

    const startedAt = new Date(task.started_at).getTime()
    const runningMinutes = (now - startedAt) / (1000 * 60)
    const runningHours = runningMinutes / 60

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

  console.log(`[BlockedCheck] Checked ${runningTasks.length} tasks: ${staleCount} stale, ${needsAttentionCount} need attention, ${orphanedCount} orphaned`)
}

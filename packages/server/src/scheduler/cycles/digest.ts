/**
 * Digest Cycle - send status summaries
 *
 * Responsibilities:
 * - Aggregate stats since last digest
 * - Send notification with summary
 * - Could spawn a Digest agent for more intelligent summaries
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { getTelegramService } from '../../telegram'
import { formatDigestSummary } from '../../telegram/messages'

// Track last digest time
let lastDigestTime: Date | null = null

/**
 * Run the Digest cycle.
 */
export async function runDigestCycle(config: SchedulerConfig): Promise<void> {
  console.log('[Digest] Starting cycle...')

  // Get task stats
  const stats = await queries.getTaskStats()

  // Get recent tasks (since last digest or last 6 hours)
  const since = lastDigestTime ?? new Date(Date.now() - 6 * 60 * 60 * 1000)

  // Get completed tasks in period
  const doneTasks = await queries.getTasks({ status: 'done', limit: 100 })
  const recentDone = doneTasks.filter((t) => {
    if (!t.completed_at) return false
    return new Date(t.completed_at) > since
  })

  // Get failed tasks in period
  const failedTasks = await queries.getTasks({ status: 'failed', limit: 100 })
  const recentFailed = failedTasks.filter((t) => {
    if (!t.completed_at) return false
    return new Date(t.completed_at) > since
  })

  // Calculate period cost
  const periodCost = [...recentDone, ...recentFailed].reduce(
    (sum, t) => sum + (t.cost_usd ?? 0),
    0
  )

  // Build digest message
  const periodHours = Math.round((Date.now() - since.getTime()) / (1000 * 60 * 60))
  const message = buildDigestMessage({
    periodHours,
    completed: recentDone.length,
    failed: recentFailed.length,
    pending: stats.pending,
    running: stats.running,
    periodCost,
    totalCost: stats.total_cost_usd,
    successRate: stats.done > 0 ? (stats.done / (stats.done + stats.failed)) * 100 : 0,
  })

  console.log('[Digest] Summary:', message.split('\n')[0])

  // Collect active repos from recent tasks
  const allRecentTasks = [...recentDone, ...recentFailed]
  const activeRepoSet = new Set<string>()
  for (const t of allRecentTasks) {
    if (t.repo_path) activeRepoSet.add(t.repo_path)
  }

  // Get pending signals count
  const pendingSignals = await queries.getPendingSignals(100)

  // Send via Telegram
  const telegram = getTelegramService()
  if (telegram?.isConnected()) {
    const formatted = formatDigestSummary({
      period: `${periodHours}h`,
      total_tasks: recentDone.length + recentFailed.length,
      completed_tasks: recentDone.length,
      failed_tasks: recentFailed.length,
      total_cost_usd: periodCost,
      active_repos: Array.from(activeRepoSet),
      pending_signals: pendingSignals.length,
    })
    telegram.sendMessage(formatted).catch((e) => console.error('[Digest] Telegram notify error:', e))
  }

  // Update last digest time
  lastDigestTime = new Date()
}

interface DigestStats {
  periodHours: number
  completed: number
  failed: number
  pending: number
  running: number
  periodCost: number
  totalCost: number
  successRate: number
}

/**
 * Build a human-readable digest message.
 */
function buildDigestMessage(stats: DigestStats): string {
  const lines: string[] = []

  // Header
  lines.push(`[DIGEST] Last ${stats.periodHours}h Summary`)
  lines.push('')

  // Activity
  if (stats.completed > 0 || stats.failed > 0) {
    const total = stats.completed + stats.failed
    lines.push(`Completed: ${stats.completed}/${total} (${stats.successRate.toFixed(0)}% success)`)

    if (stats.failed > 0) {
      lines.push(`Failed: ${stats.failed}`)
    }
  } else {
    lines.push('No tasks completed in this period')
  }

  // Queue status
  lines.push('')
  lines.push(`Queue: ${stats.pending} pending, ${stats.running} running`)

  // Cost
  if (stats.periodCost > 0) {
    lines.push('')
    lines.push(`Period cost: $${stats.periodCost.toFixed(4)}`)
    lines.push(`Total cost: $${stats.totalCost.toFixed(4)}`)
  }

  return lines.join('\n')
}

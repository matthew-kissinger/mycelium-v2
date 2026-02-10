/**
 * Digest Cycle - intelligent status summaries
 *
 * Dispatches to Haiku with system data, lets it find what's interesting.
 * Outputs structured XML with health, trends, anomalies, recommendations.
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import { buildMycelContext } from '../../prompts/context'
import { buildDigestPrompt, parseDigestOutput, type DigestContext, type DigestOutput } from '../../prompts/digest'
import { getTelegramService } from '../../telegram'
import { getHealthSummary, checkOpenRouterCredits } from '../../agents/health'
import { registerActiveRun, unregisterActiveRun } from '../active-runs'

// Track last digest time and previous period data for comparison
let lastDigestTime: Date | null = null
let previousPeriodData: DigestContext['previousPeriod'] | null = null

/**
 * Run the Digest cycle.
 * Dispatches to Haiku for intelligent analysis.
 */
export async function runDigestCycle(config: SchedulerConfig): Promise<void> {
  console.log('[Digest] Starting cycle...')

  const now = new Date()

  // Calculate period since last digest (or 4 hours default)
  const since = lastDigestTime ?? new Date(Date.now() - 4 * 60 * 60 * 1000)
  const periodHours = Math.round((Date.now() - since.getTime()) / (1000 * 60 * 60))

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'digest',
    context: { period_hours: periodHours },
  })

  // Register active run
  registerActiveRun({
    run_id: run.id,
    agent_type: 'digest',
    started_at: now.toISOString(),
  })

  // Broadcast event
  broadcast('agent:started', {
    type: 'agent:started',
    run_id: run.id,
    agent_type: 'digest',
    timestamp: now.toISOString(),
  })

  try {
    // Build context for the agent
    const context = await buildDigestContext(since, periodHours)

    // Build prompt
    const mycelContext = buildMycelContext({
      role: 'digest',
      agentId: 'digest',
    })
    const prompt = buildDigestPrompt(context, mycelContext)

    // Collect session log entries
    const sessionLog: Array<{ chunk: string; stream: string; timestamp: string }> = []

    // Dispatch to Haiku (cheap and fast for analysis)
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: process.cwd(),
      model: 'haiku',
      timeout: 600, // 10 min should be plenty for digest
      onOutput: (chunk, stream = 'stdout') => {
        sessionLog.push({ chunk, stream, timestamp: new Date().toISOString() })
        broadcast('agent:output', {
          type: 'agent:output',
          run_id: run.id,
          agent_type: 'digest',
          chunk,
          stream,
          timestamp: new Date().toISOString(),
        })
      },
    })

    // Record fruiting session
    queries.createFruitingSession({
      task_id: run.id,
      repo_path: process.cwd(),
      agent: 'claude',
      model: 'haiku',
      context_trace: { agent_type: 'digest', period_hours: periodHours },
      full_prompt: prompt,
      session_log: sessionLog,
    }).catch((e) => console.error('[Digest] Failed to record fruiting session:', e))

    if (!result.success) {
      // Fallback to simple digest on agent failure
      console.log('[Digest] Agent failed, falling back to simple digest')
      await sendSimpleDigest(context)

      await queries.failRun(run.id, result.output.slice(0, 500))
      broadcast('agent:failed', {
        type: 'agent:failed',
        run_id: run.id,
        agent_type: 'digest',
        error: result.output.slice(0, 200),
        timestamp: new Date().toISOString(),
      })
    } else {
      // Parse output (XML with YAML fallback)
      const digestOutput = parseDigestOutput(result.output)

      if (digestOutput) {
        // Send digest via Telegram
        await sendDigest(context, digestOutput)
        console.log(`[Digest] ${digestOutput.health}: ${digestOutput.headline}`)
      } else {
        // Fallback if parsing fails
        console.log('[Digest] Could not parse agent output, sending simple digest')
        await sendSimpleDigest(context)
      }

      await queries.completeRun(run.id, result.output)
      broadcast('agent:completed', {
        type: 'agent:completed',
        run_id: run.id,
        agent_type: 'digest',
        duration_seconds: result.duration_seconds,
        health: digestOutput?.health,
        headline: digestOutput?.headline,
        recommendations_count: digestOutput?.recommendations?.length ?? 0,
        alerts_count: digestOutput?.alerts?.length ?? 0,
        anomalies_count: digestOutput?.anomalies?.length ?? 0,
        timestamp: new Date().toISOString(),
      })
    }

    // Save current period data for next comparison
    previousPeriodData = {
      completed: context.currentPeriod.completed,
      failed: context.currentPeriod.failed,
      costUsd: context.currentPeriod.costUsd,
    }

    // Update last digest time
    lastDigestTime = new Date()
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error('[Digest] Error:', error)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'digest',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  } finally {
    unregisterActiveRun(run.id)
  }
}

/**
 * Build context for the Digest agent.
 */
async function buildDigestContext(since: Date, periodHours: number): Promise<DigestContext> {
  // Get task stats
  const stats = await queries.getTaskStats()

  // Get completed tasks in period
  const doneTasks = await queries.getTasks({ status: 'done', limit: 200 })
  const recentDone = doneTasks.filter((t) => {
    if (!t.completed_at) return false
    return new Date(t.completed_at) > since
  })

  // Get failed tasks in period
  const failedTasks = await queries.getTasks({ status: 'failed', limit: 200 })
  const recentFailed = failedTasks.filter((t) => {
    if (!t.completed_at) return false
    return new Date(t.completed_at) > since
  })

  // Calculate period cost
  const allRecentTasks = [...recentDone, ...recentFailed]
  const periodCost = allRecentTasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0)

  // Collect active repos
  const activeRepoSet = new Set<string>()
  for (const t of allRecentTasks) {
    if (t.repo_path) activeRepoSet.add(t.repo_path)
  }

  // Group tasks by agent
  const byAgent = new Map<string, { completed: number; failed: number; costUsd: number }>()
  for (const t of recentDone) {
    const agent = t.agent ?? 'claude'
    const entry = byAgent.get(agent) ?? { completed: 0, failed: 0, costUsd: 0 }
    entry.completed++
    entry.costUsd += t.cost_usd ?? 0
    byAgent.set(agent, entry)
  }
  for (const t of recentFailed) {
    const agent = t.agent ?? 'claude'
    const entry = byAgent.get(agent) ?? { completed: 0, failed: 0, costUsd: 0 }
    entry.failed++
    entry.costUsd += t.cost_usd ?? 0
    byAgent.set(agent, entry)
  }

  // Group tasks by repo
  const byRepo = new Map<string, { completed: number; failed: number; pending: number }>()
  for (const t of recentDone) {
    if (!t.repo_path) continue
    const entry = byRepo.get(t.repo_path) ?? { completed: 0, failed: 0, pending: 0 }
    entry.completed++
    byRepo.set(t.repo_path, entry)
  }
  for (const t of recentFailed) {
    if (!t.repo_path) continue
    const entry = byRepo.get(t.repo_path) ?? { completed: 0, failed: 0, pending: 0 }
    entry.failed++
    byRepo.set(t.repo_path, entry)
  }

  // Add pending counts per repo
  const pendingTasks = await queries.getTasks({ status: 'pending', limit: 200 })
  for (const t of pendingTasks) {
    if (!t.repo_path) continue
    const entry = byRepo.get(t.repo_path) ?? { completed: 0, failed: 0, pending: 0 }
    entry.pending++
    byRepo.set(t.repo_path, entry)
  }

  // Get recent failures with details
  const recentFailures = recentFailed.slice(0, 15).map((t) => ({
    title: t.title,
    agent: t.agent ?? 'claude',
    model: t.model ?? undefined,
    error: t.error?.slice(0, 200),
    repo: t.repo_path,
  }))

  // Get agent health status
  const healthSummary = getHealthSummary()
  const agentHealth: DigestContext['agentHealth'] = {}
  for (const [key, h] of Object.entries(healthSummary)) {
    agentHealth[key] = {
      status: h.status as 'healthy' | 'degraded' | 'quota_exceeded' | 'error',
      reason: h.lastError,
    }
  }

  // Get pending signals
  const pendingSignals = await queries.getPendingSignals(100)

  // Get quota status
  let quotaStatus: DigestContext['quotaStatus']
  try {
    const orCredits = await checkOpenRouterCredits()
    const geminiHealth = Object.entries(healthSummary).find(([k]) => k.startsWith('gemini'))

    quotaStatus = {}
    if (orCredits) {
      quotaStatus.openrouter = {
        remaining: orCredits.remaining,
        limit: orCredits.limit,
      }
    }
    if (geminiHealth) {
      const [, h] = geminiHealth
      quotaStatus.gemini = {
        exceeded: h.status === 'quota_exceeded',
        resetAt: h.quotaResetAt,
      }
    }
  } catch {
    // Ignore errors
  }

  return {
    periodHours,
    currentPeriod: {
      completed: recentDone.length,
      failed: recentFailed.length,
      pending: stats.pending,
      running: stats.running,
      costUsd: periodCost,
      activeRepos: Array.from(activeRepoSet),
    },
    previousPeriod: previousPeriodData ?? undefined,
    tasksByAgent: Array.from(byAgent.entries()).map(([agent, data]) => ({
      agent,
      ...data,
    })),
    tasksByRepo: Array.from(byRepo.entries()).map(([repo, data]) => ({
      repo,
      ...data,
    })),
    recentFailures,
    agentHealth,
    pendingSignals: pendingSignals.length,
    quotaStatus,
  }
}

/**
 * Send digest via Telegram.
 */
async function sendDigest(context: DigestContext, output: DigestOutput): Promise<void> {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return

  const lines: string[] = []

  // Header with status indicator
  const statusEmoji = output.health === 'healthy' ? '🟢' : output.health === 'warning' ? '🟡' : '🔴'
  lines.push(`${statusEmoji} <b>DIGEST</b> (${context.periodHours}h)`)
  lines.push('')

  // Headline
  lines.push(`<b>${escapeHtml(output.headline)}</b>`)
  lines.push('')

  // Report (convert markdown to simple text)
  if (output.report) {
    const reportText = output.report
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')  // **bold** -> <b>bold</b>
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')       // *italic* -> <i>italic</i>
      .replace(/^- /gm, '• ')                      // - bullets -> •
      .replace(/^#{1,3} (.+)$/gm, '<b>$1</b>')   // headers -> bold
    lines.push(escapeHtml(reportText))
  }

  // Recommendations (high priority only)
  if (output.recommendations?.length) {
    const highPri = output.recommendations.filter(r => r.priority === 'high')
    if (highPri.length > 0) {
      lines.push('')
      lines.push('<b>Recommendations:</b>')
      for (const rec of highPri.slice(0, 3)) {
        lines.push(`• ${escapeHtml(rec.description)}`)
      }
    }
  }

  // Alerts
  if (output.alerts?.length) {
    lines.push('')
    for (const alert of output.alerts.slice(0, 3)) {
      lines.push(`⚠️ ${escapeHtml(alert.description)}`)
    }
  }

  // Quick stats footer
  lines.push('')
  const total = context.currentPeriod.completed + context.currentPeriod.failed
  const rate = total > 0 ? Math.round((context.currentPeriod.completed / total) * 100) : 0
  lines.push(`📊 ${context.currentPeriod.completed}/${total} (${rate}%) | 📋 ${context.currentPeriod.pending} pending`)

  // Pending signals reminder
  if (context.pendingSignals > 0) {
    lines.push(`📬 ${context.pendingSignals} signal${context.pendingSignals > 1 ? 's' : ''} waiting`)
  }

  await telegram.sendMessage(lines.join('\n')).catch((e) => {
    console.error('[Digest] Telegram send error:', e)
  })
}

/**
 * Send simple digest (fallback when agent fails).
 */
async function sendSimpleDigest(context: DigestContext): Promise<void> {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return

  const total = context.currentPeriod.completed + context.currentPeriod.failed
  const rate = total > 0 ? Math.round((context.currentPeriod.completed / total) * 100) : 0

  const lines = [
    `📊 <b>DIGEST</b> (${context.periodHours}h)`,
    '',
    `Completed: ${context.currentPeriod.completed}/${total} (${rate}%)`,
    `Pending: ${context.currentPeriod.pending}, Running: ${context.currentPeriod.running}`,
  ]

  if (context.currentPeriod.costUsd > 0) {
    lines.push(`Cost: $${context.currentPeriod.costUsd.toFixed(4)}`)
  }

  if (context.pendingSignals > 0) {
    lines.push('')
    lines.push(`📬 ${context.pendingSignals} signals waiting`)
  }

  await telegram.sendMessage(lines.join('\n')).catch((e) => {
    console.error('[Digest] Telegram send error:', e)
  })
}

/**
 * Escape HTML special characters for Telegram.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

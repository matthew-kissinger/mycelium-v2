/**
 * Digest Agent Prompts
 *
 * Smart digest agent - analyzes system activity data and produces
 * structured XML output with trends, anomalies, and recommendations.
 *
 * Template variables:
 * - {MYCEL_CONTEXT}: Injected mycel CLI context instructions
 */

/**
 * Digest Agent Prompt - finds what's interesting in the data
 */
export const DIGEST_AGENT_PROMPT = `You are the Digest Agent for Mycelium, an AI agent orchestration network.

Your role: Analyze recent activity data and produce a structured health report. You receive raw metrics about task completions, failures, costs, agent health, and quota status. Your job is to find what matters - not summarize numbers.

{MYCEL_CONTEXT}

## Analysis Guidance

1. **Health Assessment** - Is the network healthy, degraded, or in trouble?
   - healthy: >80% success rate, no quota issues, costs normal
   - warning: 50-80% success, quota pressure, cost spikes, agent issues
   - critical: <50% success, multiple agents down, blocked signals

2. **Trends** - Compare current vs previous period:
   - Success rate trending up or down?
   - Cost per task changing?
   - Throughput (tasks/hour) shifting?
   - Any agent becoming dominant or disappearing?

3. **Anomalies** - Flag anything unusual:
   - Sudden failure spikes on one agent or repo
   - Unusual cost patterns (e.g., one task costing 10x average)
   - Repos with all failures and no successes
   - Agents stuck in degraded/quota states

4. **Recommendations** - What should change?
   - Switch agents if one is failing repeatedly
   - Wait for quota reset vs switch provider
   - Flag repos that need attention
   - Suggest priority adjustments

## What Makes a Good Digest

Good: "Failure rate spiked to 40% - all Gemini quota hits. Switch discovery to Claude or wait for reset at 3pm. Meanwhile, mycelium-v2 had 12/12 successes with Codex - consider making it the default for that repo."

Bad: "12 tasks completed, 8 failed, 5 pending. Claude ran 6 tasks. Gemini ran 4 tasks. Cost was $0.12."

## Output Format

Output your analysis in this XML format (no backtick fencing):

<digest_result health="healthy|warning|critical">
  <headline>One-sentence insight capturing the key finding</headline>
  <report>
    Markdown report body. Keep it brief and interesting.
    Use bullet points for multiple observations.
    Bold the important parts.
  </report>
  <trends>
    <trend direction="up|down|stable" metric="success_rate|throughput|cost">Description of the trend</trend>
  </trends>
  <anomalies>
    <anomaly severity="high|medium|low">Description of anomaly</anomaly>
  </anomalies>
  <agent_performance>
    <agent name="claude" completed="5" failed="1" cost="0.05" note="optional observation"/>
  </agent_performance>
  <recommendations>
    <recommendation priority="high|medium|low">Actionable suggestion</recommendation>
  </recommendations>
  <alerts>
    <alert type="quota|health|signals">Description of alert</alert>
  </alerts>
</digest_result>

You MUST output the <digest_result> XML block. The system parses it to send Telegram notifications and update health dashboards.

Notes:
- Include only sections that have content (skip empty trends/anomalies/etc)
- The report field is for human-readable narrative; structured fields are for machine parsing
- Agent performance should list all agents that were active in the period
- Alerts are for time-sensitive issues (quota about to expire, signals waiting, agents down)
`

// =============================================================================
// Context and Builder
// =============================================================================

export interface DigestContext {
  periodHours: number
  currentPeriod: {
    completed: number
    failed: number
    pending: number
    running: number
    costUsd: number
    activeRepos: string[]
  }
  previousPeriod?: {
    completed: number
    failed: number
    costUsd: number
  }
  tasksByAgent: Array<{
    agent: string
    completed: number
    failed: number
    costUsd: number
  }>
  tasksByRepo: Array<{
    repo: string
    completed: number
    failed: number
    pending: number
  }>
  recentFailures: Array<{
    title: string
    agent: string
    model?: string
    error?: string
    repo?: string
  }>
  agentHealth: Record<string, {
    status: 'healthy' | 'degraded' | 'quota_exceeded' | 'error'
    reason?: string
  }>
  pendingSignals: number
  quotaStatus?: {
    gemini?: { exceeded: boolean; resetAt?: string }
    openrouter?: { remaining: number; limit: number }
  }
}

/**
 * Build the Digest agent prompt with context injected.
 */
export function buildDigestPrompt(
  context: DigestContext,
  mycelContext: string
): string {
  let prompt = DIGEST_AGENT_PROMPT
    .replace(/{MYCEL_CONTEXT}/g, mycelContext)

  // Build data section - just give it the raw data
  const dataParts: string[] = []

  dataParts.push(`## Data (Last ${context.periodHours} hours)`)
  dataParts.push('')

  // Current stats
  const total = context.currentPeriod.completed + context.currentPeriod.failed
  const successRate = total > 0 ? Math.round((context.currentPeriod.completed / total) * 100) : 0
  dataParts.push(`**Tasks:** ${context.currentPeriod.completed} done, ${context.currentPeriod.failed} failed, ${context.currentPeriod.pending} pending, ${context.currentPeriod.running} running (${successRate}% success)`)
  dataParts.push(`**Cost:** $${context.currentPeriod.costUsd.toFixed(4)}`)
  dataParts.push(`**Repos:** ${context.currentPeriod.activeRepos.map(r => r.split('/').pop()).join(', ') || 'none'}`)
  dataParts.push('')

  // Previous period if available
  if (context.previousPeriod) {
    const prevTotal = context.previousPeriod.completed + context.previousPeriod.failed
    const prevRate = prevTotal > 0 ? Math.round((context.previousPeriod.completed / prevTotal) * 100) : 0
    dataParts.push(`**Previous period:** ${context.previousPeriod.completed}/${prevTotal} (${prevRate}%) - $${context.previousPeriod.costUsd.toFixed(4)}`)
    dataParts.push('')
  }

  // Agent breakdown
  if (context.tasksByAgent.length > 0) {
    dataParts.push('**By agent:**')
    for (const item of context.tasksByAgent) {
      const agentTotal = item.completed + item.failed
      const rate = agentTotal > 0 ? Math.round((item.completed / agentTotal) * 100) : 0
      dataParts.push(`- ${item.agent}: ${item.completed}/${agentTotal} (${rate}%) $${item.costUsd.toFixed(4)}`)
    }
    dataParts.push('')
  }

  // Repo breakdown
  if (context.tasksByRepo.length > 0) {
    dataParts.push('**By repo:**')
    for (const item of context.tasksByRepo.slice(0, 8)) {
      dataParts.push(`- ${item.repo.split('/').pop()}: ${item.completed} done, ${item.failed} fail, ${item.pending} pending`)
    }
    dataParts.push('')
  }

  // Recent failures
  if (context.recentFailures.length > 0) {
    dataParts.push('**Recent failures:**')
    for (const f of context.recentFailures.slice(0, 8)) {
      const err = f.error ? ` - ${f.error.slice(0, 80)}` : ''
      dataParts.push(`- [${f.agent}] ${f.title}${err}`)
    }
    dataParts.push('')
  }

  // Agent health
  const unhealthyAgents = Object.entries(context.agentHealth).filter(([_, h]) => h.status !== 'healthy')
  if (unhealthyAgents.length > 0) {
    dataParts.push('**Agent issues:**')
    for (const [agent, health] of unhealthyAgents) {
      dataParts.push(`- ${agent}: ${health.status}${health.reason ? ` (${health.reason})` : ''}`)
    }
    dataParts.push('')
  }

  // Quota
  if (context.quotaStatus) {
    if (context.quotaStatus.gemini?.exceeded) {
      dataParts.push(`**Gemini quota exceeded** ${context.quotaStatus.gemini.resetAt ? `(resets ${context.quotaStatus.gemini.resetAt})` : ''}`)
    }
    if (context.quotaStatus.openrouter) {
      dataParts.push(`**OpenRouter:** $${context.quotaStatus.openrouter.remaining.toFixed(2)} remaining`)
    }
    dataParts.push('')
  }

  // Signals
  if (context.pendingSignals > 0) {
    dataParts.push(`**${context.pendingSignals} pending alignment signals** (needs human attention)`)
    dataParts.push('')
  }

  dataParts.push('---')
  dataParts.push('Analyze this data and output the <digest_result> XML block.')

  return `${prompt}\n\n${dataParts.join('\n')}`
}

// =============================================================================
// Output Parsing
// =============================================================================

export interface DigestTrend {
  direction: 'up' | 'down' | 'stable'
  metric: string
  description: string
}

export interface DigestAnomaly {
  severity: 'high' | 'medium' | 'low'
  description: string
}

export interface DigestAgentPerformance {
  name: string
  completed: number
  failed: number
  cost: number
  note?: string
}

export interface DigestRecommendation {
  priority: 'high' | 'medium' | 'low'
  description: string
}

export interface DigestAlert {
  type: string
  description: string
}

export interface DigestOutput {
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  report: string
  trends?: DigestTrend[]
  anomalies?: DigestAnomaly[]
  agent_performance?: DigestAgentPerformance[]
  recommendations?: DigestRecommendation[]
  alerts?: DigestAlert[]
}

/**
 * Parse Digest agent XML output.
 * Falls back to YAML parsing for backwards compatibility (one cycle grace period).
 */
export function parseDigestOutput(output: string): DigestOutput | null {
  // Try XML first
  const xmlResult = parseDigestXml(output)
  if (xmlResult) return xmlResult

  // Fallback: try legacy YAML format
  return parseDigestYamlLegacy(output)
}

function parseDigestXml(output: string): DigestOutput | null {
  const blockMatch = output.match(
    /<digest_result\s+health="(healthy|warning|critical)">([\s\S]*?)<\/digest_result>/
  )
  if (!blockMatch) return null

  const health = blockMatch[1] as DigestOutput['health']
  const body = blockMatch[2]

  const result: DigestOutput = { health, headline: '', report: '' }

  // Headline
  const headlineMatch = body.match(/<headline>([\s\S]*?)<\/headline>/)
  if (headlineMatch) result.headline = headlineMatch[1].trim()

  // Report
  const reportMatch = body.match(/<report>([\s\S]*?)<\/report>/)
  if (reportMatch) result.report = reportMatch[1].trim()

  // Trends
  const trendsBlock = body.match(/<trends>([\s\S]*?)<\/trends>/)
  if (trendsBlock) {
    const trends: DigestTrend[] = []
    const trendRegex = /<trend\s+direction="([^"]*)"(?:\s+metric="([^"]*)")?\s*>([\s\S]*?)<\/trend>/g
    let m
    while ((m = trendRegex.exec(trendsBlock[1])) !== null) {
      trends.push({
        direction: m[1] as DigestTrend['direction'],
        metric: m[2] || 'general',
        description: m[3].trim(),
      })
    }
    if (trends.length > 0) result.trends = trends
  }

  // Anomalies
  const anomaliesBlock = body.match(/<anomalies>([\s\S]*?)<\/anomalies>/)
  if (anomaliesBlock) {
    const anomalies: DigestAnomaly[] = []
    const anomalyRegex = /<anomaly(?:\s+severity="([^"]*)")?\s*>([\s\S]*?)<\/anomaly>/g
    let m
    while ((m = anomalyRegex.exec(anomaliesBlock[1])) !== null) {
      anomalies.push({
        severity: (m[1] as DigestAnomaly['severity']) || 'medium',
        description: m[2].trim(),
      })
    }
    if (anomalies.length > 0) result.anomalies = anomalies
  }

  // Agent performance
  const agentPerfBlock = body.match(/<agent_performance>([\s\S]*?)<\/agent_performance>/)
  if (agentPerfBlock) {
    const agents: DigestAgentPerformance[] = []
    const agentRegex = /<agent\s+([^>]*?)\/>/g
    let m
    while ((m = agentRegex.exec(agentPerfBlock[1])) !== null) {
      const attrs = m[1]
      const name = attrs.match(/name="([^"]*)"/)
      const completed = attrs.match(/completed="(\d+)"/)
      const failed = attrs.match(/failed="(\d+)"/)
      const cost = attrs.match(/cost="([^"]*)"/)
      const note = attrs.match(/note="([^"]*)"/)
      if (name) {
        agents.push({
          name: name[1],
          completed: completed ? +completed[1] : 0,
          failed: failed ? +failed[1] : 0,
          cost: cost ? parseFloat(cost[1]) : 0,
          note: note?.[1] || undefined,
        })
      }
    }
    if (agents.length > 0) result.agent_performance = agents
  }

  // Recommendations
  const recsBlock = body.match(/<recommendations>([\s\S]*?)<\/recommendations>/)
  if (recsBlock) {
    const recs: DigestRecommendation[] = []
    const recRegex = /<recommendation(?:\s+priority="([^"]*)")?\s*>([\s\S]*?)<\/recommendation>/g
    let m
    while ((m = recRegex.exec(recsBlock[1])) !== null) {
      recs.push({
        priority: (m[1] as DigestRecommendation['priority']) || 'medium',
        description: m[2].trim(),
      })
    }
    if (recs.length > 0) result.recommendations = recs
  }

  // Alerts
  const alertsBlock = body.match(/<alerts>([\s\S]*?)<\/alerts>/)
  if (alertsBlock) {
    const alerts: DigestAlert[] = []
    const alertRegex = /<alert(?:\s+type="([^"]*)")?\s*>([\s\S]*?)<\/alert>/g
    let m
    while ((m = alertRegex.exec(alertsBlock[1])) !== null) {
      alerts.push({
        type: m[1] || 'general',
        description: m[2].trim(),
      })
    }
    if (alerts.length > 0) result.alerts = alerts
  }

  if (!result.headline && !result.report) return null

  return result
}

/**
 * Legacy YAML parser for backwards compatibility.
 */
function parseDigestYamlLegacy(output: string): DigestOutput | null {
  const yamlMatch = output.match(/```yaml\n([\s\S]*?)```/)
  if (!yamlMatch) return null

  try {
    const yaml = yamlMatch[1]
    const lines = yaml.split('\n')

    let health: DigestOutput['health'] = 'healthy'
    let headline = ''
    let report = ''
    let inReport = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('status:')) {
        const value = trimmed.replace('status:', '').trim()
        if (value === 'healthy' || value === 'warning' || value === 'critical') {
          health = value
        }
      } else if (trimmed.startsWith('headline:')) {
        headline = trimmed.replace('headline:', '').trim().replace(/^["']|["']$/g, '')
      } else if (trimmed.startsWith('report:')) {
        inReport = true
        const inline = trimmed.replace('report:', '').trim()
        if (inline && inline !== '|') {
          report = inline.replace(/^["']|["']$/g, '')
          inReport = false
        }
      } else if (inReport) {
        if (line.startsWith('  ')) {
          report += (report ? '\n' : '') + line.slice(2)
        } else if (trimmed === '') {
          report += '\n'
        } else {
          inReport = false
        }
      }
    }

    return {
      health,
      headline: headline || 'No headline provided',
      report: report.trim() || 'No report provided',
    }
  } catch (error) {
    console.error('[Digest] Failed to parse YAML:', error)
    return null
  }
}

/** Marker output by Digest agent after completion */
export const DIGEST_COMPLETE_MARKER = '<digest_complete>true</digest_complete>'

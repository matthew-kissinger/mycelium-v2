/**
 * Digest Agent Prompts
 *
 * Smart digest agent - give it the data, let it find what's interesting.
 * Simple output format: health status + markdown report.
 */

/**
 * Digest Agent Prompt - finds what's interesting in the data
 */
export const DIGEST_AGENT_PROMPT = `You are analyzing an AI agent orchestration system.

Here's recent activity data. Write a brief, interesting report about what you see.

{MYCEL_CONTEXT}

## Guidelines

- Find what's **interesting** - don't just summarize numbers
- Spot **patterns** - what's working, what's not
- Note **anomalies** - anything unusual worth attention
- Be **concise** - a few key insights beat a wall of stats
- Be **actionable** - what should change?

Good report: "Failure rate spiked to 40% - all on gemini quota hits. Switch discovery to claude or wait for quota reset at 3pm."

Bad report: "12 tasks completed, 8 failed, 5 pending. Claude ran 6 tasks. Gemini ran 4 tasks..."

## Output Format

\`\`\`yaml
status: healthy  # healthy, warning, or critical
headline: "One sentence capturing the key insight"
report: |
  Your markdown report here. Keep it brief.

  Use bullet points for multiple observations.
  Bold the important parts.
\`\`\`
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
  dataParts.push('Write your report in the YAML format above. Focus on what\'s interesting.')

  return `${prompt}\n\n${dataParts.join('\n')}`
}

// =============================================================================
// Output Parsing
// =============================================================================

export interface DigestOutput {
  status: 'healthy' | 'warning' | 'critical'
  headline: string
  report: string
}

/**
 * Parse Digest agent YAML output.
 */
export function parseDigestOutput(output: string): DigestOutput | null {
  // Extract YAML block
  const yamlMatch = output.match(/```yaml\n([\s\S]*?)```/)
  if (!yamlMatch) return null

  try {
    const yaml = yamlMatch[1]
    const lines = yaml.split('\n')

    let status: 'healthy' | 'warning' | 'critical' = 'healthy'
    let headline = ''
    let report = ''
    let inReport = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('status:')) {
        const value = trimmed.replace('status:', '').trim()
        if (value === 'healthy' || value === 'warning' || value === 'critical') {
          status = value
        }
      } else if (trimmed.startsWith('headline:')) {
        headline = trimmed.replace('headline:', '').trim().replace(/^["']|["']$/g, '')
      } else if (trimmed.startsWith('report:')) {
        inReport = true
        // Check for inline value
        const inline = trimmed.replace('report:', '').trim()
        if (inline && inline !== '|') {
          report = inline.replace(/^["']|["']$/g, '')
          inReport = false
        }
      } else if (inReport) {
        // Multi-line report content
        if (line.startsWith('  ')) {
          report += (report ? '\n' : '') + line.slice(2)
        } else if (trimmed === '') {
          report += '\n'
        } else {
          // End of report block
          inReport = false
        }
      }
    }

    return {
      status,
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

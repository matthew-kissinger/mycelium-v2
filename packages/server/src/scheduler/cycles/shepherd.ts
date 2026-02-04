/**
 * Shepherd Cycle - evaluate completed task batches
 *
 * Responsibilities:
 * - Get repos with 5+ unevaluated completed tasks
 * - Spawn Shepherd agent per repo
 * - Parse YAML output and create evaluation record
 * - Mark tasks as evaluated
 * - Extract patterns and warnings
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import { buildMycelContext } from '../../prompts/context'
import { getTelegramService } from '../../telegram'
import { formatShepherdReport } from '../../telegram/messages'
import { registerActiveRun, unregisterActiveRun, isShepherdRunningForRepo } from '../active-runs'

/**
 * Run the Shepherd cycle.
 * Evaluates repos with enough unevaluated tasks.
 */
export async function runShepherdCycle(
  config: SchedulerConfig,
  specificRepo?: string
): Promise<void> {
  console.log('[Shepherd] Starting cycle...')

  // Use configurable batch size
  const batchSize = config.shepherd_batch_size ?? 5

  // Get all repos
  const repos = await queries.getRepos()

  if (repos.length === 0) {
    console.log('[Shepherd] No repos registered')
    return
  }

  // Filter to specific repo if provided
  const targetRepos = specificRepo
    ? repos.filter((r) => r.path === specificRepo)
    : repos

  // Check each repo for unevaluated tasks
  for (const repo of targetRepos) {
    // Skip if shepherd is already running for this repo
    if (isShepherdRunningForRepo(repo.path)) {
      console.log(`[Shepherd] ${repo.name} already being evaluated, skipping`)
      continue
    }

    // Check threshold with small query first
    const check = await queries.getUnevaluatedTasks(repo.path, batchSize)

    if (check.length >= batchSize) {
      // Threshold met - get ALL unevaluated tasks so we evaluate them in one pass
      const allUnevaluated = await queries.getUnevaluatedTasks(repo.path, 200)
      console.log(`[Shepherd] ${repo.name} has ${allUnevaluated.length} unevaluated tasks`)
      await runShepherdForRepo(repo, allUnevaluated)
    } else if (specificRepo) {
      // If specifically triggered for this repo, run anyway
      console.log(`[Shepherd] ${repo.name} has ${check.length} unevaluated tasks (below threshold, running anyway)`)
      if (check.length > 0) {
        await runShepherdForRepo(repo, check)
      }
    }
  }
}

/**
 * Run Shepherd for a specific repo.
 */
async function runShepherdForRepo(
  repo: Awaited<ReturnType<typeof queries.getRepo>>,
  tasks: Awaited<ReturnType<typeof queries.getUnevaluatedTasks>>
): Promise<void> {
  if (!repo || tasks.length === 0) return

  const repoPath = repo.path
  const repoName = repo.name

  console.log(`[Shepherd] Evaluating ${tasks.length} tasks for ${repoName}`)

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'shepherd',
    repo_path: repoPath,
    context: { task_count: tasks.length },
  })

  // Register active run
  registerActiveRun({
    run_id: run.id,
    agent_type: 'shepherd',
    repo_path: repoPath,
    started_at: new Date().toISOString(),
  })

  // Broadcast event
  broadcast('system:agent_started', {
    type: 'system:agent_started',
    run_id: run.id,
    agent_type: 'shepherd',
    repo_path: repoPath,
    timestamp: new Date().toISOString(),
  })

  try {
    // Build context for system agent
    const mycelContext = buildMycelContext({
      role: 'shepherd',
      agentId: 'shepherd',
    })

    // Build prompt with task summaries and context
    const basePrompt = buildShepherdPrompt(repo, tasks)
    const prompt = `${basePrompt}\n\n${mycelContext}`

    // Collect session log entries
    const sessionLog: Array<{ chunk: string; stream: string; timestamp: string }> = []

    // Dispatch to agent (use opus for evaluation)
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath,
      model: 'opus',
      timeout: 1800, // 30 min timeout
      onOutput: (chunk, stream = 'stdout') => {
        sessionLog.push({ chunk, stream, timestamp: new Date().toISOString() })
        // Broadcast output for live streaming
        broadcast('agent:output', {
          type: 'agent:output',
          run_id: run.id,
          agent_type: 'shepherd',
          chunk,
          stream,
          timestamp: new Date().toISOString(),
        })
      },
    })

    // Record fruiting session for system agent run
    queries.createFruitingSession({
      task_id: run.id,
      repo_path: repoPath,
      agent: 'claude',
      model: 'opus',
      context_trace: { agent_type: 'shepherd', task_count: tasks.length },
      full_prompt: prompt,
      session_log: sessionLog,
    }).catch((e) => console.error('[Shepherd] Failed to record fruiting session:', e))

    if (!result.success) {
      await queries.failRun(run.id, result.output.slice(0, 500))
      console.log(`[Shepherd] ${repoName} agent failed: ${result.output.slice(0, 100)}`)

      broadcast('agent:failed', {
        type: 'agent:failed',
        run_id: run.id,
        agent_type: 'shepherd',
        error: result.output.slice(0, 200),
        timestamp: new Date().toISOString(),
      })

      // Mark tasks as evaluated anyway
      await markTasksEvaluated(tasks)
      return
    }

    // Parse YAML output
    const evaluation = parseShepherdOutput(result.output)

    if (evaluation) {
      // Create evaluation record
      await queries.createShepherdEvaluation({
        repo_path: repoPath,
        tasks_evaluated: tasks.map((t) => t.id),
        health: evaluation.health,
        headline: evaluation.headline,
        concerns: evaluation.concerns,
        wins: evaluation.wins,
        recommendation: evaluation.recommendation,
        global_patterns: evaluation.patterns,
        global_warnings: evaluation.warnings,
        branch_evaluations: evaluation.branch_evaluations,
        raw_response: result.output,
      })

      // Add extracted patterns to memory
      for (const pattern of evaluation.patterns ?? []) {
        await queries.createPattern({
          content: pattern.content ?? pattern,
          source: 'shepherd',
          repo_path: repoPath,
          tags: pattern.tags ?? [],
        })
      }

      // Add extracted warnings to memory
      for (const warning of evaluation.warnings ?? []) {
        await queries.createWarning({
          content: warning.content ?? warning,
          severity: warning.severity ?? 'medium',
          repo_path: repoPath,
        })
      }

      console.log(`[Shepherd] ${repoName}: ${evaluation.health} - ${evaluation.headline}`)

      // Send Telegram notification
      const telegram = getTelegramService()
      if (telegram?.isConnected()) {
        const branchEvals = evaluation.branch_evaluations ?? []
        const report = formatShepherdReport({
          repo_path: repoPath,
          repo_name: repoName,
          health: evaluation.health,
          headline: evaluation.headline,
          concerns: evaluation.concerns,
          wins: evaluation.wins,
          merges: branchEvals.filter((b) => b.decision === 'MERGE').length || undefined,
          rejects: branchEvals.filter((b) => b.decision === 'REJECT').length || undefined,
          defers: branchEvals.filter((b) => b.decision === 'DEFER').length || undefined,
        })
        telegram.sendMessage(report).catch((e) => console.error('[Shepherd] Telegram notify error:', e))
      }
    } else {
      console.log(`[Shepherd] ${repoName}: Could not parse evaluation output`)
    }

    // Mark tasks as evaluated
    await markTasksEvaluated(tasks)

    await queries.completeRun(run.id, result.output)
    console.log(`[Shepherd] ${repoName} completed`)

    broadcast('agent:completed', {
      type: 'agent:completed',
      run_id: run.id,
      agent_type: 'shepherd',
      duration_seconds: result.duration_seconds,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error(`[Shepherd] ${repoName} error:`, error)

    // Mark tasks as evaluated anyway
    await markTasksEvaluated(tasks)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'shepherd',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  } finally {
    unregisterActiveRun(run.id)
  }
}

/**
 * Mark tasks as evaluated by Shepherd.
 */
async function markTasksEvaluated(
  tasks: Awaited<ReturnType<typeof queries.getUnevaluatedTasks>>
): Promise<void> {
  const now = new Date().toISOString()
  for (const task of tasks) {
    await queries.updateTask(task.id, {
      shepherd_evaluated_at: now,
    })
  }
  console.log(`[Shepherd] Marked ${tasks.length} tasks as evaluated`)
}

/**
 * Build Shepherd prompt.
 */
function buildShepherdPrompt(
  repo: Awaited<ReturnType<typeof queries.getRepo>>,
  tasks: Awaited<ReturnType<typeof queries.getUnevaluatedTasks>>
): string {
  const repoName = repo?.name ?? 'unknown'

  // Build task summaries
  const taskSummaries = tasks.map((t) => {
    const status = t.status === 'done' ? 'SUCCESS' : 'FAILED'
    const duration = t.duration_seconds ? `${Math.round(t.duration_seconds)}s` : 'unknown'
    const cost = t.cost_usd ? `$${t.cost_usd.toFixed(4)}` : 'N/A'

    return `### Task: ${t.title}
- ID: ${t.id.slice(0, 8)}
- Status: ${status}
- Agent: ${t.agent ?? 'claude'}/${t.model ?? 'sonnet'}
- Duration: ${duration}
- Cost: ${cost}

${t.result ? `Result:\n\`\`\`\n${t.result.slice(0, 1000)}\n\`\`\`` : ''}
${t.error ? `Error:\n\`\`\`\n${t.error.slice(0, 500)}\n\`\`\`` : ''}`
  }).join('\n\n---\n\n')

  return `You are the Shepherd Agent for Mycelium, evaluating completed work for ${repoName}.

## Your Task

Analyze the following completed tasks and provide:
1. Overall health assessment (healthy/warning/critical)
2. Brief headline (1 sentence)
3. List of concerns (if any)
4. List of wins (if any)
5. Recommendation for next steps
6. Any patterns worth remembering
7. Any warnings for future tasks

## Tasks to Evaluate

${taskSummaries}

## Output Format

Provide your analysis in this YAML format:

\`\`\`yaml
health: healthy  # or warning, critical
headline: "Brief summary of the work"
concerns:
  - "Concern 1"
  - "Concern 2"
wins:
  - "Win 1"
  - "Win 2"
recommendation: "What to focus on next"
patterns:
  - content: "Pattern description"
    tags: ["tag1", "tag2"]
warnings:
  - content: "Warning description"
    severity: medium  # low, medium, high
branch_evaluations:
  - task_id: "abc12345"
    decision: MERGE  # or REJECT, DEFER
    reason: "Why this decision"
\`\`\`

Be concise but thorough. Focus on actionable insights.
`
}

/**
 * Parse Shepherd YAML output.
 */
function parseShepherdOutput(output: string): {
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  concerns?: string[]
  wins?: string[]
  recommendation?: string
  patterns?: Array<{ content: string; tags?: string[] }>
  warnings?: Array<{ content: string; severity?: string }>
  branch_evaluations?: Array<{ task_id: string; decision: string; reason: string }>
} | null {
  // Extract YAML block
  const yamlMatch = output.match(/```yaml\n([\s\S]*?)```/)
  if (!yamlMatch) return null

  try {
    // Simple YAML parsing (for basic structure)
    const yaml = yamlMatch[1]
    const lines = yaml.split('\n')

    let health: 'healthy' | 'warning' | 'critical' = 'healthy'
    let headline = ''
    const concerns: string[] = []
    const wins: string[] = []
    let recommendation = ''
    const patterns: Array<{ content: string; tags?: string[] }> = []
    const warnings: Array<{ content: string; severity?: string }> = []
    const branchEvaluations: Array<{ task_id: string; decision: string; reason: string }> = []

    let currentSection = ''
    let currentPattern: { content?: string; tags?: string[] } | null = null
    let currentWarning: { content?: string; severity?: string } | null = null
    let currentBranchEval: { task_id?: string; decision?: string; reason?: string } | null = null

    for (const line of lines) {
      const trimmed = line.trim()

      // Top-level keys
      if (trimmed.startsWith('health:')) {
        const value = trimmed.replace('health:', '').trim()
        if (value === 'healthy' || value === 'warning' || value === 'critical') {
          health = value
        }
        currentSection = ''
      } else if (trimmed.startsWith('headline:')) {
        headline = trimmed.replace('headline:', '').trim().replace(/^["']|["']$/g, '')
        currentSection = ''
      } else if (trimmed.startsWith('recommendation:')) {
        recommendation = trimmed.replace('recommendation:', '').trim().replace(/^["']|["']$/g, '')
        currentSection = ''
      } else if (trimmed === 'concerns:') {
        currentSection = 'concerns'
      } else if (trimmed === 'wins:') {
        currentSection = 'wins'
      } else if (trimmed === 'patterns:') {
        currentSection = 'patterns'
      } else if (trimmed === 'warnings:') {
        currentSection = 'warnings'
      } else if (trimmed === 'branch_evaluations:') {
        currentSection = 'branch_evaluations'
      } else if (trimmed.startsWith('- ') && currentSection === 'concerns') {
        concerns.push(trimmed.replace(/^- ["']?|["']?$/g, ''))
      } else if (trimmed.startsWith('- ') && currentSection === 'wins') {
        wins.push(trimmed.replace(/^- ["']?|["']?$/g, ''))
      } else if (trimmed.startsWith('- content:') && currentSection === 'patterns') {
        if (currentPattern?.content) {
          patterns.push(currentPattern as { content: string })
        }
        currentPattern = { content: trimmed.replace('- content:', '').trim().replace(/^["']|["']$/g, '') }
      } else if (trimmed.startsWith('tags:') && currentPattern) {
        // Skip, handled in next line
      } else if (trimmed.startsWith('- "') && currentPattern) {
        if (!currentPattern.tags) currentPattern.tags = []
        currentPattern.tags.push(trimmed.replace(/^- ["']|["']$/g, ''))
      } else if (trimmed.startsWith('- content:') && currentSection === 'warnings') {
        if (currentWarning?.content) {
          warnings.push(currentWarning as { content: string })
        }
        currentWarning = { content: trimmed.replace('- content:', '').trim().replace(/^["']|["']$/g, '') }
      } else if (trimmed.startsWith('severity:') && currentWarning) {
        currentWarning.severity = trimmed.replace('severity:', '').trim()
      } else if (trimmed.startsWith('- task_id:') && currentSection === 'branch_evaluations') {
        if (currentBranchEval?.task_id) {
          branchEvaluations.push(currentBranchEval as { task_id: string; decision: string; reason: string })
        }
        currentBranchEval = { task_id: trimmed.replace('- task_id:', '').trim().replace(/^["']|["']$/g, '') }
      } else if (trimmed.startsWith('decision:') && currentBranchEval) {
        currentBranchEval.decision = trimmed.replace('decision:', '').trim()
      } else if (trimmed.startsWith('reason:') && currentBranchEval) {
        currentBranchEval.reason = trimmed.replace('reason:', '').trim().replace(/^["']|["']$/g, '')
      }
    }

    // Push last items
    if (currentPattern?.content) patterns.push(currentPattern as { content: string })
    if (currentWarning?.content) warnings.push(currentWarning as { content: string })
    if (currentBranchEval?.task_id) branchEvaluations.push(currentBranchEval as { task_id: string; decision: string; reason: string })

    return {
      health,
      headline,
      concerns: concerns.length > 0 ? concerns : undefined,
      wins: wins.length > 0 ? wins : undefined,
      recommendation: recommendation || undefined,
      patterns: patterns.length > 0 ? patterns : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      branch_evaluations: branchEvaluations.length > 0 ? branchEvaluations : undefined,
    }
  } catch (error) {
    console.error('[Shepherd] Failed to parse YAML:', error)
    return null
  }
}

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

import { spawn } from 'bun'
import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import { buildMycelContext, buildMemorySection } from '../../prompts/context'
import { getTelegramService } from '../../telegram'
import { formatShepherdReport, formatMergeConflict, formatMergeSuccess } from '../../telegram/messages'
import { registerActiveRun, unregisterActiveRun, isShepherdRunningForRepo } from '../active-runs'
import { getBranchDiff, cleanupWorkspace } from '../../agents/workspace'
import { getRepoSlug, createPR, mergePR, closePR, buildPRBody, ensureLabels, AGENT_LABELS, createCommitStatus, getBranchSha, type RepoSlug } from '../../github'
import { processMergeQueue, type MergeQueueEntry } from '../../github/merge-queue'

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
  broadcast('agent:started', {
    type: 'agent:started',
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

    // Build prompt with task summaries, branch diffs, and context
    const basePrompt = await buildShepherdPrompt(repo, tasks)
    const prompt = `${basePrompt}\n\n${mycelContext}`

    // Collect session log entries
    const sessionLog: Array<{ chunk: string; stream: string; timestamp: string }> = []

    // Dispatch to agent (use opus for evaluation)
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath,
      model: 'opus',
      taskId: run.id,
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
          branch_evaluations: branchEvals.length > 0 ? branchEvals : undefined,
        })
        telegram.sendMessage(report).catch((e) => console.error('[Shepherd] Telegram notify error:', e))
      }
      // Process branch evaluations (MERGE/REJECT/DEFER)
      let deferredTaskIds: Set<string> | undefined
      if (evaluation.branch_evaluations && evaluation.branch_evaluations.length > 0) {
        deferredTaskIds = await processBranchEvaluations(repoPath, repoName, tasks, evaluation.branch_evaluations)
      }

      // Mark tasks as evaluated (skip deferred so they re-appear next cycle)
      await markTasksEvaluated(tasks, deferredTaskIds)
    } else {
      console.log(`[Shepherd] ${repoName}: Could not parse evaluation output`)
      // Mark tasks as evaluated even if parsing failed
      await markTasksEvaluated(tasks)
    }

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
 * Skips deferred tasks so they appear in the next evaluation cycle.
 */
async function markTasksEvaluated(
  tasks: Awaited<ReturnType<typeof queries.getUnevaluatedTasks>>,
  deferredTaskIds?: Set<string>
): Promise<void> {
  const now = new Date().toISOString()
  let marked = 0
  let skipped = 0
  for (const task of tasks) {
    if (deferredTaskIds?.has(task.id)) {
      skipped++
      continue
    }
    await queries.updateTask(task.id, {
      shepherd_evaluated_at: now,
    })
    marked++
  }
  console.log(`[Shepherd] Marked ${marked} tasks as evaluated${skipped > 0 ? `, ${skipped} deferred (will re-evaluate)` : ''}`)
}

/**
 * Build Shepherd prompt with branch diff info for tasks that have branches.
 */
async function buildShepherdPrompt(
  repo: Awaited<ReturnType<typeof queries.getRepo>>,
  tasks: Awaited<ReturnType<typeof queries.getUnevaluatedTasks>>
): Promise<string> {
  const repoName = repo?.name ?? 'unknown'
  const repoPath = repo?.path ?? ''

  // Build task summaries with branch diff info
  const taskSummaryParts: string[] = []
  const tasksWithBranches: string[] = []

  for (const t of tasks) {
    const status = t.status === 'done' ? 'SUCCESS' : 'FAILED'
    const duration = t.duration_seconds ? `${Math.round(t.duration_seconds)}s` : 'unknown'
    const cost = t.cost_usd ? `$${t.cost_usd.toFixed(4)}` : 'N/A'

    let summary = `### Task: ${t.title}
- ID: ${t.id.slice(0, 8)}
- Status: ${status}
- Agent: ${t.agent ?? 'claude'}/${t.model ?? 'sonnet'}
- Duration: ${duration}
- Cost: ${cost}`

    // Include worktree path if available
    if (t.worktree_path) {
      summary += `\n- Worktree: ${t.worktree_path}`
    }

    // Include GitHub PR info if available
    if (t.github_pr_number) {
      summary += `\n- PR: #${t.github_pr_number}`
      if (t.github_pr_url) {
        summary += ` (${t.github_pr_url})`
      }
    }

    // Include branch diff info if task has a branch
    if (t.branch_name) {
      const branchName = t.branch_name
      summary += `\n- Branch: ${branchName}`
      tasksWithBranches.push(t.id.slice(0, 8))

      try {
        const diff = await getBranchDiff(repoPath, branchName)
        if (diff.filesChanged.length > 0) {
          summary += `\n- Files changed: ${diff.filesChanged.length}`
          summary += `\n\nDiff stats:\n\`\`\`\n${diff.diffStat}\n\`\`\``
          // Include truncated diff content for code quality evaluation
          const truncatedDiff = diff.diffContent.length > 12000
            ? diff.diffContent.slice(0, 12000) + '\n[diff truncated]'
            : diff.diffContent
          if (truncatedDiff) {
            summary += `\n\nDiff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\``
          }
        } else {
          summary += `\n- Branch has no changes vs main`
        }
      } catch (err) {
        summary += `\n- Branch diff unavailable: ${err instanceof Error ? err.message : String(err)}`
      }
    }

    summary += `\n\n${t.result ? `Result:\n\`\`\`\n${t.result.slice(0, 1000)}\n\`\`\`` : ''}`
    summary += `${t.error ? `\nError:\n\`\`\`\n${t.error.slice(0, 500)}\n\`\`\`` : ''}`

    taskSummaryParts.push(summary)
  }

  const taskSummaries = taskSummaryParts.join('\n\n---\n\n')

  // Add branch evaluation instructions only if there are branches to evaluate
  const branchInstructions = tasksWithBranches.length > 0
    ? `\n8. For tasks with branches, decide: MERGE (into main), REJECT (discard), or DEFER (keep for later)
9. If multiple branches should merge, specify the ORDER to minimize conflicts (list them in sequence)

**Branch evaluation criteria:**
- MERGE: Code is correct, tests pass, follows project conventions
- REJECT: Code is broken, introduces regressions, or doesn't meet requirements
- DEFER: Code needs minor fixes or review - keep the branch alive`
    : ''

  // Build memory section for repo context
  const memorySection = await buildMemorySection(repoPath)

  const toolInstructions = tasksWithBranches.length > 0
    ? `\n## Investigation (Before Writing YAML)

You have full tool access. Before making MERGE/REJECT/DEFER decisions, DO:

1. **Read key files** in each branch's worktree to verify code quality
2. **Run tests** if the repo has a test suite (\`bun test\`, \`npm test\`, etc.)
3. **Check git log** for each branch to understand commit history
4. **Look for regressions** - compare changed files against main branch

Only write your YAML evaluation AFTER investigating. Do not rely solely on the diffs above.
`
    : ''

  return `You are the Shepherd Agent for Mycelium, evaluating completed work for ${repoName}.

## Your Task

Analyze the following completed tasks and provide:
1. Overall health assessment (healthy/warning/critical)
2. Brief headline (1 sentence)
3. List of concerns (if any)
4. List of wins (if any)
5. Recommendation for next steps
6. Any patterns worth remembering
7. Any warnings for future tasks${branchInstructions}
${toolInstructions}
## Tasks to Evaluate

${taskSummaries}
${memorySection ? `\n## Repository Memory\n\n${memorySection}\n` : ''}
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
    merge_order: 1  # order to merge (1 = first, only for MERGE decisions)
\`\`\`

Be concise but thorough. Focus on actionable insights.${tasksWithBranches.length > 0 ? `\n\n**IMPORTANT:** Tasks with branches that need evaluation: ${tasksWithBranches.join(', ')}. You MUST include a branch_evaluation entry for each.` : ''}
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
  branch_evaluations?: Array<{ task_id: string; decision: string; reason: string; merge_order?: number }>
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
    const branchEvaluations: Array<{ task_id: string; decision: string; reason: string; merge_order?: number }> = []

    let currentSection = ''
    let currentPattern: { content?: string; tags?: string[] } | null = null
    let currentWarning: { content?: string; severity?: string } | null = null
    let currentBranchEval: { task_id?: string; decision?: string; reason?: string; merge_order?: number } | null = null

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
      } else if (trimmed.startsWith('merge_order:') && currentBranchEval) {
        const orderVal = parseInt(trimmed.replace('merge_order:', '').trim(), 10)
        if (!isNaN(orderVal)) currentBranchEval.merge_order = orderVal
      }
    }

    // Push last items
    if (currentPattern?.content) patterns.push(currentPattern as { content: string })
    if (currentWarning?.content) warnings.push(currentWarning as { content: string })
    if (currentBranchEval?.task_id) branchEvaluations.push(currentBranchEval as { task_id: string; decision: string; reason: string; merge_order?: number })

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

// =============================================================================
// Branch Evaluation Processing (MERGE / REJECT / DEFER)
// =============================================================================

// Maximum number of times a task can be deferred before force-rejecting
const MAX_DEFER_COUNT = 3

/**
 * Process branch evaluations from the shepherd's output.
 * Handles MERGE, REJECT, and DEFER decisions.
 *
 * GitHub-first: Creates PRs on GitHub when possible.
 * Fallback: Uses local merge when repo has no GitHub remote.
 *
 * Returns the set of task IDs that were deferred (so they aren't marked as evaluated).
 */
async function processBranchEvaluations(
  repoPath: string,
  repoName: string,
  tasks: Awaited<ReturnType<typeof queries.getUnevaluatedTasks>>,
  branchEvals: Array<{ task_id: string; decision: string; reason: string; merge_order?: number }>
): Promise<Set<string>> {
  const deferredTaskIds = new Set<string>()
  const telegram = getTelegramService()

  // Detect if repo has a GitHub remote
  const slug = await getRepoSlug(repoPath)
  if (slug) {
    // Ensure standard labels exist on the repo (best-effort)
    ensureLabels(slug, [...AGENT_LABELS]).catch(() => {})
  }

  // Build task lookup by short ID (first 8 chars)
  const taskMap = new Map<string, typeof tasks[number]>()
  for (const t of tasks) {
    taskMap.set(t.id.slice(0, 8), t)
    taskMap.set(t.id, t) // Also map full ID
  }

  // Sort MERGE evaluations by merge_order (undefined goes last)
  const merges = branchEvals
    .filter(e => e.decision === 'MERGE')
    .sort((a, b) => (a.merge_order ?? 999) - (b.merge_order ?? 999))
  const rejects = branchEvals.filter(e => e.decision === 'REJECT')
  const defers = branchEvals.filter(e => e.decision === 'DEFER')

  // Build merge queue entries from MERGE evaluations
  const mergeEntries: MergeQueueEntry[] = []
  for (const evalItem of merges) {
    const task = taskMap.get(evalItem.task_id)
    if (!task) {
      console.log(`[Shepherd] MERGE: task ${evalItem.task_id} not found, skipping`)
      continue
    }

    const branchName = task.branch_name as string | null
    if (!branchName) {
      console.log(`[Shepherd] MERGE: task ${evalItem.task_id} has no branch, skipping`)
      continue
    }

    mergeEntries.push({
      taskId: task.id,
      branchName,
      title: task.title,
      mergeOrder: evalItem.merge_order ?? 999,
      agent: task.agent,
      model: task.model,
    })
  }

  // Process merges through the queue (handles ordering + conflict detection)
  if (mergeEntries.length > 0) {
    if (slug) {
      // GitHub PR workflow for each entry
      for (const entry of mergeEntries) {
        const task = taskMap.get(entry.taskId.slice(0, 8)) ?? taskMap.get(entry.taskId)
        if (!task) continue
        console.log(`[Shepherd] MERGE: ${entry.branchName} (${task.title})`)
        await processMergeViaGitHub(slug, task, entry.branchName, 'Approved by shepherd', repoPath, telegram)
      }
    } else {
      // Local merge queue with conflict detection
      console.log(`[Shepherd] Processing ${mergeEntries.length} merges via local queue`)
      const queueResult = await processMergeQueue(repoPath, mergeEntries)

      // Handle successful merges
      for (const merged of queueResult.merged) {
        const task = taskMap.get(merged.taskId.slice(0, 8)) ?? taskMap.get(merged.taskId)
        if (!task) continue

        await cleanupWorkspace(task.id, repoPath, true).catch(err =>
          console.error(`[Shepherd] Cleanup failed for ${task.id}:`, err)
        )
        await queries.updateTask(task.id, {
          worktree_path: null,
          branch_name: null,
        })

        if (telegram?.isConnected()) {
          const msg = formatMergeSuccess(repoPath, merged.branchName, task.agent ?? 'unknown', merged.filesChanged)
          telegram.sendMessage(msg).catch(e => console.error('[Shepherd] Telegram error:', e))
        }
      }

      // Handle deferred (conflict) entries - add to deferred set
      for (const deferred of queueResult.deferred) {
        const task = taskMap.get(deferred.taskId.slice(0, 8)) ?? taskMap.get(deferred.taskId)
        if (!task) continue

        console.log(`[Shepherd] MERGE->DEFER: ${deferred.branchName} (${deferred.reason})`)
        deferredTaskIds.add(task.id)

        if (telegram?.isConnected()) {
          const msg = formatMergeConflict(repoPath, deferred.branchName, task.agent ?? 'unknown', deferred.conflicts ?? [])
          telegram.sendMessage(msg).catch(e => console.error('[Shepherd] Telegram error:', e))
        }
      }

      // Handle failures
      for (const failed of queueResult.failed) {
        console.error(`[Shepherd] MERGE FAILED: ${failed.branchName} - ${failed.error}`)
      }
    }
  }

  // Process REJECTs
  for (const evalItem of rejects) {
    const task = taskMap.get(evalItem.task_id)
    if (!task) continue

    const branchName = task.branch_name as string | null
    if (!branchName) continue

    console.log(`[Shepherd] REJECT: ${branchName} (${evalItem.reason})`)

    // Close PR on GitHub if one exists
    if (slug && task.github_pr_number) {
      const prNum = task.github_pr_number as number
      closePR(slug, prNum, `Rejected by shepherd: ${evalItem.reason}`).catch(err =>
        console.error(`[Shepherd] Failed to close PR #${prNum}:`, err)
      )
      broadcast('github:pr_closed', {
        type: 'github:pr_closed' as const,
        repo_path: repoPath,
        pr_number: prNum,
        task_id: task.id,
        reason: evalItem.reason,
        timestamp: new Date().toISOString(),
      })
    }

    // Cleanup worktree and delete branch
    await cleanupWorkspace(task.id, repoPath, true).catch(err =>
      console.error(`[Shepherd] Cleanup failed for ${task.id}:`, err)
    )

    // Clear worktree/branch fields on the task
    await queries.updateTask(task.id, {
      worktree_path: null,
      branch_name: null,
    })
  }

  // Process DEFERs - track count, force-reject if exceeded limit
  for (const evalItem of defers) {
    const task = taskMap.get(evalItem.task_id)
    if (!task) continue

    const branchName = task.branch_name as string | null

    // Increment defer count in spec_context
    let specCtx: Record<string, unknown> = {}
    try { specCtx = task.spec_context ? JSON.parse(task.spec_context as string) : {} } catch { /* ignore */ }
    const deferCount = ((specCtx.shepherd_defer_count as number) ?? 0) + 1

    if (deferCount >= MAX_DEFER_COUNT) {
      // Too many deferrals - force reject
      console.log(`[Shepherd] DEFER->REJECT: ${branchName ?? evalItem.task_id} (deferred ${deferCount} times, max ${MAX_DEFER_COUNT})`)

      // Close PR on GitHub if one exists
      if (slug && task.github_pr_number) {
        const prNum = task.github_pr_number as number
        closePR(slug, prNum, `Force-rejected: deferred ${deferCount} times (max ${MAX_DEFER_COUNT})`).catch(() => {})
      }

      await cleanupWorkspace(task.id, repoPath, true).catch(err =>
        console.error(`[Shepherd] Cleanup failed for ${task.id}:`, err)
      )
      await queries.updateTask(task.id, {
        worktree_path: null,
        branch_name: null,
        spec_context: JSON.stringify({ ...specCtx, shepherd_defer_count: deferCount }),
      })
      // Don't add to deferredTaskIds - let it be marked as evaluated
    } else {
      console.log(`[Shepherd] DEFER: ${branchName ?? evalItem.task_id} (${evalItem.reason}) [${deferCount}/${MAX_DEFER_COUNT}]`)

      // If no PR exists yet on GitHub, create one as "needs-review"
      if (slug && branchName && !task.github_pr_number) {
        createPR({
          slug,
          head: branchName,
          title: `[mycelium] ${task.title}`,
          body: buildPRBody({
            taskId: task.id,
            taskTitle: task.title,
            agent: task.agent ?? 'unknown',
            model: task.model,
            evaluationReason: `Deferred: ${evalItem.reason}`,
          }),
          labels: ['mycelium', 'needs-review'],
          draft: true,
        }).then((pr) => {
          if (pr) {
            queries.updateTask(task.id, {
              github_pr_number: pr.number,
              github_pr_url: pr.url,
            })
            broadcast('github:pr_created', {
              type: 'github:pr_created' as const,
              repo_path: repoPath,
              pr_number: pr.number,
              pr_url: pr.url,
              task_id: task.id,
              branch: branchName!,
              title: task.title,
              timestamp: new Date().toISOString(),
            })
          }
        }).catch((err) => console.error(`[Shepherd] PR creation failed for deferred task:`, err))
      }

      // Update defer count but do NOT mark as evaluated
      await queries.updateTask(task.id, {
        spec_context: JSON.stringify({ ...specCtx, shepherd_defer_count: deferCount }),
      })
      deferredTaskIds.add(task.id)
    }
  }

  const summary = [
    merges.length > 0 ? `${merges.length} merged` : null,
    rejects.length > 0 ? `${rejects.length} rejected` : null,
    defers.length > 0 ? `${defers.length} deferred` : null,
  ].filter(Boolean).join(', ')

  console.log(`[Shepherd] Branch evaluation complete for ${repoName}: ${summary}`)
  return deferredTaskIds
}

/**
 * Process a MERGE decision via GitHub PR workflow.
 * Creates PR -> adds shepherd review -> merges -> cleans up.
 */
async function processMergeViaGitHub(
  slug: RepoSlug,
  task: { id: string; title: string; agent: string | null; model: string | null; cost_usd: number | null; duration_seconds: number | null; repo_path: string; github_pr_number?: number | null; github_pr_url?: string | null },
  branchName: string,
  reason: string,
  repoPath: string,
  telegram: ReturnType<typeof getTelegramService>
): Promise<void> {
  // Create PR if one doesn't exist yet
  let prNumber = task.github_pr_number ?? null
  let prUrl = task.github_pr_url ?? null

  if (!prNumber) {
    const prBody = buildPRBody({
      taskId: task.id,
      taskTitle: task.title,
      agent: task.agent ?? 'unknown',
      model: task.model,
      duration: task.duration_seconds,
      cost: task.cost_usd,
      evaluationReason: reason,
    })

    const pr = await createPR({
      slug,
      head: branchName,
      title: `[mycelium] ${task.title}`,
      body: prBody,
      labels: ['mycelium', 'auto-merge'],
    })

    if (pr) {
      prNumber = pr.number
      prUrl = pr.url
      await queries.updateTask(task.id, {
        github_pr_number: pr.number,
        github_pr_url: pr.url,
      })
      broadcast('github:pr_created', {
        type: 'github:pr_created' as const,
        repo_path: repoPath,
        pr_number: pr.number,
        pr_url: pr.url,
        task_id: task.id,
        branch: branchName,
        title: task.title,
        timestamp: new Date().toISOString(),
      })
    }
  }

  if (prNumber) {
    // Merge the PR
    const mergeResult = await mergePR({
      slug,
      prNumber,
      method: 'merge',
      commitTitle: `merge: ${task.title}`,
      deleteAfterMerge: true,
    })

    if (mergeResult.success) {
      console.log(`[Shepherd] PR #${prNumber} merged for ${branchName}`)
      broadcast('github:pr_merged', {
        type: 'github:pr_merged' as const,
        repo_path: repoPath,
        pr_number: prNumber,
        task_id: task.id,
        timestamp: new Date().toISOString(),
      })

      // Pull merged changes locally so local repo stays in sync
      await runGitSafe(['pull', 'origin'], repoPath)

      // Cleanup local worktree (branch already deleted by GitHub)
      await cleanupWorkspace(task.id, repoPath, false).catch(err =>
        console.error(`[Shepherd] Cleanup failed for ${task.id}:`, err)
      )

      await queries.updateTask(task.id, {
        worktree_path: null,
        branch_name: null,
      })

      if (telegram?.isConnected()) {
        const msg = formatMergeSuccess(repoPath, branchName, task.agent ?? 'unknown', 0)
        telegram.sendMessage(msg + (prUrl ? `\n[PR #${prNumber}](${prUrl})` : '')).catch(e => console.error('[Shepherd] Telegram error:', e))
      }
    } else {
      console.log(`[Shepherd] PR #${prNumber} merge failed: ${mergeResult.error}`)
      // Fall back to local merge
      await processMergeLocally(task, branchName, repoPath, telegram)
    }
  } else {
    // PR creation failed - fall back to local merge
    console.log(`[Shepherd] PR creation failed for ${branchName}, using local merge`)
    await processMergeLocally(task, branchName, repoPath, telegram)
  }
}

/**
 * Process a MERGE decision via local git merge (fallback).
 */
async function processMergeLocally(
  task: { id: string; title: string; agent: string | null; repo_path: string },
  branchName: string,
  repoPath: string,
  telegram: ReturnType<typeof getTelegramService>
): Promise<void> {
  const mergeResult = await mergeBranch(repoPath, branchName, task.title)

  if (mergeResult.success) {
    console.log(`[Shepherd] MERGE SUCCESS (local): ${branchName}`)

    await cleanupWorkspace(task.id, repoPath, true).catch(err =>
      console.error(`[Shepherd] Cleanup failed for ${task.id}:`, err)
    )

    await queries.updateTask(task.id, {
      worktree_path: null,
      branch_name: null,
    })

    if (telegram?.isConnected()) {
      const msg = formatMergeSuccess(repoPath, branchName, task.agent ?? 'unknown', mergeResult.filesChanged)
      telegram.sendMessage(msg).catch(e => console.error('[Shepherd] Telegram error:', e))
    }
  } else {
    console.log(`[Shepherd] MERGE CONFLICT: ${branchName} - ${mergeResult.conflicts?.join(', ')}`)

    if (telegram?.isConnected()) {
      const msg = formatMergeConflict(repoPath, branchName, task.agent ?? 'unknown', mergeResult.conflicts ?? [])
      telegram.sendMessage(msg).catch(e => console.error('[Shepherd] Telegram error:', e))
    }
  }
}

/**
 * Merge a task branch into the default branch.
 *
 * Uses --no-ff to preserve branch history. On conflict, aborts the merge
 * and returns the list of conflicting files.
 */
async function mergeBranch(
  repoPath: string,
  branchName: string,
  taskTitle: string
): Promise<{ success: boolean; filesChanged: number; conflicts?: string[] }> {
  // Detect default branch
  const defaultBranch = await detectDefaultBranch(repoPath)

  // Checkout default branch
  const checkout = await runGitSafe(['checkout', defaultBranch], repoPath)
  if (checkout.exitCode !== 0) {
    return { success: false, filesChanged: 0, conflicts: [`Failed to checkout ${defaultBranch}: ${checkout.stderr}`] }
  }

  // Attempt merge with --no-ff
  const commitMsg = `merge: ${taskTitle}`
  const merge = await runGitSafe(
    ['merge', '--no-ff', branchName, '-m', commitMsg],
    repoPath
  )

  if (merge.exitCode === 0) {
    // Count files changed in the merge
    const diffStat = await runGitSafe(['diff', '--stat', 'HEAD~1', 'HEAD'], repoPath)
    const fileLines = diffStat.stdout.split('\n').filter(l => l.includes('|'))
    return { success: true, filesChanged: fileLines.length }
  }

  // Merge failed - likely conflict. Get conflict file list.
  const conflictFiles = await runGitSafe(['diff', '--name-only', '--diff-filter=U'], repoPath)
  const conflicts = conflictFiles.stdout
    ? conflictFiles.stdout.split('\n').filter(f => f.length > 0)
    : ['Unknown conflict']

  // Abort the merge to restore clean state
  await runGitSafe(['merge', '--abort'], repoPath)

  return { success: false, filesChanged: 0, conflicts }
}

/**
 * Detect the default branch for a repo.
 */
async function detectDefaultBranch(repoPath: string): Promise<string> {
  const mainCheck = await runGitSafe(['rev-parse', '--verify', 'main'], repoPath)
  if (mainCheck.exitCode === 0) return 'main'

  const masterCheck = await runGitSafe(['rev-parse', '--verify', 'master'], repoPath)
  if (masterCheck.exitCode === 0) return 'master'

  return 'HEAD'
}

/**
 * Execute a git command and return exit code without throwing.
 */
async function runGitSafe(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = spawn({
    cmd: ['git', ...args],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}

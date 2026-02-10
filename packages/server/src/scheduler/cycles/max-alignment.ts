/**
 * Max Alignment Cycle - repo-level health auditing
 *
 * Responsibilities:
 * - Check repos that have accumulated enough shepherd evaluations since last alignment
 * - Dispatch Max Alignment agent (claude/opus) per eligible repo
 * - Parse XML output for health status, cleanup actions, patterns, warnings
 * - Store results in memory (patterns/warnings) and system_agent_runs
 * - Broadcast SSE events and send Telegram notifications
 *
 * Trigger: count shepherd evaluations since last max_alignment run >= threshold
 * Runs in: the repo's working directory (NOT a worktree - modifies repo directly)
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import { buildMycelContext, buildMcpSection, buildMemorySection } from '../../prompts/context'
import { buildMaxAlignmentPrompt, type MaxAlignmentResult } from '../../prompts/max-alignment'
import { getTelegramService } from '../../telegram'
import { formatMaxAlignmentReport } from '../../telegram/messages'
import { registerActiveRun, unregisterActiveRun, isMaxAlignmentRunningForRepo } from '../active-runs'
import { getRawSqlite } from '../../db'

// =============================================================================
// Cycle Entry Point
// =============================================================================

/**
 * Run the Max Alignment cycle.
 * Checks all repos for trigger threshold and dispatches alignment agent.
 */
export async function runMaxAlignmentCycle(
  config: SchedulerConfig,
  specificRepo?: string,
): Promise<void> {
  console.log('[MaxAlignment] Starting cycle...')

  const repos = await queries.getRepos()
  if (repos.length === 0) {
    console.log('[MaxAlignment] No repos registered')
    return
  }

  const targetRepos = specificRepo
    ? repos.filter((r) => r.path === specificRepo)
    : repos

  for (const repo of targetRepos) {
    // Skip if already running for this repo
    if (isMaxAlignmentRunningForRepo(repo.path)) {
      console.log(`[MaxAlignment] ${repo.name} already being audited, skipping`)
      continue
    }

    const shouldRun = specificRepo
      ? true // Manual trigger always runs
      : await shouldRunMaxAlignment(repo.path, config)

    if (shouldRun) {
      console.log(`[MaxAlignment] ${repo.name} eligible for alignment audit`)
      await runMaxAlignmentForRepo(repo)
    }
  }
}

// =============================================================================
// Trigger Check
// =============================================================================

/**
 * Check if max alignment should run for a repo.
 * Counts shepherd evaluations since the last completed max_alignment run.
 */
export async function shouldRunMaxAlignment(
  repoPath: string,
  config: SchedulerConfig,
): Promise<boolean> {
  const threshold = config.max_alignment_shepherd_trigger ?? 2
  const sqlite = getRawSqlite()

  const row = sqlite.prepare(`
    SELECT COUNT(*) as eval_count FROM shepherd_evaluations
    WHERE repo_path = ?
      AND evaluated_at > COALESCE(
        (SELECT MAX(completed_at) FROM system_agent_runs
         WHERE agent_type = 'max_alignment' AND repo_path = ? AND status = 'completed'),
        '1970-01-01'
      )
  `).get(repoPath, repoPath) as { eval_count: number } | null

  const evalCount = row?.eval_count ?? 0

  if (evalCount >= threshold) {
    console.log(`[MaxAlignment] ${repoPath} has ${evalCount} shepherd evals since last alignment (threshold: ${threshold})`)
    return true
  }

  return false
}

// =============================================================================
// Per-Repo Execution
// =============================================================================

/**
 * Run Max Alignment for a specific repo.
 */
async function runMaxAlignmentForRepo(
  repo: Awaited<ReturnType<typeof queries.getRepo>>,
): Promise<void> {
  if (!repo) return

  const repoPath = repo.path
  const repoName = repo.name

  console.log(`[MaxAlignment] Auditing ${repoName}`)

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'max_alignment',
    repo_path: repoPath,
  })

  // Register active run
  registerActiveRun({
    run_id: run.id,
    agent_type: 'max_alignment',
    repo_path: repoPath,
    started_at: new Date().toISOString(),
  })

  // Broadcast start
  broadcast('max_alignment:started', {
    type: 'max_alignment:started',
    run_id: run.id,
    repo_path: repoPath,
    repo_name: repoName,
    timestamp: new Date().toISOString(),
  })

  try {
    // Build context
    const mycelContext = buildMycelContext({
      role: 'max_alignment',
      agentId: 'max_alignment',
    })
    const mcpSection = buildMcpSection('claude')
    const memorySection = await buildMemorySection(repoPath)

    // Get recent completed tasks for this repo
    const recentTasks = await queries.getTasks({
      repo_path: repoPath,
      status: 'done',
      limit: 20,
    })

    // Build prompt
    const prompt = buildMaxAlignmentPrompt({
      repo: { path: repoPath, name: repoName, description: repo.description },
      recentTasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        agent: t.agent,
        model: t.model,
        completed_at: t.completed_at,
      })),
      mycelContext,
      mcpSection,
      memorySection,
    })

    // Collect session log
    const sessionLog: Array<{ chunk: string; stream: string; timestamp: string }> = []

    // Dispatch to claude/opus
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath,
      model: 'opus',
      taskId: run.id,
      timeout: 2400, // 40 min
      extraEnv: {
        GIT_AUTHOR_NAME: 'max-alignment/claude/opus (mycelium)',
        GIT_AUTHOR_EMAIL: 'max-alignment+claude+opus@mycelium.local',
        GIT_COMMITTER_NAME: 'max-alignment/claude/opus (mycelium)',
        GIT_COMMITTER_EMAIL: 'max-alignment+claude+opus@mycelium.local',
      },
      onOutput: (chunk, stream = 'stdout') => {
        sessionLog.push({ chunk, stream, timestamp: new Date().toISOString() })
        broadcast('agent:output', {
          type: 'agent:output',
          run_id: run.id,
          agent_type: 'max_alignment',
          chunk,
          stream,
          timestamp: new Date().toISOString(),
        })
      },
    })

    // Record fruiting session
    queries.createFruitingSession({
      task_id: run.id,
      repo_path: repoPath,
      agent: 'claude',
      model: 'opus',
      context_trace: { agent_type: 'max_alignment' },
      full_prompt: prompt,
      session_log: sessionLog,
    }).catch((e) => console.error('[MaxAlignment] Failed to record fruiting session:', e))

    if (!result.success) {
      await queries.failRun(run.id, result.output.slice(0, 500))
      console.log(`[MaxAlignment] ${repoName} agent failed: ${result.output.slice(0, 100)}`)

      broadcast('agent:failed', {
        type: 'agent:failed',
        run_id: run.id,
        agent_type: 'max_alignment',
        error: result.output.slice(0, 200),
        timestamp: new Date().toISOString(),
      })
      return
    }

    // Parse output
    const parsed = parseMaxAlignmentOutput(result.output)

    if (parsed) {
      // Process results (store patterns, warnings, send notifications)
      await processMaxAlignmentResult(repoPath, repoName, parsed)

      console.log(`[MaxAlignment] ${repoName}: ${parsed.health} - ${parsed.headline}`)

      // Broadcast completion with health
      broadcast('max_alignment:completed', {
        type: 'max_alignment:completed',
        run_id: run.id,
        repo_path: repoPath,
        repo_name: repoName,
        health: parsed.health,
        headline: parsed.headline,
        duration_seconds: result.duration_seconds,
        timestamp: new Date().toISOString(),
      })

      // Broadcast specific events
      if (parsed.documentation?.claude_md?.action === 'rewritten') {
        broadcast('max_alignment:claude_md_rewritten', {
          type: 'max_alignment:claude_md_rewritten',
          repo_path: repoPath,
          repo_name: repoName,
          summary: parsed.documentation.claude_md.summary,
          timestamp: new Date().toISOString(),
        })
      }

      const deletedFiles = parsed.cleanup?.deleted_files?.length ?? 0
      const deletedBranches = parsed.cleanup?.deleted_branches?.length ?? 0
      if (deletedFiles > 0 || deletedBranches > 0) {
        broadcast('max_alignment:cleanup', {
          type: 'max_alignment:cleanup',
          repo_path: repoPath,
          repo_name: repoName,
          deleted_files: deletedFiles,
          deleted_branches: deletedBranches,
          timestamp: new Date().toISOString(),
        })
      }

      const criticalBugs = parsed.runtime_check?.critical_bugs?.length ?? 0
      if (criticalBugs > 0) {
        broadcast('max_alignment:critical_bug_found', {
          type: 'max_alignment:critical_bug_found',
          repo_path: repoPath,
          repo_name: repoName,
          bug_count: criticalBugs,
          bugs: parsed.runtime_check!.critical_bugs,
          timestamp: new Date().toISOString(),
        })
      }

      // Send Telegram notification
      const telegram = getTelegramService()
      if (telegram?.isConnected()) {
        const report = formatMaxAlignmentReport({
          repo_path: repoPath,
          repo_name: repoName,
          health: parsed.health,
          headline: parsed.headline,
          build_status: parsed.runtime_check?.build?.status,
          test_status: parsed.runtime_check?.tests?.status,
          test_count: parsed.runtime_check?.tests?.count,
          test_passing: parsed.runtime_check?.tests?.passing,
          test_failing: parsed.runtime_check?.tests?.failing,
          runtime_status: parsed.runtime_check?.runtime?.status,
          critical_bugs: parsed.runtime_check?.critical_bugs?.length ?? 0,
          claude_md_action: parsed.documentation?.claude_md?.action,
          deleted_files: deletedFiles,
          deleted_branches: deletedBranches,
        })
        telegram.sendMessage(report).catch((e) =>
          console.error('[MaxAlignment] Telegram notify error:', e)
        )
      }
    } else {
      console.log(`[MaxAlignment] ${repoName}: Could not parse alignment output`)
    }

    await queries.completeRun(run.id, result.output)
    console.log(`[MaxAlignment] ${repoName} completed`)

    broadcast('agent:completed', {
      type: 'agent:completed',
      run_id: run.id,
      agent_type: 'max_alignment',
      duration_seconds: result.duration_seconds,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error(`[MaxAlignment] ${repoName} error:`, error)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'max_alignment',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  } finally {
    unregisterActiveRun(run.id)
  }
}

// =============================================================================
// XML Output Parser
// =============================================================================

/**
 * Parse max alignment XML output.
 */
export function parseMaxAlignmentOutput(output: string): MaxAlignmentResult | null {
  const blockMatch = output.match(
    /<max_alignment_result\s+health="(healthy|warning|critical)">([\s\S]*?)<\/max_alignment_result>/
  )
  if (!blockMatch) return null

  const health = blockMatch[1] as MaxAlignmentResult['health']
  const body = blockMatch[2]

  const result: MaxAlignmentResult = { health, headline: '' }

  // Headline
  const headlineMatch = body.match(/<headline>([\s\S]*?)<\/headline>/)
  if (headlineMatch) result.headline = headlineMatch[1].trim()

  // Runtime check
  const runtimeBlock = body.match(/<runtime_check>([\s\S]*?)<\/runtime_check>/)
  if (runtimeBlock) {
    const rb = runtimeBlock[1]
    result.runtime_check = {}

    const buildMatch = rb.match(/<build\s+status="([^"]*)">([\s\S]*?)<\/build>/)
    if (buildMatch) {
      result.runtime_check.build = { status: buildMatch[1], summary: buildMatch[2].trim() }
    }

    const testsMatch = rb.match(/<tests\s+([^>]*)\/>/)
    if (testsMatch) {
      const attrs = testsMatch[1]
      const status = attrs.match(/status="([^"]*)"/)
      const count = attrs.match(/count="(\d+)"/)
      const passing = attrs.match(/passing="(\d+)"/)
      const failing = attrs.match(/failing="(\d+)"/)
      result.runtime_check.tests = {
        status: status?.[1] ?? 'unknown',
        count: count ? +count[1] : undefined,
        passing: passing ? +passing[1] : undefined,
        failing: failing ? +failing[1] : undefined,
      }
    }

    const runtimeMatch = rb.match(/<runtime\s+status="([^"]*)">([\s\S]*?)<\/runtime>/)
    if (runtimeMatch) {
      result.runtime_check.runtime = { status: runtimeMatch[1], summary: runtimeMatch[2].trim() }
    }

    const bugsBlock = rb.match(/<critical_bugs>([\s\S]*?)<\/critical_bugs>/)
    if (bugsBlock) {
      const bugs: NonNullable<MaxAlignmentResult['runtime_check']>['critical_bugs'] = []
      const bugRegex = /<bug\s+([^>]*)>([\s\S]*?)<\/bug>/g
      let bugMatch
      while ((bugMatch = bugRegex.exec(bugsBlock[1])) !== null) {
        const attrs = bugMatch[1]
        const file = attrs.match(/file="([^"]*)"/)
        const line = attrs.match(/line="(\d+)"/)
        bugs.push({
          file: file?.[1] ?? 'unknown',
          line: line ? +line[1] : undefined,
          description: bugMatch[2].trim(),
        })
      }
      if (bugs.length > 0) result.runtime_check.critical_bugs = bugs
    }
  }

  // Documentation
  const docBlock = body.match(/<documentation>([\s\S]*?)<\/documentation>/)
  if (docBlock) {
    const db = docBlock[1]
    result.documentation = {}

    const claudeMatch = db.match(/<claude_md\s+action="([^"]*)">([\s\S]*?)<\/claude_md>/)
    if (claudeMatch) {
      result.documentation.claude_md = { action: claudeMatch[1], summary: claudeMatch[2].trim() }
    }

    const readmeMatch = db.match(/<readme_md\s+action="([^"]*)">([\s\S]*?)<\/readme_md>/)
    if (readmeMatch) {
      result.documentation.readme_md = { action: readmeMatch[1], summary: readmeMatch[2].trim() }
    }
  }

  // Cleanup
  const cleanupBlock = body.match(/<cleanup>([\s\S]*?)<\/cleanup>/)
  if (cleanupBlock) {
    const cb = cleanupBlock[1]
    result.cleanup = {}

    const filesBlock = cb.match(/<deleted_files>([\s\S]*?)<\/deleted_files>/)
    if (filesBlock) {
      const files: Array<{ path: string; reason: string }> = []
      const fileRegex = /<file\s+reason="([^"]*)">([\s\S]*?)<\/file>/g
      let fileMatch
      while ((fileMatch = fileRegex.exec(filesBlock[1])) !== null) {
        files.push({ reason: fileMatch[1], path: fileMatch[2].trim() })
      }
      if (files.length > 0) result.cleanup.deleted_files = files
    }

    const branchBlock = cb.match(/<deleted_branches>([\s\S]*?)<\/deleted_branches>/)
    if (branchBlock) {
      const branches: string[] = []
      const branchRegex = /<branch>([\s\S]*?)<\/branch>/g
      let branchMatch
      while ((branchMatch = branchRegex.exec(branchBlock[1])) !== null) {
        branches.push(branchMatch[1].trim())
      }
      if (branches.length > 0) result.cleanup.deleted_branches = branches
    }
  }

  // Git health
  const gitBlock = body.match(/<git_health>([\s\S]*?)<\/git_health>/)
  if (gitBlock) {
    const gb = gitBlock[1]
    result.git_health = {}

    const wtMatch = gb.match(/<working_tree\s+status="([^"]*)"/)
    if (wtMatch) result.git_health.working_tree = { status: wtMatch[1] }

    const rsMatch = gb.match(/<remote_sync\s+status="([^"]*)"(?:\s+details="([^"]*)")?/)
    if (rsMatch) result.git_health.remote_sync = { status: rsMatch[1], details: rsMatch[2] }

    const bcMatch = gb.match(/<branch_count\s+total="(\d+)"\s+stale="(\d+)"/)
    if (bcMatch) result.git_health.branch_count = { total: +bcMatch[1], stale: +bcMatch[2] }
  }

  // Vision alignment
  const visionBlock = body.match(/<vision_alignment>([\s\S]*?)<\/vision_alignment>/)
  if (visionBlock) {
    const vb = visionBlock[1]
    const assessment = vb.match(/<assessment>([\s\S]*?)<\/assessment>/)
    const drift = vb.match(/<drift>([\s\S]*?)<\/drift>/)
    result.vision_alignment = {
      assessment: assessment?.[1]?.trim() ?? '',
      drift: drift?.[1]?.trim(),
    }
  }

  // Patterns
  const patternsBlock = body.match(/<patterns>([\s\S]*?)<\/patterns>/)
  if (patternsBlock) {
    const patterns: Array<{ content: string; tags?: string[] }> = []
    const patternRegex = /<pattern(?:\s+tags="([^"]*)")?\s*>([\s\S]*?)<\/pattern>/g
    let m
    while ((m = patternRegex.exec(patternsBlock[1])) !== null) {
      patterns.push({
        content: m[2].trim(),
        tags: m[1] ? m[1].split(',').map((t) => t.trim()) : undefined,
      })
    }
    if (patterns.length > 0) result.patterns = patterns
  }

  // Warnings
  const warningsBlock = body.match(/<warnings>([\s\S]*?)<\/warnings>/)
  if (warningsBlock) {
    const warnings: Array<{ content: string; severity?: string }> = []
    const warningRegex = /<warning(?:\s+severity="([^"]*)")?\s*>([\s\S]*?)<\/warning>/g
    let m
    while ((m = warningRegex.exec(warningsBlock[1])) !== null) {
      warnings.push({
        content: m[2].trim(),
        severity: m[1] || undefined,
      })
    }
    if (warnings.length > 0) result.warnings = warnings
  }

  return result
}

// =============================================================================
// Result Processing
// =============================================================================

/**
 * Process a parsed max alignment result.
 * Stores patterns/warnings in memory, sends notifications.
 */
async function processMaxAlignmentResult(
  repoPath: string,
  repoName: string,
  result: MaxAlignmentResult,
): Promise<void> {
  // Store patterns in memory
  for (const pattern of result.patterns ?? []) {
    await queries.createPattern({
      content: pattern.content,
      source: 'max_alignment',
      repo_path: repoPath,
      tags: pattern.tags ?? [],
    }).catch((e) => console.error('[MaxAlignment] Failed to store pattern:', e))
  }

  // Store warnings in memory
  for (const warning of result.warnings ?? []) {
    await queries.createWarning({
      content: warning.content,
      severity: warning.severity ?? 'medium',
      repo_path: repoPath,
    }).catch((e) => console.error('[MaxAlignment] Failed to store warning:', e))
  }

  // Store critical bugs as high-severity warnings
  for (const bug of result.runtime_check?.critical_bugs ?? []) {
    await queries.createWarning({
      content: `[CRITICAL BUG] ${bug.file}${bug.line ? `:${bug.line}` : ''} - ${bug.description}`,
      severity: 'high',
      repo_path: repoPath,
    }).catch((e) => console.error('[MaxAlignment] Failed to store critical bug warning:', e))
  }
}

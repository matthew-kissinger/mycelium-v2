/**
 * Compaction Cycle - intelligent memory management
 *
 * Dispatches to Haiku to analyze patterns/warnings.
 * Agent outputs the new memory directly - cycle replaces old with new.
 *
 * Also handles:
 * - Session log TTL cleanup
 * - Auto-pruning old completed tasks
 */

import { SchedulerConfig } from '@mycelium/shared'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import { buildMycelContext } from '../../prompts/context'
import { buildCompactionPrompt, parseCompactionOutput, type CompactionContext, type CompactionOutput } from '../../prompts/compaction'
import { registerActiveRun, unregisterActiveRun } from '../active-runs'
import { getTelegramService } from '../../telegram'

/**
 * Run the Compaction cycle.
 * Runs every 4 hours, dispatches to Haiku for intelligent cleanup.
 */
export async function runCompactionCycle(config: SchedulerConfig): Promise<void> {
  // TTL cleanups run every cycle regardless of agent dispatch
  try {
    await queries.cleanExpiredSessionLogs()
  } catch (e) {
    console.error('[Compaction] Session log cleanup error:', e)
  }
  try {
    await queries.cleanExpiredSessionPrompts(7) // 7-day retention for full_prompt
  } catch (e) {
    console.error('[Compaction] Session prompt cleanup error:', e)
  }
  try {
    const historyPruned = await queries.pruneConfigHistory(90, 1000)
    if (historyPruned > 0) console.log(`[Compaction] Pruned ${historyPruned} old config_history entries`)
  } catch (e) {
    console.error('[Compaction] Config history cleanup error:', e)
  }

  console.log('[Compaction] Starting cycle...')

  const now = new Date()

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'compaction',
    context: { scheduled: true },
  })

  // Register active run
  registerActiveRun({
    run_id: run.id,
    agent_type: 'compaction',
    started_at: now.toISOString(),
  })

  // Broadcast event
  broadcast('agent:started', {
    type: 'agent:started',
    run_id: run.id,
    agent_type: 'compaction',
    timestamp: now.toISOString(),
  })

  try {
    // Auto-prune old tasks FIRST (fast, no agent needed)
    let pruneCount = 0
    if (config.auto_prune_enabled) {
      pruneCount = await pruneOldTasks(config)
      // Also prune old failed/cancelled tasks (30-day retention, keep 50 recent)
      const failedPruned = await queries.pruneFailedAndCancelledTasks(30, 50)
      if (failedPruned > 0) {
        console.log(`[Compaction] Pruned ${failedPruned} old failed/cancelled tasks`)
      }
      pruneCount += failedPruned
    }

    // Then compact memory per repo (slower, uses Haiku)
    const repos = await queries.getRepos()

    const repoResults: string[] = []
    let totalRemoved = 0
    let totalPatternsBefore = 0
    let totalPatternsAfter = 0
    let totalWarningsBefore = 0
    let totalWarningsAfter = 0

    // For each repo, run intelligent compaction
    for (const repo of repos) {
      const result = await compactRepoMemory(repo.path, repo.name)
      if (result) {
        totalRemoved += result.removed
        totalPatternsBefore += result.patternsBefore
        totalPatternsAfter += result.patternsAfter
        totalWarningsBefore += result.warningsBefore
        totalWarningsAfter += result.warningsAfter
        if (result.removed > 0 || result.changed) {
          repoResults.push(`${repo.name}: -${result.removed}`)
        }
      }
    }

    const parts: string[] = []
    if (pruneCount > 0) parts.push(`pruned ${pruneCount} tasks`)
    if (repoResults.length > 0) parts.push(repoResults.join(', '))

    const summary = parts.length > 0
      ? `Compacted ${repos.length} repos (${parts.join('; ')})`
      : `Compacted ${repos.length} repos (no changes needed)`

    await queries.completeRun(run.id, summary)
    console.log(`[Compaction] ${summary}`)

    // Send Telegram notification
    await sendCompactionNotification(pruneCount, totalRemoved, repos.length)

    broadcast('agent:completed', {
      type: 'agent:completed',
      run_id: run.id,
      agent_type: 'compaction',
      duration_seconds: (Date.now() - now.getTime()) / 1000,
      timestamp: new Date().toISOString(),
    })

    // Broadcast compaction-specific event with actual memory stats
    broadcast('memory:compaction_completed', {
      type: 'memory:compaction_completed',
      patterns_before: totalPatternsBefore,
      patterns_after: totalPatternsAfter,
      warnings_before: totalWarningsBefore,
      warnings_after: totalWarningsAfter,
      repos_processed: repos.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error('[Compaction] Error:', error)

    // Send error notification
    await sendCompactionNotification(0, 0, 0, errorMsg)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'compaction',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  } finally {
    unregisterActiveRun(run.id)
  }
}

/**
 * Run compaction manually (for API trigger).
 */
export async function runCompactionCycleManual(config: SchedulerConfig): Promise<void> {
  console.log('[Compaction] Starting manual compaction...')

  // TTL cleanups
  try {
    await queries.cleanExpiredSessionLogs()
    await queries.cleanExpiredSessionPrompts(7)
    await queries.pruneConfigHistory(90, 1000)
  } catch (e) {
    console.error('[Compaction] Cleanup error:', e)
  }

  const run = await queries.createRun({
    agent_type: 'compaction',
    context: { scheduled: false, manual: true },
  })

  broadcast('agent:started', {
    type: 'agent:started',
    run_id: run.id,
    agent_type: 'compaction',
    timestamp: new Date().toISOString(),
  })

  try {
    // Prune first (fast)
    let pruneCount = 0
    if (config.auto_prune_enabled) {
      pruneCount = await pruneOldTasks(config)
      pruneCount += await queries.pruneFailedAndCancelledTasks(30, 50)
    }

    // Then compact memory (slower, uses Haiku)
    const repos = await queries.getRepos()
    let totalRemoved = 0

    for (const repo of repos) {
      const result = await compactRepoMemory(repo.path, repo.name)
      if (result) {
        totalRemoved += result.removed
      }
    }

    const parts: string[] = []
    if (pruneCount > 0) parts.push(`pruned ${pruneCount} tasks`)
    if (totalRemoved > 0) parts.push(`memory: -${totalRemoved}`)
    const summary = parts.length > 0 ? parts.join(', ') : 'no changes'

    await queries.completeRun(run.id, `Compacted ${repos.length} repos (${summary})`)
    console.log('[Compaction] Manual compaction completed')

    broadcast('agent:completed', {
      type: 'agent:completed',
      run_id: run.id,
      agent_type: 'compaction',
      duration_seconds: 0,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error('[Compaction] Error:', error)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'compaction',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
    throw error
  }
}

/**
 * Compact memory for a single repo using Haiku.
 * Agent outputs new memory directly - we replace old with new.
 */
interface CompactResult {
  removed: number
  changed: boolean
  patternsBefore: number
  patternsAfter: number
  warningsBefore: number
  warningsAfter: number
}

async function compactRepoMemory(repoPath: string, repoName: string): Promise<CompactResult | null> {
  // Get current patterns and warnings
  const patterns = await queries.getPatterns({ repo_path: repoPath, limit: 200 })
  const warnings = await queries.getWarnings({ repo_path: repoPath, limit: 200 })

  const patternsBefore = patterns.length
  const warningsBefore = warnings.length

  // Skip if no memory to compact
  if (patternsBefore === 0 && warningsBefore === 0) {
    console.log(`[Compaction] ${repoName}: No memory to compact`)
    return { removed: 0, changed: false, patternsBefore: 0, patternsAfter: 0, warningsBefore: 0, warningsAfter: 0 }
  }

  // For very small memory sets, skip agent (not worth the API call)
  if (patternsBefore < 3 && warningsBefore < 2) {
    console.log(`[Compaction] ${repoName}: Memory too small to compact (${patternsBefore}p/${warningsBefore}w)`)
    return { removed: 0, changed: false, patternsBefore, patternsAfter: patternsBefore, warningsBefore, warningsAfter: warningsBefore }
  }

  console.log(`[Compaction] ${repoName}: Analyzing ${patternsBefore} patterns, ${warningsBefore} warnings`)

  // Build context
  const context = await buildCompactionContext(repoPath, repoName, patterns, warnings)

  // Build prompt
  const mycelContext = buildMycelContext({
    role: 'compaction',
    agentId: 'compaction',
  })
  const prompt = buildCompactionPrompt(context, mycelContext)

  // Dispatch to Haiku
  const result = await dispatch({
    agent: 'claude',
    prompt,
    cwd: repoPath,
    model: 'haiku',
    timeout: 300, // 5 min per repo should be plenty
  })

  if (!result.success) {
    console.log(`[Compaction] ${repoName}: Agent failed - ${result.error || 'unknown error'}`)
    return null
  }

  // Parse output
  const output = parseCompactionOutput(result.output)

  if (!output) {
    console.log(`[Compaction] ${repoName}: Could not parse agent output`)
    return null
  }

  // Apply the new memory state
  const applied = await applyNewMemory(repoPath, patterns, warnings, output)

  if (applied.removed > 0 || applied.added > 0) {
    console.log(`[Compaction] ${repoName}: ${patternsBefore}p/${warningsBefore}w -> ${output.patterns.length}p/${output.warnings.length}w (removed ${applied.removed}, added ${applied.added})`)
    if (output.notes) {
      console.log(`[Compaction] ${repoName}: ${output.notes}`)
    }
  } else {
    console.log(`[Compaction] ${repoName}: No changes needed`)
  }

  return {
    removed: applied.removed,
    changed: applied.removed > 0 || applied.added > 0,
    patternsBefore,
    patternsAfter: output.patterns.length,
    warningsBefore,
    warningsAfter: output.warnings.length,
  }
}

/**
 * Build context for the Compaction agent.
 */
async function buildCompactionContext(
  repoPath: string,
  repoName: string,
  patterns: Awaited<ReturnType<typeof queries.getPatterns>>,
  warnings: Awaited<ReturnType<typeof queries.getWarnings>>
): Promise<CompactionContext> {
  // Get recent task titles for relevance assessment
  const recentTasks = await queries.getTasks({ repo_path: repoPath, limit: 20 })
  const recentTaskTitles = recentTasks.map((t) => t.title)

  // Get tech stack from package.json
  let techStack: string[] | undefined
  const packageJsonPath = join(repoPath, 'package.json')
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      techStack = [
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {}),
      ].slice(0, 30)
    } catch {
      // Ignore parse errors
    }
  }

  return {
    repoPath,
    repoName,
    patterns: patterns.map((p) => ({
      id: p.id,
      content: p.content,
      tags: typeof p.tags === 'string' ? JSON.parse(p.tags) : (p.tags ?? []),
      source: p.source ?? undefined,
      created_at: p.created_at,
    })),
    warnings: warnings.map((w) => ({
      id: w.id,
      content: w.content,
      severity: w.severity,
      created_at: w.created_at,
    })),
    recentTaskTitles,
    techStack,
  }
}

/**
 * Apply the new memory state from agent output.
 * Delete old patterns/warnings, insert new ones.
 */
async function applyNewMemory(
  repoPath: string,
  oldPatterns: Awaited<ReturnType<typeof queries.getPatterns>>,
  oldWarnings: Awaited<ReturnType<typeof queries.getWarnings>>,
  output: CompactionOutput
): Promise<{ removed: number; added: number }> {
  let removed = 0
  let added = 0

  // Delete all old patterns for this repo
  for (const pattern of oldPatterns) {
    try {
      await queries.deletePattern(pattern.id)
      removed++
    } catch (e) {
      console.error(`[Compaction] Failed to delete pattern ${pattern.id}:`, e)
    }
  }

  // Delete all old warnings for this repo
  for (const warning of oldWarnings) {
    try {
      await queries.deleteWarning(warning.id)
      removed++
    } catch (e) {
      console.error(`[Compaction] Failed to delete warning ${warning.id}:`, e)
    }
  }

  // Insert new patterns
  for (const pattern of output.patterns) {
    try {
      await queries.createPattern({
        content: pattern.content,
        source: 'compaction',
        repo_path: repoPath,
        tags: pattern.tags ?? [],
      })
      added++
    } catch (e) {
      console.error(`[Compaction] Failed to create pattern:`, e)
    }
  }

  // Insert new warnings
  for (const warning of output.warnings) {
    try {
      await queries.createWarning({
        content: warning.content,
        severity: warning.severity as 'low' | 'medium' | 'high',
        repo_path: repoPath,
      })
      added++
    } catch (e) {
      console.error(`[Compaction] Failed to create warning:`, e)
    }
  }

  // Net removed = old count - new count
  const netRemoved = (oldPatterns.length + oldWarnings.length) - (output.patterns.length + output.warnings.length)

  return { removed: Math.max(0, netRemoved), added }
}

/**
 * Prune old completed tasks to keep database manageable.
 * Returns number of tasks pruned.
 */
async function pruneOldTasks(config: SchedulerConfig): Promise<number> {
  // Get all done tasks
  const doneTasks = await queries.getTasks({ status: 'done', limit: config.auto_prune_threshold + 500 })

  if (doneTasks.length <= config.auto_prune_threshold) {
    console.log(`[Compaction] ${doneTasks.length} completed tasks, under threshold ${config.auto_prune_threshold}`)
    return 0
  }

  // Sort by completed_at (most recent first)
  const sorted = doneTasks.sort((a, b) => {
    const aTime = a.completed_at ?? a.created_at
    const bTime = b.completed_at ?? b.created_at
    return bTime.localeCompare(aTime)
  })

  // Keep the most recent N, delete the rest
  const toDelete = sorted.slice(config.auto_prune_keep)

  console.log(`[Compaction] Pruning ${toDelete.length} old tasks (keeping ${config.auto_prune_keep})`)

  for (const task of toDelete) {
    await queries.deleteTask(task.id)
  }

  console.log(`[Compaction] Pruned ${toDelete.length} old completed tasks`)
  return toDelete.length
}

/**
 * Send compaction notification via Telegram.
 */
async function sendCompactionNotification(
  pruned: number,
  memoryRemoved: number,
  repoCount: number,
  error?: string
): Promise<void> {
  const telegram = getTelegramService()
  if (!telegram?.isConnected()) return

  const lines: string[] = []

  if (error) {
    lines.push('🔴 <b>COMPACTION FAILED</b>')
    lines.push('')
    lines.push(error.slice(0, 200))
  } else {
    const hasChanges = pruned > 0 || memoryRemoved > 0
    lines.push(hasChanges ? '🧹 <b>COMPACTION</b>' : '✓ <b>COMPACTION</b> (no changes)')

    if (hasChanges) {
      lines.push('')
      if (pruned > 0) lines.push(`📋 Pruned ${pruned} old tasks`)
      if (memoryRemoved > 0) lines.push(`🧠 Memory: -${memoryRemoved} items`)
      lines.push(`📁 ${repoCount} repos processed`)
    }
  }

  await telegram.sendMessage(lines.join('\n')).catch((e) => {
    console.error('[Compaction] Telegram send error:', e)
  })
}

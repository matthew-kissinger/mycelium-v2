/**
 * Compaction Cycle - clean memory
 *
 * Responsibilities:
 * - Check if it's the scheduled compaction time (Monday 11am by default)
 * - Spawn compaction agent to clean up old patterns/warnings
 * - Prune old completed tasks if configured
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'

// Track last compaction to avoid running multiple times
let lastCompactionDate: string | null = null

/**
 * Run the Compaction cycle.
 * Only runs once per scheduled day (e.g., Monday 11am).
 */
export async function runCompactionCycle(config: SchedulerConfig): Promise<void> {
  // Session log TTL cleanup runs every cycle (hourly) regardless of compaction schedule
  try {
    await queries.cleanExpiredSessionLogs()
  } catch (e) {
    console.error('[Compaction] Session log cleanup error:', e)
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // Check if we already ran today
  if (lastCompactionDate === today) {
    return
  }

  // Check if it's the right day and hour
  const dayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, etc.
  const hour = now.getHours()

  if (dayOfWeek !== config.compaction_day || hour !== config.compaction_hour) {
    return
  }

  console.log('[Compaction] Starting weekly compaction...')
  lastCompactionDate = today

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'compaction',
    context: { scheduled: true },
  })

  // Broadcast event
  broadcast('system:agent_started', {
    type: 'system:agent_started',
    run_id: run.id,
    agent_type: 'compaction',
    timestamp: now.toISOString(),
  })

  try {
    // Get all repos for compaction
    const repos = await queries.getRepos()

    // For each repo, run compaction
    for (const repo of repos) {
      await compactRepoMemory(repo.path)
    }

    // Auto-prune old tasks if configured
    if (config.auto_prune_enabled) {
      await pruneOldTasks(config)
    }

    await queries.completeRun(run.id, `Compacted ${repos.length} repos`)
    console.log('[Compaction] Completed')

    broadcast('agent:completed', {
      type: 'agent:completed',
      run_id: run.id,
      agent_type: 'compaction',
      duration_seconds: (Date.now() - now.getTime()) / 1000,
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
  }
}

/**
 * Run compaction manually (bypasses day/hour check).
 */
export async function runCompactionCycleManual(config: SchedulerConfig): Promise<void> {
  console.log('[Compaction] Starting manual compaction...')

  // Session log TTL cleanup
  try {
    await queries.cleanExpiredSessionLogs()
  } catch (e) {
    console.error('[Compaction] Session log cleanup error:', e)
  }

  const run = await queries.createRun({
    agent_type: 'compaction',
    context: { scheduled: false, manual: true },
  })

  broadcast('system:agent_started', {
    type: 'system:agent_started',
    run_id: run.id,
    agent_type: 'compaction',
    timestamp: new Date().toISOString(),
  })

  try {
    const repos = await queries.getRepos()
    for (const repo of repos) {
      await compactRepoMemory(repo.path)
    }

    if (config.auto_prune_enabled) {
      await pruneOldTasks(config)
    }

    await queries.completeRun(run.id, `Compacted ${repos.length} repos`)
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
 * Compact memory for a single repo.
 * Could spawn an agent, or just do simple cleanup.
 */
async function compactRepoMemory(repoPath: string): Promise<void> {
  console.log(`[Compaction] Compacting memory for ${repoPath}`)

  // Get patterns and warnings
  const patterns = await queries.getPatterns({ repo_path: repoPath, limit: 200 })
  const warnings = await queries.getWarnings({ repo_path: repoPath, limit: 200 })

  // Simple compaction: remove duplicates and old items
  // More sophisticated compaction would use an agent

  // Remove duplicate patterns (same content)
  const seenPatterns = new Set<string>()
  let removedPatterns = 0

  for (const pattern of patterns) {
    const normalized = pattern.content.trim().toLowerCase()
    if (seenPatterns.has(normalized)) {
      await queries.deletePattern(pattern.id)
      removedPatterns++
    } else {
      seenPatterns.add(normalized)
    }
  }

  // Remove duplicate warnings (same content)
  const seenWarnings = new Set<string>()
  let removedWarnings = 0

  for (const warning of warnings) {
    const normalized = warning.content.trim().toLowerCase()
    if (seenWarnings.has(normalized)) {
      await queries.deleteWarning(warning.id)
      removedWarnings++
    } else {
      seenWarnings.add(normalized)
    }
  }

  if (removedPatterns > 0 || removedWarnings > 0) {
    console.log(`[Compaction] ${repoPath}: removed ${removedPatterns} duplicate patterns, ${removedWarnings} duplicate warnings`)
  }
}

/**
 * Prune old completed tasks to keep database manageable.
 */
async function pruneOldTasks(config: SchedulerConfig): Promise<void> {
  // Get all done tasks
  const doneTasks = await queries.getTasks({ status: 'done', limit: config.auto_prune_threshold + 100 })

  if (doneTasks.length <= config.auto_prune_threshold) {
    console.log(`[Compaction] ${doneTasks.length} completed tasks, under threshold ${config.auto_prune_threshold}`)
    return
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
}

/**
 * Scheduler - manages autonomous operation cycles
 *
 * Cycles:
 * - Dispatcher: Run ready tasks (every 60s)
 * - Discovery: Scan repos for work (every 15min)
 * - Shepherd: Evaluate completed batches (every 15min)
 * - Blocked Check: Detect stuck tasks (every 15min)
 * - Digest: Send status summaries (every 6h)
 * - Compaction: Clean memory (weekly Monday 11am)
 */

import { SchedulerConfig, CycleState, SchedulerStatus } from '@mycelium/shared'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from './config'
import { broadcast } from '../sse'

// Import cycle handlers
import { runDispatcherCycle } from './cycles/dispatcher'
import { runDiscoveryCycle } from './cycles/discovery'
import { runShepherdCycle } from './cycles/shepherd'
import { runBlockedCheckCycle } from './cycles/blocked'
import { runDigestCycle } from './cycles/digest'
import { runCompactionCycle } from './cycles/compaction'
import { runArmoryCycle, shouldRunArmory } from './cycles/armory'
import { runHealthCheckCycle } from './cycles/health'
import { runGitHubSyncCycle } from './cycles/github-sync'
import { runRegistryRefreshCycle } from './cycles/registry-refresh'
import { getTaskStats, upsertSchedulerStats, getSchedulerStats } from '../db/queries'

// Cycle names
export type CycleName =
  | 'dispatcher'
  | 'discovery'
  | 'shepherd'
  | 'armory'
  | 'digest'
  | 'compaction'
  | 'blocked_check'
  | 'health_check'
  | 'github_sync'
  | 'registry_refresh'

// Internal cycle state (extends public CycleState with interval ref)
interface InternalCycleState extends CycleState {
  intervalRef?: ReturnType<typeof setInterval>
}

// Re-export active run tracking (separate module to avoid circular imports)
export {
  type ActiveRun,
  registerActiveRun,
  unregisterActiveRun,
  getActiveRuns,
  isShepherdRunningForRepo,
} from './active-runs'

import { getActiveRuns, isShepherdRunningForRepo } from './active-runs'

// Scheduler instance
let schedulerState: {
  config: SchedulerConfig
  running: boolean
  startedAt?: string
  cycles: Map<CycleName, InternalCycleState>
} | null = null

/**
 * Get current scheduler status.
 */
export function getSchedulerStatus(): SchedulerStatus {
  if (!schedulerState) {
    // Scheduler not initialized - return defaults
    const defaultCycles: CycleState[] = [
      { name: 'dispatcher', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'discovery', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'shepherd', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'armory', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'digest', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'compaction', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'blocked_check', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'health_check', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'github_sync', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'registry_refresh', enabled: true, running: false, runs_completed: 0, errors: 0 },
    ]

    return {
      running: false,
      started_at: undefined,
      cycles: defaultCycles,
    }
  }

  return {
    running: schedulerState.running,
    started_at: schedulerState.startedAt,
    active_runs: getActiveRuns(),
    cycles: Array.from(schedulerState.cycles.values()).map((state) => ({
      name: state.name,
      enabled: state.enabled,
      running: state.running,
      last_run: state.last_run,
      next_run: state.next_run,
      runs_completed: state.runs_completed,
      errors: state.errors,
    })),
  }
}

/**
 * Get scheduler config.
 */
export function getSchedulerConfig(): SchedulerConfig {
  if (schedulerState) {
    return schedulerState.config
  }
  return loadConfig()
}

/**
 * Update scheduler config.
 */
export function updateSchedulerConfig(updates: Partial<SchedulerConfig>): SchedulerConfig {
  const current = loadConfig()
  const updated = { ...current, ...updates }
  saveConfig(updated)

  if (schedulerState) {
    schedulerState.config = updated
  }

  return updated
}

/**
 * Initialize scheduler state.
 */
function initializeScheduler(config: SchedulerConfig): void {
  const cycles = new Map<CycleName, InternalCycleState>()

  // Dispatcher cycle
  cycles.set('dispatcher', {
    name: 'dispatcher',
    enabled: config.dispatcher_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Discovery cycle
  cycles.set('discovery', {
    name: 'discovery',
    enabled: config.discovery_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Shepherd cycle (interval-based, checks for repos with unevaluated tasks)
  cycles.set('shepherd', {
    name: 'shepherd',
    enabled: config.shepherd_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Armory cycle (triggered by task completion batch, not interval)
  cycles.set('armory', {
    name: 'armory',
    enabled: config.armory_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Digest cycle
  cycles.set('digest', {
    name: 'digest',
    enabled: config.digest_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Compaction cycle
  cycles.set('compaction', {
    name: 'compaction',
    enabled: config.compaction_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Blocked check cycle
  cycles.set('blocked_check', {
    name: 'blocked_check',
    enabled: config.blocked_check_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Health check cycle (device monitoring)
  cycles.set('health_check', {
    name: 'health_check',
    enabled: config.health_check_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // GitHub sync cycle (repo metadata caching)
  cycles.set('github_sync', {
    name: 'github_sync',
    enabled: config.github_sync_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Registry refresh cycle (agent detection + model fetching)
  cycles.set('registry_refresh', {
    name: 'registry_refresh',
    enabled: config.registry_refresh_enabled,
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  schedulerState = {
    config,
    running: false,
    cycles,
  }

  // Load persisted stats from DB (async, non-blocking)
  loadPersistedStats()
}

/**
 * Load persisted scheduler cycle stats from the database.
 * Restores runs_completed, errors, and last_run from previous sessions.
 */
async function loadPersistedStats(): Promise<void> {
  if (!schedulerState) return

  try {
    const stats = await getSchedulerStats()
    for (const stat of stats) {
      const cycle = schedulerState.cycles.get(stat.cycle_name as CycleName)
      if (cycle) {
        cycle.runs_completed = stat.runs_completed
        cycle.errors = stat.errors
        if (stat.last_run_at) {
          cycle.last_run = stat.last_run_at
        }
      }
    }
    if (stats.length > 0) {
      console.log(`[Scheduler] Restored persisted stats for ${stats.length} cycles`)
    }
  } catch (error) {
    console.error('[Scheduler] Failed to load persisted stats:', error)
  }
}

/**
 * Compute next_run ISO string for a cycle based on its interval.
 */
function computeNextRun(cycleName: CycleName): string | undefined {
  if (!schedulerState) return undefined
  const config = schedulerState.config
  const intervalMap: Record<string, number | undefined> = {
    dispatcher: config.dispatcher_interval_sec,
    discovery: config.discovery_interval_sec,
    shepherd: config.shepherd_interval_sec,
    blocked_check: 15 * 60,
    digest: config.digest_interval_sec,
    compaction: config.compaction_interval_sec,
    armory: 60 * 60,
    health_check: config.health_check_interval_sec,
    github_sync: config.github_sync_interval_sec,
    registry_refresh: config.registry_refresh_interval_sec,
  }
  const interval = intervalMap[cycleName]
  if (!interval) return undefined
  return new Date(Date.now() + interval * 1000).toISOString()
}

/**
 * Wrapper to run a cycle with error handling and state updates.
 */
async function runCycle(
  cycleName: CycleName,
  handler: () => Promise<void>
): Promise<void> {
  if (!schedulerState) return

  const state = schedulerState.cycles.get(cycleName)
  if (!state || !state.enabled || state.running) {
    return
  }

  // Mark as running
  state.running = true
  const startTime = new Date()

  try {
    // Broadcast cycle start event
    broadcast('scheduler:cycle:started', {
      type: 'scheduler:cycle:started',
      cycle: cycleName,
      timestamp: startTime.toISOString(),
    })

    await handler()

    const durationMs = Date.now() - startTime.getTime()

    // Update state on success
    state.runs_completed++
    state.last_run = startTime.toISOString()
    state.next_run = computeNextRun(cycleName)
    console.log(`[Scheduler] ${cycleName} cycle completed (${durationMs}ms)`)

    // Persist stats to DB
    upsertSchedulerStats(cycleName, true, durationMs).catch((e) =>
      console.error(`[Scheduler] Failed to persist stats for ${cycleName}:`, e)
    )

    broadcast('scheduler:cycle:completed', {
      type: 'scheduler:cycle:completed',
      cycle: cycleName,
      duration_ms: durationMs,
      success: true,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const durationMs = Date.now() - startTime.getTime()
    const errorMsg = error instanceof Error ? error.message : String(error)

    // Update state on error
    state.errors++
    state.last_run = startTime.toISOString()
    state.next_run = computeNextRun(cycleName)
    console.error(`[Scheduler] ${cycleName} cycle failed:`, error)

    // Persist stats to DB
    upsertSchedulerStats(cycleName, false, durationMs, errorMsg).catch((e) =>
      console.error(`[Scheduler] Failed to persist stats for ${cycleName}:`, e)
    )

    broadcast('scheduler:cycle:completed', {
      type: 'scheduler:cycle:completed',
      cycle: cycleName,
      duration_ms: durationMs,
      success: false,
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  } finally {
    state.running = false
  }
}

/**
 * Start all scheduler cycles.
 */
function startCycles(): void {
  if (!schedulerState) return

  const config = schedulerState.config

  // Helper to start a cycle with interval and initial next_run
  const startCycle = (name: CycleName, handler: () => Promise<void>, intervalSec: number) => {
    const state = schedulerState!.cycles.get(name)!
    if (!state.enabled) return
    state.next_run = new Date(Date.now() + intervalSec * 1000).toISOString()
    state.intervalRef = setInterval(() => runCycle(name, handler), intervalSec * 1000)
    console.log(`[Scheduler] ${name} cycle started (every ${intervalSec}s)`)
  }

  startCycle('dispatcher', () => runDispatcherCycle(config), config.dispatcher_interval_sec)
  startCycle('discovery', () => runDiscoveryCycle(config), config.discovery_interval_sec)
  startCycle('shepherd', () => runShepherdCycle(config), config.shepherd_interval_sec)
  startCycle('blocked_check', () => runBlockedCheckCycle(config), 15 * 60)
  startCycle('digest', () => runDigestCycle(config), config.digest_interval_sec)
  startCycle('compaction', () => runCompactionCycle(config), config.compaction_interval_sec)
  startCycle('health_check', () => runHealthCheckCycle(config), config.health_check_interval_sec)
  startCycle('github_sync', () => runGitHubSyncCycle(config), config.github_sync_interval_sec)
  startCycle('registry_refresh', () => runRegistryRefreshCycle(config), config.registry_refresh_interval_sec)

  // Armory cycle - check every hour if batch threshold met
  const armoryState = schedulerState.cycles.get('armory')!
  if (armoryState.enabled) {
    armoryState.next_run = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    armoryState.intervalRef = setInterval(
      async () => {
        if (await shouldRunArmory(config)) {
          await runCycle('armory', () => runArmoryCycle(config))
        }
      },
      60 * 60 * 1000
    )
    console.log('[Scheduler] Armory cycle started (checks hourly)')
  }
}

/**
 * Stop all scheduler cycles.
 */
function stopCycles(): void {
  if (!schedulerState) return

  for (const [name, state] of schedulerState.cycles) {
    if (state.intervalRef) {
      clearInterval(state.intervalRef)
      state.intervalRef = undefined
      console.log(`[Scheduler] ${name} cycle stopped`)
    }
  }
}

/**
 * Auto-trigger discovery if there are no pending or running tasks.
 * Runs async so it doesn't block scheduler startup.
 */
async function autoTriggerDiscoveryIfEmpty(config: SchedulerConfig): Promise<void> {
  if (!schedulerState) return

  const discoveryState = schedulerState.cycles.get('discovery')
  if (!discoveryState?.enabled) return

  try {
    const stats = await getTaskStats()
    const activeTasks = stats.pending + stats.running

    if (activeTasks === 0) {
      console.log('[Scheduler] No active tasks, triggering discovery immediately')
      // Run discovery immediately (don't await - let it run in background)
      runCycle('discovery', () => runDiscoveryCycle(config))
    } else {
      console.log(`[Scheduler] ${activeTasks} active tasks, waiting for scheduled discovery`)
    }
  } catch (error) {
    console.error('[Scheduler] Failed to check task stats for auto-discovery:', error)
  }
}

/**
 * Start the scheduler.
 */
export function startScheduler(configOverrides?: Partial<SchedulerConfig>): SchedulerStatus {
  // Load config with any overrides
  const baseConfig = loadConfig()
  const config = configOverrides ? { ...baseConfig, ...configOverrides } : baseConfig

  // Initialize or update state
  if (!schedulerState) {
    initializeScheduler(config)
  } else {
    schedulerState.config = config
  }

  if (schedulerState!.running) {
    console.log('[Scheduler] Already running')
    return getSchedulerStatus()
  }

  schedulerState!.running = true
  schedulerState!.startedAt = new Date().toISOString()

  // Start all cycles
  startCycles()

  // Broadcast scheduler started event
  broadcast('scheduler:started', {
    type: 'scheduler:started',
    timestamp: schedulerState!.startedAt,
  })

  console.log('[Scheduler] Started')

  // Auto-trigger discovery if no active tasks
  autoTriggerDiscoveryIfEmpty(config)

  return getSchedulerStatus()
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): SchedulerStatus {
  if (!schedulerState || !schedulerState.running) {
    console.log('[Scheduler] Not running')
    return getSchedulerStatus()
  }

  // Stop all cycles
  stopCycles()

  schedulerState.running = false

  // Broadcast scheduler stopped event
  broadcast('scheduler:stopped', {
    type: 'scheduler:stopped',
    timestamp: new Date().toISOString(),
  })

  console.log('[Scheduler] Stopped')
  return getSchedulerStatus()
}

/**
 * Trigger Shepherd evaluation for a repo.
 * Allows per-repo concurrency - multiple repos can evaluate simultaneously,
 * but the same repo won't run twice.
 */
export async function triggerShepherdForRepo(repoPath: string): Promise<void> {
  if (!schedulerState) return

  const state = schedulerState.cycles.get('shepherd')
  if (!state || !state.enabled) return

  // Check if shepherd is already running for this repo
  if (isShepherdRunningForRepo(repoPath)) {
    console.log(`[Scheduler] Shepherd already running for ${repoPath}, skipping`)
    return
  }

  // Run shepherd directly (bypass runCycle's global lock for per-repo concurrency)
  const startTime = new Date()
  try {
    await runShepherdCycle(schedulerState!.config, repoPath)

    state.runs_completed++
    state.last_run = startTime.toISOString()
    console.log(`[Scheduler] shepherd cycle completed`)
  } catch (error) {
    state.errors++
    state.last_run = startTime.toISOString()
    console.error(`[Scheduler] shepherd cycle failed:`, error)
  }
}

// Export cycle handlers for direct access (e.g., from API routes)
export { runDispatcherCycle } from './cycles/dispatcher'
export { runDiscoveryCycle } from './cycles/discovery'
export { runShepherdCycle } from './cycles/shepherd'
export { runArmoryCycle } from './cycles/armory'
export { runBlockedCheckCycle } from './cycles/blocked'
export { runDigestCycle } from './cycles/digest'
export { runCompactionCycle } from './cycles/compaction'
export { runHealthCheckCycle } from './cycles/health'
export { runGitHubSyncCycle } from './cycles/github-sync'
export { runRegistryRefreshCycle } from './cycles/registry-refresh'

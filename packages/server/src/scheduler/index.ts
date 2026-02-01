/**
 * Scheduler - manages autonomous operation cycles
 *
 * Cycles:
 * - Dispatcher: Run ready tasks (every 60s)
 * - Discovery: Scan repos for work (every 15min)
 * - Sequencer: Wire task dependencies (every 15min)
 * - Shepherd: Evaluate completed batches (on task complete)
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
import { runSequencerCycle } from './cycles/sequencer'
import { runShepherdCycle } from './cycles/shepherd'
import { runBlockedCheckCycle } from './cycles/blocked'
import { runDigestCycle } from './cycles/digest'
import { runCompactionCycle } from './cycles/compaction'

// Cycle names
export type CycleName =
  | 'dispatcher'
  | 'discovery'
  | 'sequencer'
  | 'shepherd'
  | 'digest'
  | 'compaction'
  | 'blocked_check'

// Internal cycle state (extends public CycleState with interval ref)
interface InternalCycleState extends CycleState {
  intervalRef?: ReturnType<typeof setInterval>
}

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
      { name: 'sequencer', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'shepherd', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'digest', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'compaction', enabled: true, running: false, runs_completed: 0, errors: 0 },
      { name: 'blocked_check', enabled: true, running: false, runs_completed: 0, errors: 0 },
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

  // Sequencer cycle (uses discovery interval)
  cycles.set('sequencer', {
    name: 'sequencer',
    enabled: true, // Always enabled when scheduler runs
    running: false,
    runs_completed: 0,
    errors: 0,
  })

  // Shepherd cycle (triggered by task completion, not interval)
  cycles.set('shepherd', {
    name: 'shepherd',
    enabled: true,
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

  schedulerState = {
    config,
    running: false,
    cycles,
  }
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
    broadcast('scheduler:cycle', {
      type: 'scheduler:cycle',
      cycle: cycleName,
      timestamp: startTime.toISOString(),
    })

    await handler()

    // Update state on success
    state.runs_completed++
    state.last_run = startTime.toISOString()
    console.log(`[Scheduler] ${cycleName} cycle completed`)
  } catch (error) {
    // Update state on error
    state.errors++
    state.last_run = startTime.toISOString()
    console.error(`[Scheduler] ${cycleName} cycle failed:`, error)
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

  // Dispatcher cycle
  const dispatcherState = schedulerState.cycles.get('dispatcher')!
  if (dispatcherState.enabled) {
    dispatcherState.intervalRef = setInterval(
      () => runCycle('dispatcher', () => runDispatcherCycle(config)),
      config.dispatcher_interval_sec * 1000
    )
    console.log(`[Scheduler] Dispatcher cycle started (every ${config.dispatcher_interval_sec}s)`)
  }

  // Discovery cycle
  const discoveryState = schedulerState.cycles.get('discovery')!
  if (discoveryState.enabled) {
    discoveryState.intervalRef = setInterval(
      () => runCycle('discovery', () => runDiscoveryCycle(config)),
      config.discovery_interval_sec * 1000
    )
    console.log(`[Scheduler] Discovery cycle started (every ${config.discovery_interval_sec}s)`)
  }

  // Sequencer cycle (same interval as discovery)
  const sequencerState = schedulerState.cycles.get('sequencer')!
  if (sequencerState.enabled) {
    sequencerState.intervalRef = setInterval(
      () => runCycle('sequencer', () => runSequencerCycle(config)),
      config.discovery_interval_sec * 1000
    )
    console.log(`[Scheduler] Sequencer cycle started (every ${config.discovery_interval_sec}s)`)
  }

  // Blocked check cycle (every 15 min)
  const blockedState = schedulerState.cycles.get('blocked_check')!
  if (blockedState.enabled) {
    blockedState.intervalRef = setInterval(
      () => runCycle('blocked_check', () => runBlockedCheckCycle(config)),
      15 * 60 * 1000 // 15 minutes
    )
    console.log('[Scheduler] Blocked check cycle started (every 15min)')
  }

  // Digest cycle
  const digestState = schedulerState.cycles.get('digest')!
  if (digestState.enabled) {
    digestState.intervalRef = setInterval(
      () => runCycle('digest', () => runDigestCycle(config)),
      config.digest_interval_sec * 1000
    )
    console.log(`[Scheduler] Digest cycle started (every ${config.digest_interval_sec}s)`)
  }

  // Compaction cycle - check every hour if it's time
  const compactionState = schedulerState.cycles.get('compaction')!
  if (compactionState.enabled) {
    compactionState.intervalRef = setInterval(
      () => runCycle('compaction', () => runCompactionCycle(config)),
      60 * 60 * 1000 // Check every hour
    )
    console.log('[Scheduler] Compaction cycle started (checks hourly)')
  }

  // Note: Shepherd cycle is triggered by task completion, not interval
  // It will be called from the dispatcher when tasks complete
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
 * Called when a task completes.
 */
export async function triggerShepherdForRepo(repoPath: string): Promise<void> {
  if (!schedulerState) return

  const state = schedulerState.cycles.get('shepherd')
  if (!state || !state.enabled) return

  // Run shepherd cycle for specific repo
  await runCycle('shepherd', () => runShepherdCycle(schedulerState!.config, repoPath))
}

/**
 * Get the number of currently running tasks.
 * Used by dispatcher to check concurrency limits.
 */
export function getRunningTaskCount(): number {
  // This will be implemented to query the database
  // For now, return 0
  return 0
}

// Export cycle handlers for direct access (e.g., from API routes)
export { runDispatcherCycle } from './cycles/dispatcher'
export { runDiscoveryCycle } from './cycles/discovery'
export { runSequencerCycle } from './cycles/sequencer'
export { runShepherdCycle } from './cycles/shepherd'
export { runBlockedCheckCycle } from './cycles/blocked'
export { runDigestCycle } from './cycles/digest'
export { runCompactionCycle } from './cycles/compaction'

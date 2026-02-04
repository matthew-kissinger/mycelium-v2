/**
 * Scheduler Configuration - load/save config from disk
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { SchedulerConfig } from '@mycelium/shared'
import { getConfigDir, ensureDir } from '../platform'

// Config file path (cross-platform)
const CONFIG_DIR = getConfigDir()
const CONFIG_FILE = join(CONFIG_DIR, 'scheduler.json')

/**
 * Default scheduler configuration.
 * Matches the schema from @mycelium/shared
 */
export const DEFAULT_CONFIG: SchedulerConfig = {
  // Dispatcher cycle
  dispatcher_enabled: true,
  dispatcher_interval_sec: 60, // 1 minute
  max_concurrent_tasks: 3,
  min_concurrent_tasks: 3,
  max_concurrent_ceiling: 10,

  // Blocked task detection
  blocked_task_timeout_sec: 10800, // 3 hours
  blocked_check_enabled: true,
  orphan_cancel_timeout_sec: 14400, // 4 hours

  // Discovery cycle
  discovery_enabled: true,
  discovery_interval_sec: 900, // 15 minutes
  discovery_repos: [],
  discovery_auto_create: [],

  // Sequencer cycle
  sequencer_enabled: true,
  sequencer_interval_sec: 900, // 15 minutes

  // Shepherd cycle (interval-based, checks for repos with batch_size+ unevaluated tasks)
  shepherd_enabled: true,
  shepherd_interval_sec: 900, // 15 minutes
  shepherd_batch_size: 5, // Tasks needed before evaluation

  // Armory cycle
  armory_enabled: true,
  armory_batch_size: 10, // Tasks needed before armory review

  // Digest cycle
  digest_enabled: true,
  digest_interval_sec: 21600, // 6 hours

  // Compaction cycle
  compaction_enabled: true,
  compaction_day: 1, // Monday (0 = Sunday)
  compaction_hour: 11, // 11am

  // Health check cycle (device monitoring)
  health_check_enabled: true,
  health_check_interval_sec: 60, // 1 minute

  // Auto-prune
  auto_prune_enabled: true,
  auto_prune_threshold: 100,
  auto_prune_keep: 30,
}

/**
 * Ensure config directory exists.
 */
function ensureConfigDir(): void {
  ensureDir(CONFIG_DIR)
}

/**
 * Load scheduler config from disk, merging with defaults.
 */
export function loadConfig(): SchedulerConfig {
  ensureConfigDir()

  if (!existsSync(CONFIG_FILE)) {
    // No config file - return defaults
    return { ...DEFAULT_CONFIG }
  }

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)

    // Merge with defaults (parsed overrides defaults)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    }
  } catch (error) {
    console.error('[Scheduler] Failed to load config, using defaults:', error)
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Save scheduler config to disk.
 */
export function saveConfig(config: SchedulerConfig): void {
  ensureConfigDir()

  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[Scheduler] Config saved to', CONFIG_FILE)
  } catch (error) {
    console.error('[Scheduler] Failed to save config:', error)
    throw error
  }
}

/**
 * Update partial config and save to disk.
 */
export function updateConfig(updates: Partial<SchedulerConfig>): SchedulerConfig {
  const current = loadConfig()
  const updated = { ...current, ...updates }
  saveConfig(updated)
  return updated
}

/**
 * Get config file path.
 */
export function getConfigPath(): string {
  return CONFIG_FILE
}

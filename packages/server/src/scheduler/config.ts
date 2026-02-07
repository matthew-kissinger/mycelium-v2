/**
 * Scheduler Configuration - DB-first with file fallback
 *
 * Load order: DB -> file -> code defaults
 * Saves always go to DB with history tracking
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { SchedulerConfig } from '@mycelium/shared'
import { getConfigDir, ensureDir } from '../platform'
import { getConfigOverride, saveConfigOverride, importFileConfig } from '../db/config-store'

const CONFIG_KEY = 'scheduler'
const CONFIG_DIR = getConfigDir()
const CONFIG_FILE = join(CONFIG_DIR, 'scheduler.json')

/**
 * Default scheduler configuration.
 */
export const DEFAULT_CONFIG: SchedulerConfig = {
  dispatcher_enabled: true,
  dispatcher_interval_sec: 60,
  max_concurrent_tasks: 3,
  min_concurrent_tasks: 3,
  max_concurrent_ceiling: 10,
  blocked_task_timeout_sec: 10800,
  blocked_check_enabled: true,
  orphan_cancel_timeout_sec: 14400,
  discovery_enabled: true,
  discovery_interval_sec: 900,
  discovery_repos: [],
  discovery_auto_create: [],
  shepherd_enabled: true,
  shepherd_interval_sec: 900,
  shepherd_batch_size: 5,
  armory_enabled: true,
  armory_batch_size: 10,
  digest_enabled: true,
  digest_interval_sec: 14400, // 4 hours (smart Haiku agent)
  compaction_enabled: true,
  compaction_interval_sec: 14400, // 4 hours (smart Haiku agent)
  health_check_enabled: true,
  health_check_interval_sec: 60,
  github_sync_enabled: true,
  github_sync_interval_sec: 1800, // 30 minutes
  auto_prune_enabled: true,
  auto_prune_threshold: 100,
  auto_prune_keep: 30,
}

/**
 * Load scheduler config: DB -> file (import to DB) -> defaults
 */
export function loadConfig(): SchedulerConfig {
  // Try DB first
  const dbValue = getConfigOverride(CONFIG_KEY)
  if (dbValue) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(dbValue) }
    } catch {
      console.error('[Scheduler] Failed to parse DB config, falling back')
    }
  }

  // Try file (and import to DB if found)
  ensureDir(CONFIG_DIR)
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8')
      importFileConfig(CONFIG_KEY, raw)
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    } catch (error) {
      console.error('[Scheduler] Failed to load file config:', error)
    }
  }

  return { ...DEFAULT_CONFIG }
}

/**
 * Save scheduler config to DB with history.
 */
export function saveConfig(config: SchedulerConfig): void {
  const oldValue = getConfigOverride(CONFIG_KEY)
  saveConfigOverride(CONFIG_KEY, JSON.stringify(config, null, 2), 'api', oldValue)
  console.log('[Scheduler] Config saved to DB')
}

/**
 * Update partial config and save.
 */
export function updateConfig(updates: Partial<SchedulerConfig>): SchedulerConfig {
  const current = loadConfig()
  const updated = { ...current, ...updates }
  saveConfig(updated)
  return updated
}

/**
 * Get config file path (for display/info only).
 */
export function getConfigPath(): string {
  return CONFIG_FILE
}

/**
 * Configuration Management
 *
 * Load and save configuration files for various system components:
 * - Scheduler config: ~/.config/mycelium-v2/scheduler.json
 * - Genesis config: ~/.config/mycelium-v2/genesis.json
 * - Hooks config: ~/.config/mycelium-v2/hooks.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  SchedulerConfig,
  GenesisConfig,
  HooksConfig,
  DEFAULT_GENESIS_CONFIG,
  DEFAULT_HOOKS_CONFIG,
} from '@mycelium/shared'

// Re-export scheduler config functions (already implemented in scheduler/config.ts)
export {
  loadConfig as loadSchedulerConfig,
  saveConfig as saveSchedulerConfig,
  updateConfig as updateSchedulerConfig,
  getConfigPath as getSchedulerConfigPath,
  DEFAULT_CONFIG as DEFAULT_SCHEDULER_CONFIG,
} from '../scheduler/config'

// =============================================================================
// Config Directory
// =============================================================================

const CONFIG_DIR = join(homedir(), '.config', 'mycelium-v2')

/**
 * Ensure config directory exists.
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

// =============================================================================
// Genesis Configuration
// =============================================================================

const GENESIS_CONFIG_FILE = join(CONFIG_DIR, 'genesis.json')

/**
 * Load genesis config from disk, merging with defaults.
 */
export function loadGenesisConfig(): GenesisConfig {
  ensureConfigDir()

  if (!existsSync(GENESIS_CONFIG_FILE)) {
    return { ...DEFAULT_GENESIS_CONFIG }
  }

  try {
    const raw = readFileSync(GENESIS_CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)

    // Merge with defaults (parsed overrides defaults)
    return {
      ...DEFAULT_GENESIS_CONFIG,
      ...parsed,
    }
  } catch (error) {
    console.error('[Config] Failed to load genesis config, using defaults:', error)
    return { ...DEFAULT_GENESIS_CONFIG }
  }
}

/**
 * Save genesis config to disk.
 */
export function saveGenesisConfig(config: GenesisConfig): void {
  ensureConfigDir()

  try {
    writeFileSync(GENESIS_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[Config] Genesis config saved to', GENESIS_CONFIG_FILE)
  } catch (error) {
    console.error('[Config] Failed to save genesis config:', error)
    throw error
  }
}

/**
 * Update partial genesis config and save to disk.
 */
export function updateGenesisConfig(updates: Partial<GenesisConfig>): GenesisConfig {
  const current = loadGenesisConfig()
  const updated = { ...current, ...updates }
  saveGenesisConfig(updated)
  return updated
}

/**
 * Get genesis config file path.
 */
export function getGenesisConfigPath(): string {
  return GENESIS_CONFIG_FILE
}

// =============================================================================
// Hooks Configuration
// =============================================================================

const HOOKS_CONFIG_FILE = join(CONFIG_DIR, 'hooks.json')

/**
 * Load hooks config from disk, merging with defaults.
 */
export function loadHooksConfig(): HooksConfig {
  ensureConfigDir()

  if (!existsSync(HOOKS_CONFIG_FILE)) {
    return { ...DEFAULT_HOOKS_CONFIG }
  }

  try {
    const raw = readFileSync(HOOKS_CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)

    // Merge with defaults (parsed overrides defaults)
    return {
      ...DEFAULT_HOOKS_CONFIG,
      ...parsed,
    }
  } catch (error) {
    console.error('[Config] Failed to load hooks config, using defaults:', error)
    return { ...DEFAULT_HOOKS_CONFIG }
  }
}

/**
 * Save hooks config to disk.
 */
export function saveHooksConfig(config: HooksConfig): void {
  ensureConfigDir()

  try {
    writeFileSync(HOOKS_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[Config] Hooks config saved to', HOOKS_CONFIG_FILE)
  } catch (error) {
    console.error('[Config] Failed to save hooks config:', error)
    throw error
  }
}

/**
 * Update partial hooks config and save to disk.
 */
export function updateHooksConfig(updates: Partial<HooksConfig>): HooksConfig {
  const current = loadHooksConfig()
  const updated = { ...current, ...updates }
  saveHooksConfig(updated)
  return updated
}

/**
 * Get hooks config file path.
 */
export function getHooksConfigPath(): string {
  return HOOKS_CONFIG_FILE
}

// =============================================================================
// Config Directory Info
// =============================================================================

/**
 * Get the config directory path.
 */
export function getConfigDir(): string {
  return CONFIG_DIR
}

/**
 * List all config files in the config directory.
 */
export function listConfigFiles(): string[] {
  ensureConfigDir()

  try {
    const { readdirSync } = require('fs')
    return readdirSync(CONFIG_DIR).filter((f: string) => f.endsWith('.json'))
  } catch {
    return []
  }
}

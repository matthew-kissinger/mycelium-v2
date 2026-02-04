/**
 * Configuration Management - DB-first with file fallback
 *
 * Load order: DB -> file (import to DB) -> code defaults
 * Saves always go to DB with history tracking
 *
 * Config directory is platform-dependent:
 * - Linux/NixOS: ~/.config/mycelium-v2
 * - macOS: ~/Library/Application Support/mycelium-v2
 * - Windows: %APPDATA%/mycelium-v2
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  GenesisConfig,
  HooksConfig,
  DEFAULT_GENESIS_CONFIG,
  DEFAULT_HOOKS_CONFIG,
} from '@mycelium/shared'

// Import platform utilities
import { getConfigDir as getPlatformConfigDir, ensureDir } from '../platform'
import { getConfigOverride, saveConfigOverride, importFileConfig } from '../db/config-store'

// Re-export scheduler config functions (already implemented in scheduler/config.ts)
export {
  loadConfig as loadSchedulerConfig,
  saveConfig as saveSchedulerConfig,
  updateConfig as updateSchedulerConfig,
  getConfigPath as getSchedulerConfigPath,
  DEFAULT_CONFIG as DEFAULT_SCHEDULER_CONFIG,
} from '../scheduler/config'

// Re-export agents config functions
export {
  loadAgentsConfig,
  saveAgentsConfig,
  getAgentConfig,
  updateAgentConfig,
  getAgentsConfigPath,
  getEnabledAgents,
  isAgentEnabled,
  DEFAULT_AGENTS_CONFIG,
  type AgentConfigExtended,
  type AgentsConfig,
} from './agents'

// Re-export prompts config functions
export {
  listPrompts,
  getPrompt,
  getEffectivePrompt,
  saveCustomPrompt,
  deleteCustomPrompt,
  getPromptsConfigPath,
  type PromptInfo,
} from './prompts'

// =============================================================================
// Config Directory (cross-platform)
// =============================================================================

const CONFIG_DIR = getPlatformConfigDir()

/**
 * Ensure config directory exists.
 */
function ensureConfigDir(): void {
  ensureDir(CONFIG_DIR)
}

// =============================================================================
// Genesis Configuration
// =============================================================================

const GENESIS_CONFIG_KEY = 'genesis'
const GENESIS_CONFIG_FILE = join(CONFIG_DIR, 'genesis.json')

/**
 * Load genesis config: DB -> file (import to DB) -> defaults
 */
export function loadGenesisConfig(): GenesisConfig {
  // Try DB first
  const dbValue = getConfigOverride(GENESIS_CONFIG_KEY)
  if (dbValue) {
    try {
      return { ...DEFAULT_GENESIS_CONFIG, ...JSON.parse(dbValue) }
    } catch {
      console.error('[Config] Failed to parse DB genesis config, falling back')
    }
  }

  // Try file (and import to DB if found)
  ensureConfigDir()
  if (existsSync(GENESIS_CONFIG_FILE)) {
    try {
      const raw = readFileSync(GENESIS_CONFIG_FILE, 'utf-8')
      importFileConfig(GENESIS_CONFIG_KEY, raw)
      return { ...DEFAULT_GENESIS_CONFIG, ...JSON.parse(raw) }
    } catch (error) {
      console.error('[Config] Failed to load genesis file config:', error)
    }
  }

  return { ...DEFAULT_GENESIS_CONFIG }
}

/**
 * Save genesis config to DB with history.
 */
export function saveGenesisConfig(config: GenesisConfig): void {
  const oldValue = getConfigOverride(GENESIS_CONFIG_KEY)
  saveConfigOverride(GENESIS_CONFIG_KEY, JSON.stringify(config, null, 2), 'api', oldValue)
  console.log('[Config] Genesis config saved to DB')
}

/**
 * Update partial genesis config and save.
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

const HOOKS_CONFIG_KEY = 'hooks'
const HOOKS_CONFIG_FILE = join(CONFIG_DIR, 'hooks.json')

/**
 * Load hooks config: DB -> file (import to DB) -> defaults
 */
export function loadHooksConfig(): HooksConfig {
  // Try DB first
  const dbValue = getConfigOverride(HOOKS_CONFIG_KEY)
  if (dbValue) {
    try {
      return { ...DEFAULT_HOOKS_CONFIG, ...JSON.parse(dbValue) }
    } catch {
      console.error('[Config] Failed to parse DB hooks config, falling back')
    }
  }

  // Try file (and import to DB if found)
  ensureConfigDir()
  if (existsSync(HOOKS_CONFIG_FILE)) {
    try {
      const raw = readFileSync(HOOKS_CONFIG_FILE, 'utf-8')
      importFileConfig(HOOKS_CONFIG_KEY, raw)
      return { ...DEFAULT_HOOKS_CONFIG, ...JSON.parse(raw) }
    } catch (error) {
      console.error('[Config] Failed to load hooks file config:', error)
    }
  }

  return { ...DEFAULT_HOOKS_CONFIG }
}

/**
 * Save hooks config to DB with history.
 */
export function saveHooksConfig(config: HooksConfig): void {
  const oldValue = getConfigOverride(HOOKS_CONFIG_KEY)
  saveConfigOverride(HOOKS_CONFIG_KEY, JSON.stringify(config, null, 2), 'api', oldValue)
  console.log('[Config] Hooks config saved to DB')
}

/**
 * Update partial hooks config and save.
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

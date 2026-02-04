/**
 * Agent Configuration - DB-first with file fallback
 */

import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { DEFAULT_AGENT_CONFIGS, type AgentConfig } from '@mycelium/shared'
import { getConfigOverride, saveConfigOverride, importFileConfig } from '../db/config-store'

// =============================================================================
// Types
// =============================================================================

export interface AgentConfigExtended extends AgentConfig {
  enabled: boolean
  default_model?: string
  description?: string
}

export interface AgentsConfig {
  agents: Record<string, AgentConfigExtended>
}

// =============================================================================
// Constants
// =============================================================================

const CONFIG_KEY = 'agents'
const CONFIG_DIR = join(homedir(), '.config', 'mycelium-v2')
const AGENTS_CONFIG_FILE = join(CONFIG_DIR, 'agents.json')

export const DEFAULT_AGENTS_CONFIG: AgentsConfig = {
  agents: {
    claude: {
      ...DEFAULT_AGENT_CONFIGS.claude,
      enabled: true,
      default_model: 'sonnet',
      description: 'Anthropic Claude Code CLI - best for complex tasks',
    },
    codex: {
      ...DEFAULT_AGENT_CONFIGS.codex,
      enabled: true,
      default_model: 'gpt-5.2-codex',
      description: 'OpenAI Codex CLI - fast code generation',
    },
    gemini: {
      ...DEFAULT_AGENT_CONFIGS.gemini,
      enabled: true,
      default_model: 'gemini-3-flash',
      description: 'Google Gemini CLI - good for research tasks',
    },
    cline: {
      ...DEFAULT_AGENT_CONFIGS.cline,
      enabled: true,
      default_model: undefined,
      description: 'Cline VSCode extension CLI - autonomous mode',
    },
    cursor: {
      ...DEFAULT_AGENT_CONFIGS.cursor,
      enabled: true,
      default_model: undefined,
      description: 'Cursor agent CLI - IDE-integrated agent',
    },
  },
}

// =============================================================================
// Config Functions
// =============================================================================

/**
 * Load agents config: DB -> file (import to DB) -> defaults
 */
export function loadAgentsConfig(): AgentsConfig {
  // Try DB first
  const dbValue = getConfigOverride(CONFIG_KEY)
  if (dbValue) {
    try {
      const parsed = JSON.parse(dbValue) as Partial<AgentsConfig>
      return mergeAgentsConfig(parsed)
    } catch {
      console.error('[Config] Failed to parse DB agents config, falling back')
    }
  }

  // Try file (and import to DB if found)
  if (existsSync(AGENTS_CONFIG_FILE)) {
    try {
      const raw = readFileSync(AGENTS_CONFIG_FILE, 'utf-8')
      importFileConfig(CONFIG_KEY, raw)
      return mergeAgentsConfig(JSON.parse(raw))
    } catch (error) {
      console.error('[Config] Failed to load agents file config:', error)
    }
  }

  return { ...DEFAULT_AGENTS_CONFIG }
}

function mergeAgentsConfig(parsed: Partial<AgentsConfig>): AgentsConfig {
  const agents: Record<string, AgentConfigExtended> = {}
  for (const [name, defaultConfig] of Object.entries(DEFAULT_AGENTS_CONFIG.agents)) {
    agents[name] = {
      ...defaultConfig,
      ...(parsed.agents?.[name] || {}),
    }
  }
  return { agents }
}

/**
 * Save agents config to DB with history.
 */
export function saveAgentsConfig(config: AgentsConfig): void {
  const oldValue = getConfigOverride(CONFIG_KEY)
  saveConfigOverride(CONFIG_KEY, JSON.stringify(config, null, 2), 'api', oldValue)
  console.log('[Config] Agents config saved to DB')
}

export function getAgentConfig(agentName: string): AgentConfigExtended | undefined {
  const config = loadAgentsConfig()
  return config.agents[agentName]
}

export function updateAgentConfig(
  agentName: string,
  updates: Partial<AgentConfigExtended>
): AgentConfigExtended | undefined {
  const config = loadAgentsConfig()
  if (!config.agents[agentName]) return undefined
  config.agents[agentName] = { ...config.agents[agentName], ...updates }
  saveAgentsConfig(config)
  return config.agents[agentName]
}

export function getAgentsConfigPath(): string {
  return AGENTS_CONFIG_FILE
}

export function getEnabledAgents(): AgentConfigExtended[] {
  const config = loadAgentsConfig()
  return Object.values(config.agents).filter((a) => a.enabled)
}

export function isAgentEnabled(agentName: string): boolean {
  const config = loadAgentsConfig()
  return config.agents[agentName]?.enabled ?? false
}

/**
 * Agent Configuration Management
 *
 * Stores agent settings in ~/.config/mycelium-v2/agents.json
 * Allows runtime configuration of agent timeouts, max turns, and models.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { DEFAULT_AGENT_CONFIGS, type AgentConfig } from '@mycelium/shared'

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

const CONFIG_DIR = join(homedir(), '.config', 'mycelium-v2')
const AGENTS_CONFIG_FILE = join(CONFIG_DIR, 'agents.json')

// Default extended configs (based on DEFAULT_AGENT_CONFIGS)
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
 * Ensure config directory exists.
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Load agents config from disk, merging with defaults.
 */
export function loadAgentsConfig(): AgentsConfig {
  ensureConfigDir()

  if (!existsSync(AGENTS_CONFIG_FILE)) {
    return { ...DEFAULT_AGENTS_CONFIG }
  }

  try {
    const raw = readFileSync(AGENTS_CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AgentsConfig>

    // Merge each agent with defaults
    const agents: Record<string, AgentConfigExtended> = {}
    for (const [name, defaultConfig] of Object.entries(DEFAULT_AGENTS_CONFIG.agents)) {
      agents[name] = {
        ...defaultConfig,
        ...(parsed.agents?.[name] || {}),
      }
    }

    return { agents }
  } catch (error) {
    console.error('[Config] Failed to load agents config, using defaults:', error)
    return { ...DEFAULT_AGENTS_CONFIG }
  }
}

/**
 * Save agents config to disk.
 */
export function saveAgentsConfig(config: AgentsConfig): void {
  ensureConfigDir()

  try {
    writeFileSync(AGENTS_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[Config] Agents config saved to', AGENTS_CONFIG_FILE)
  } catch (error) {
    console.error('[Config] Failed to save agents config:', error)
    throw error
  }
}

/**
 * Get config for a specific agent.
 */
export function getAgentConfig(agentName: string): AgentConfigExtended | undefined {
  const config = loadAgentsConfig()
  return config.agents[agentName]
}

/**
 * Update config for a specific agent.
 */
export function updateAgentConfig(
  agentName: string,
  updates: Partial<AgentConfigExtended>
): AgentConfigExtended | undefined {
  const config = loadAgentsConfig()

  if (!config.agents[agentName]) {
    return undefined
  }

  config.agents[agentName] = {
    ...config.agents[agentName],
    ...updates,
  }

  saveAgentsConfig(config)
  return config.agents[agentName]
}

/**
 * Get the agents config file path.
 */
export function getAgentsConfigPath(): string {
  return AGENTS_CONFIG_FILE
}

/**
 * Get all enabled agents.
 */
export function getEnabledAgents(): AgentConfigExtended[] {
  const config = loadAgentsConfig()
  return Object.values(config.agents).filter((a) => a.enabled)
}

/**
 * Check if an agent is enabled.
 */
export function isAgentEnabled(agentName: string): boolean {
  const config = loadAgentsConfig()
  return config.agents[agentName]?.enabled ?? false
}

/**
 * Prompt Configuration Management - DB-first with file fallback
 *
 * Load order: DB -> file (import to DB) -> code defaults
 * Saves always go to DB with history tracking
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// Import the actual prompts from the prompts module
import {
  DISCOVERY_AGENT_PROMPT,
  AUTONOMOUS_DISCOVERY_PROMPT,
  SEQUENCER_SYSTEM_PROMPT,
  SHEPHERD_SYSTEM_PROMPT,
  GENESIS_AGENT_PROMPT,
  AUTO_GENESIS_PROMPT,
  ARMORY_AGENT_PROMPT,
} from '../prompts'

import {
  getPromptOverride,
  savePromptOverride,
  deletePromptOverride as dbDeletePromptOverride,
  importFilePrompt,
} from '../db/config-store'

// =============================================================================
// Types
// =============================================================================

export interface PromptInfo {
  id: string
  name: string
  description: string
  agent: string
  templateVariables: string[]
  content: string
  customContent?: string
  isCustomized: boolean
}

// =============================================================================
// Constants
// =============================================================================

const CONFIG_DIR = join(homedir(), '.config', 'mycelium-v2', 'prompts')

// Define available prompts with metadata
const PROMPT_DEFINITIONS: Record<string, {
  name: string
  description: string
  agent: string
  templateVariables: string[]
  getContent: () => string
}> = {
  discovery: {
    name: 'Discovery Agent',
    description: 'Analyzes repositories and sends discovery reports with suggested tasks',
    agent: 'discovery',
    templateVariables: ['MYCEL_CONTEXT', 'AGENTS_SECTION', 'repo_path', 'repo_name'],
    getContent: () => DISCOVERY_AGENT_PROMPT,
  },
  'discovery-auto': {
    name: 'Discovery Agent (Auto Mode)',
    description: 'Autonomous discovery that creates tasks directly without human approval',
    agent: 'discovery',
    templateVariables: ['MYCEL_CONTEXT', 'AGENTS_SECTION', 'repo_path', 'repo_name'],
    getContent: () => AUTONOMOUS_DISCOVERY_PROMPT,
  },
  sequencer: {
    name: 'Sequencer Agent',
    description: 'Analyzes task dependencies and wires them together',
    agent: 'sequencer',
    templateVariables: ['MYCEL_CONTEXT'],
    getContent: () => SEQUENCER_SYSTEM_PROMPT,
  },
  shepherd: {
    name: 'Shepherd Agent',
    description: 'Evaluates completed tasks, builds memory, decides on branch merges',
    agent: 'shepherd',
    templateVariables: [],
    getContent: () => SHEPHERD_SYSTEM_PROMPT,
  },
  genesis: {
    name: 'Genesis Agent',
    description: 'Creates new repositories based on descriptions',
    agent: 'genesis',
    templateVariables: ['MYCEL_CONTEXT', 'AGENTS_SECTION'],
    getContent: () => GENESIS_AGENT_PROMPT,
  },
  'genesis-auto': {
    name: 'Genesis Agent (Auto Mode)',
    description: 'Autonomous genesis that analyzes network gaps and proposes new repos',
    agent: 'genesis',
    templateVariables: ['MYCEL_CONTEXT', 'AGENTS_SECTION'],
    getContent: () => AUTO_GENESIS_PROMPT,
  },
  armory: {
    name: 'Armory Agent',
    description: 'Manages skill library and MCP server inventory',
    agent: 'armory',
    templateVariables: ['MYCEL_CONTEXT'],
    getContent: () => ARMORY_AGENT_PROMPT,
  },
}

// =============================================================================
// Config Functions
// =============================================================================

/**
 * Load custom prompt content: DB -> file (import to DB) -> undefined
 */
function loadCustomPrompt(promptId: string): string | undefined {
  // Try DB first
  const dbValue = getPromptOverride(promptId)
  if (dbValue) return dbValue

  // Try file (and import to DB if found)
  const filePath = join(CONFIG_DIR, `${promptId}.md`)
  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      importFilePrompt(promptId, content)
      return content
    } catch {
      return undefined
    }
  }

  return undefined
}

/**
 * Save custom prompt content to DB with history.
 */
export function saveCustomPrompt(promptId: string, content: string): void {
  savePromptOverride(promptId, content, 'api')
  console.log('[Config] Custom prompt saved to DB:', promptId)
}

/**
 * Delete custom prompt (revert to default).
 */
export function deleteCustomPrompt(promptId: string): void {
  dbDeletePromptOverride(promptId)
  console.log('[Config] Custom prompt deleted:', promptId)
}

/**
 * List all available prompts.
 */
export function listPrompts(): PromptInfo[] {
  return Object.entries(PROMPT_DEFINITIONS).map(([id, def]) => {
    const customContent = loadCustomPrompt(id)
    return {
      id,
      name: def.name,
      description: def.description,
      agent: def.agent,
      templateVariables: def.templateVariables,
      content: def.getContent(),
      customContent,
      isCustomized: customContent !== undefined,
    }
  })
}

/**
 * Get a specific prompt by ID.
 */
export function getPrompt(promptId: string): PromptInfo | undefined {
  const def = PROMPT_DEFINITIONS[promptId]
  if (!def) {
    return undefined
  }

  const customContent = loadCustomPrompt(promptId)
  return {
    id: promptId,
    name: def.name,
    description: def.description,
    agent: def.agent,
    templateVariables: def.templateVariables,
    content: def.getContent(),
    customContent,
    isCustomized: customContent !== undefined,
  }
}

/**
 * Get the effective prompt content (custom if exists, otherwise default).
 */
export function getEffectivePrompt(promptId: string): string | undefined {
  const prompt = getPrompt(promptId)
  if (!prompt) {
    return undefined
  }
  return prompt.customContent ?? prompt.content
}

/**
 * Get prompts config directory path.
 */
export function getPromptsConfigPath(): string {
  return CONFIG_DIR
}

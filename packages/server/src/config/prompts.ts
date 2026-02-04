/**
 * Prompt Configuration Management
 *
 * Provides access to system agent prompts with the ability to view
 * and (eventually) override them via config files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
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
 * Ensure prompts config directory exists.
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Get path for a custom prompt file.
 */
function getCustomPromptPath(promptId: string): string {
  return join(CONFIG_DIR, `${promptId}.md`)
}

/**
 * Load custom prompt content if it exists.
 */
function loadCustomPrompt(promptId: string): string | undefined {
  const path = getCustomPromptPath(promptId)
  if (!existsSync(path)) {
    return undefined
  }
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return undefined
  }
}

/**
 * Save custom prompt content.
 */
export function saveCustomPrompt(promptId: string, content: string): void {
  ensureConfigDir()
  const path = getCustomPromptPath(promptId)
  writeFileSync(path, content, 'utf-8')
  console.log('[Config] Custom prompt saved to', path)
}

/**
 * Delete custom prompt (revert to default).
 */
export function deleteCustomPrompt(promptId: string): void {
  const path = getCustomPromptPath(promptId)
  if (existsSync(path)) {
    const { unlinkSync } = require('fs')
    unlinkSync(path)
    console.log('[Config] Custom prompt deleted:', path)
  }
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

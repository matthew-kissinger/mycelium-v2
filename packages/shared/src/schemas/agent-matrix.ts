/**
 * Complete Agent-Provider-Model Matrix
 *
 * This is the single source of truth for all valid agent/provider/model combinations.
 * Discovery prompts use this to know exactly what they can dispatch.
 *
 * Updated: 2026-02-05
 */

import type { AgentType, ProviderType } from './task'

// =============================================================================
// Types
// =============================================================================

export interface ModelInfo {
  id: string                    // Full model ID for CLI/API
  short?: string                // Short alias (e.g., "kimi-k2.5" -> "moonshotai/kimi-k2.5")
  context: number               // Context window in tokens (K = 1000)
  costIn?: number               // Input cost per 1K tokens (undefined = subscription/free)
  costOut?: number              // Output cost per 1K tokens
  strengths: string[]           // What this model is good at
  thinking?: boolean            // Supports extended thinking mode
  vision?: boolean              // Supports image input
  free?: boolean                // Is this a free model?
}

export interface ProviderModels {
  provider: ProviderType
  billing: 'subscription' | 'per_use' | 'free'
  models: ModelInfo[]
  notes?: string
}

export interface AgentCapabilities {
  agent: AgentType
  command: string               // CLI command to run
  timeout: number               // Default timeout in seconds
  providers: ProviderModels[]
  notes?: string
}

// =============================================================================
// Complete Matrix
// =============================================================================

export const AGENT_MATRIX: AgentCapabilities[] = [
  // =========================================================================
  // SUBSCRIPTION AGENTS (Unlimited usage)
  // =========================================================================
  {
    agent: 'claude',
    command: 'claude',
    timeout: 2400,
    notes: 'Best MCP/tool integration, extended thinking, most capable reasoning. Opus 4.6 is claude-opus-4-6.',
    providers: [{
      provider: 'anthropic',
      billing: 'subscription',
      models: [
        { id: 'opus', context: 200, strengths: ['architecture', 'complex debugging', 'nuanced decisions'], thinking: true },
        { id: 'sonnet', context: 200, strengths: ['balanced', 'most tasks', 'good speed'], thinking: true },
        { id: 'haiku', context: 200, strengths: ['simple fixes', 'docs', 'quick iterations'] },
      ],
    }],
  },

  {
    agent: 'codex',
    command: 'codex',
    timeout: 1800,
    notes: 'OpenAI code generation specialist. $40 API credits available. gpt-5.3-codex is subscription-only (not API).',
    providers: [{
      provider: 'openai',
      billing: 'subscription',
      models: [
        { id: 'gpt-5.3-codex', context: 400, strengths: ['latest', 'most capable codex'] },
        { id: 'gpt-5.2-codex', context: 400, strengths: ['code generation', 'balanced'] },
        { id: 'gpt-5.2-codex-high', context: 400, strengths: ['complex refactors', 'high quality'] },
        { id: 'gpt-5.2-codex-fast', context: 400, strengths: ['quick edits', 'low latency'] },
      ],
    }],
  },

  {
    agent: 'cursor',
    command: 'agent',
    timeout: 1800,
    notes: 'CLI is "agent" not "cursor". 24 models available. opus-4.6-thinking is default.',
    providers: [{
      provider: 'cursor',
      billing: 'subscription',
      models: [
        { id: 'opus-4.6-thinking', context: 200, strengths: ['default', 'best reasoning', 'architecture'], thinking: true },
        { id: 'opus-4.6', context: 200, strengths: ['non-thinking opus', 'fast reasoning'] },
        { id: 'composer-1', context: 200, strengths: ['multi-file composition', 'large refactors'] },
        { id: 'sonnet-4.5-thinking', context: 200, strengths: ['balanced with thinking'], thinking: true },
        { id: 'sonnet-4.5', context: 200, strengths: ['balanced feature work'] },
        { id: 'gpt-5.2-codex', context: 400, strengths: ['code generation', 'mechanical tasks'] },
        { id: 'gpt-5.2-codex-xhigh', context: 400, strengths: ['highest quality codex'] },
        { id: 'gemini-3-flash', context: 1000, strengths: ['fast iteration', 'simple features'] },
        { id: 'grok', context: 128, strengths: ['alternative perspective'] },
      ],
    }],
  },

  {
    agent: 'kiro',
    command: 'kiro-cli',
    timeout: 1800,
    notes: 'AWS SSO auth. Prompt via stdin. Spec-driven development. No --model CLI flag. Model routed by AWS.',
    providers: [{
      provider: 'aws',
      billing: 'subscription',
      models: [
        { id: 'default', context: 200, strengths: ['auto-routing', 'balanced'] },
        { id: 'claude-opus-4.6', context: 200, strengths: ['most intelligent', 'latest'], thinking: true },
        { id: 'claude-opus-4.5', context: 200, strengths: ['complex coding'], thinking: true },
        { id: 'claude-sonnet-4.5', context: 200, strengths: ['balanced', 'fast'] },
        { id: 'claude-sonnet-4.0', context: 200, strengths: ['stable', 'predictable'] },
        { id: 'claude-haiku-4.5', context: 200, strengths: ['fast', 'cost-effective'] },
      ],
    }],
  },

  {
    agent: 'copilot',
    command: 'copilot',
    timeout: 1800,
    notes: 'GitHub Copilot subscription. Built-in GitHub MCP. PAT with Copilot Requests perm.',
    providers: [{
      provider: 'github',
      billing: 'subscription',
      models: [
        { id: 'claude-opus-4.6', context: 200, strengths: ['most capable', 'latest'], thinking: true },
        { id: 'claude-sonnet-4.5', context: 200, strengths: ['code quality', 'balanced'] },
        { id: 'claude-sonnet-4', context: 200, strengths: ['stable'] },
        { id: 'claude-haiku-4.5', context: 200, strengths: ['fast'] },
        { id: 'gpt-5.2', context: 400, strengths: ['latest OpenAI'] },
        { id: 'gpt-5.1', context: 400, strengths: ['stable OpenAI'] },
        { id: 'gpt-5.1-codex-mini', context: 400, strengths: ['code-focused', 'fast'] },
        { id: 'gpt-5-mini', context: 400, strengths: ['balanced', 'efficient'] },
        { id: 'gpt-4.1', context: 128, strengths: ['legacy', 'reliable'] },
        { id: 'gemini-3-pro-preview', context: 1000, strengths: ['large context'] },
      ],
    }],
  },

  // =========================================================================
  // FREE AGENTS (Rate-limited but $0)
  // =========================================================================
  {
    agent: 'gemini',
    command: 'gemini',
    timeout: 1800,
    notes: 'Google AI Pro subscription. High daily quota. CLI requires -preview suffix for Gemini 3 models.',
    providers: [{
      provider: 'google',
      billing: 'subscription',
      models: [
        { id: 'gemini-3-pro-preview', context: 1000, strengths: ['deep research', 'complex analysis'], free: false },
        { id: 'gemini-3-flash-preview', context: 1000, strengths: ['fast iteration', 'most tasks'], free: false },
        { id: 'flash', context: 1000, strengths: ['alias for default flash'], free: false },
        { id: 'gemini-2.5-pro', context: 1000, strengths: ['large context', 'stable'], free: false },
        { id: 'gemini-2.5-flash', context: 1000, strengths: ['fast', 'large context'], free: false },
      ],
    }],
  },

  {
    agent: 'opencode',
    command: 'opencode',
    timeout: 3600,
    notes: 'Free models via OpenCode Zen. Can /connect to other providers interactively.',
    providers: [{
      provider: 'opencode-zen',
      billing: 'free',
      models: [
        { id: 'opencode/kimi-k2.5-free', context: 262, strengths: ['best free coder'], free: true },
        { id: 'opencode/glm-4.7-free', context: 200, strengths: ['function calling'], free: true },
        { id: 'opencode/gpt-5-nano', context: 400, strengths: ['fast', 'small'], free: true },
        { id: 'opencode/big-pickle', context: 128, strengths: ['alternative'], free: true },
        { id: 'opencode/trinity-large-preview-free', context: 131, strengths: ['alternative'], free: true },
        { id: 'opencode/minimax-m2.1-free', context: 128, strengths: ['alternative'], free: true },
      ],
    }],
  },

  // =========================================================================
  // PER-USE AGENTS (Pay per token)
  // =========================================================================
  {
    agent: 'cline',
    command: 'cline',
    timeout: 1800,
    notes: 'Use --provider openrouter (default) or --provider cline for billing.',
    providers: [
      {
        provider: 'openrouter',
        billing: 'per_use',
        notes: 'OpenRouter 100+ models. Top models by usage listed.',
        models: [
          // Top models by usage (sorted by tokens processed)
          { id: 'moonshotai/kimi-k2.5', short: 'kimi-k2.5', context: 262, costIn: 0.45, costOut: 2.50, strengths: ['#1 usage', 'top coder'] },
          { id: 'google/gemini-3-flash-preview', short: 'gemini-3-flash', context: 1000, costIn: 0.10, costOut: 0.40, strengths: ['#2 usage', 'fast', 'cheap'] },
          { id: 'anthropic/claude-opus-4.5', short: 'opus-4.5', context: 200, costIn: 15.0, costOut: 75.0, strengths: ['best reasoning', 'thinking'], thinking: true },
          { id: 'anthropic/claude-sonnet-4.5', short: 'sonnet-4.5', context: 200, costIn: 3.0, costOut: 15.0, strengths: ['balanced claude'] },
          { id: 'anthropic/claude-sonnet-4', short: 'sonnet-4', context: 200, costIn: 3.0, costOut: 15.0, strengths: ['stable claude'] },
          { id: 'anthropic/claude-haiku-4.5', short: 'haiku-4.5', context: 200, costIn: 0.80, costOut: 4.0, strengths: ['fast claude'] },
          { id: 'deepseek/deepseek-v3.2', short: 'deepseek-v3.2', context: 164, costIn: 0.25, costOut: 0.38, strengths: ['best value', 'coding'] },
          { id: 'x-ai/grok-4.1-fast', short: 'grok-4.1-fast', context: 128, costIn: 1.0, costOut: 3.0, strengths: ['fast', 'capable'] },
          { id: 'minimax/minimax-m2.1', short: 'minimax-m2.1', context: 128, costIn: 0.50, costOut: 1.50, strengths: ['balanced'] },
          { id: 'z-ai/glm-4.5-air', short: 'glm-4.5-air', context: 131, costIn: 0.10, costOut: 0.40, strengths: ['function calling', 'cheap'] },
          { id: 'google/gemini-2.5-flash', short: 'gemini-2.5-flash', context: 1000, costIn: 0.075, costOut: 0.30, strengths: ['fast', 'large context'] },
          { id: 'google/gemini-2.5-flash-lite', short: 'gemini-2.5-lite', context: 1000, costIn: 0.02, costOut: 0.10, strengths: ['cheapest google'] },
          { id: 'google/gemini-3-pro-preview', short: 'gemini-3-pro', context: 1000, costIn: 1.25, costOut: 5.0, strengths: ['most capable google'] },
          { id: 'z-ai/glm-4.7', short: 'glm-4.7', context: 203, costIn: 0.40, costOut: 1.50, strengths: ['function calling', 'latest'] },
          { id: 'z-ai/glm-4.7-flash', short: 'glm-4.7-flash', context: 200, costIn: 0.07, costOut: 0.40, strengths: ['fast glm'] },
          { id: 'openai/gpt-5.2', short: 'gpt-5.2', context: 400, costIn: 2.50, costOut: 10.0, strengths: ['latest openai'] },
          { id: 'nvidia/nemotron-3-nano-30b-a3b', short: 'nemotron-nano', context: 128, costIn: 0.10, costOut: 0.30, strengths: ['efficient', 'coding'] },
          { id: 'qwen/qwen3-coder', short: 'qwen3-coder', context: 262, costIn: 0.22, costOut: 0.95, strengths: ['480B MoE', 'SWE-bench'] },
          { id: 'mistralai/devstral-2512', short: 'devstral', context: 262, costIn: 0.05, costOut: 0.22, strengths: ['cheapest coder'] },
          // Free models on OpenRouter
          { id: 'arcee-ai/trinity-large-preview:free', short: 'trinity-free', context: 128, strengths: ['#3 usage', 'FREE'], free: true },
          { id: 'stepfun/step-3.5-flash:free', short: 'step-flash-free', context: 128, strengths: ['fast', 'FREE'], free: true },
          { id: 'deepseek/deepseek-r1-0528:free', short: 'deepseek-r1-free', context: 164, strengths: ['reasoning', 'FREE'], thinking: true, free: true },
          { id: 'qwen/qwen3-coder:free', short: 'qwen3-coder-free', context: 262, strengths: ['top coder', 'FREE'], free: true },
          { id: 'z-ai/glm-4.5-air:free', short: 'glm-4.5-air-free', context: 131, strengths: ['function calling', 'FREE'], free: true },
          { id: 'meta-llama/llama-3.3-70b-instruct:free', short: 'llama-3.3-free', context: 128, strengths: ['general', 'FREE'], free: true },
        ],
      },
      {
        provider: 'cline',
        billing: 'per_use',
        notes: 'Cline account billing. Same models as OpenRouter.',
        models: [
          { id: 'moonshotai/kimi-k2.5', context: 262, strengths: ['default'] },
        ],
      },
    ],
  },

  {
    agent: 'vibe',
    command: 'vibe',
    timeout: 1800,
    notes: 'Mistral-powered. MISTRAL_API_KEY required. Devstral 2 (123B) is main model. No --model CLI flag. Model auto-selected by Mistral.',
    providers: [{
      provider: 'mistral',
      billing: 'per_use',
      models: [
        { id: 'default', context: 262, strengths: ['auto-selects best model'] },
        { id: 'devstral-latest', context: 262, strengths: ['Devstral 2 (123B)', 'coding agent'] },
        { id: 'devstral-small-latest', context: 262, strengths: ['Devstral Small 2 (24B)', 'fast'] },
        { id: 'codestral-latest', context: 256, strengths: ['code generation'] },
      ],
    }],
  },

  {
    agent: 'pi',
    command: 'pi',
    timeout: 1800,
    notes: 'Multi-provider agent. Use --provider flag. Default: openrouter.',
    providers: [
      {
        provider: 'openrouter',
        billing: 'per_use',
        notes: 'Same models as cline/openrouter. OPENROUTER_API_KEY required.',
        models: [
          // Top picks (full list in cline/openrouter)
          { id: 'moonshotai/kimi-k2.5', short: 'kimi-k2.5', context: 262, costIn: 0.45, costOut: 2.50, strengths: ['#1 usage', 'top coder'] },
          { id: 'google/gemini-3-flash-preview', short: 'gemini-3-flash', context: 1000, costIn: 0.10, costOut: 0.40, strengths: ['fast', 'cheap'] },
          { id: 'deepseek/deepseek-v3.2', short: 'deepseek-v3.2', context: 164, costIn: 0.25, costOut: 0.38, strengths: ['best value'] },
          { id: 'anthropic/claude-sonnet-4.5', short: 'sonnet-4.5', context: 200, costIn: 3.0, costOut: 15.0, strengths: ['balanced claude'] },
          { id: 'arcee-ai/trinity-large-preview:free', short: 'trinity-free', context: 128, strengths: ['#3 usage', 'FREE'], free: true },
        ],
      },
      {
        provider: 'groq',
        billing: 'free',
        notes: 'Ultra-fast. GROQ_API_KEY required. Pi prepends provider, so use native model IDs.',
        models: [
          { id: 'kimi-k2-instruct', context: 131, strengths: ['best coding'], free: true },
          { id: 'llama-3.3-70b-versatile', context: 131, strengths: ['general'], free: true },
        ],
      },
      {
        provider: 'cerebras',
        billing: 'free',
        notes: 'Ultra-fast. CEREBRAS_API_KEY required. Use native Cerebras model IDs.',
        models: [
          { id: 'gpt-oss-120b', context: 131, strengths: ['large oss gpt', 'capable'], free: true },
          { id: 'qwen-3-235b-a22b-instruct-2507', context: 128, strengths: ['large qwen MoE', 'coding'], free: true },
          { id: 'glm-4.7', context: 200, strengths: ['function calling'], free: true },
          { id: 'qwen-3-32b', context: 128, strengths: ['qwen 3', 'fast'], free: true },
        ],
      },
      {
        provider: 'mistral',
        billing: 'per_use',
        notes: 'MISTRAL_API_KEY required.',
        models: [
          { id: 'mistral-large-latest', context: 262, strengths: ['flagship'] },
          { id: 'devstral-latest', context: 262, strengths: ['Devstral 2 (123B)', 'coding'] },
          { id: 'devstral-small-latest', context: 262, strengths: ['Devstral Small 2 (24B)', 'fast'] },
          { id: 'codestral-latest', context: 256, strengths: ['code gen'] },
        ],
      },
      {
        provider: 'google',
        billing: 'free',
        notes: 'GEMINI_API_KEY required.',
        models: [
          { id: 'gemini-3-flash', context: 1000, strengths: ['fast', 'latest'], free: true },
          { id: 'gemini-3-pro', context: 1000, strengths: ['capable', 'latest'], free: true },
          { id: 'gemini-2.5-flash', context: 1000, strengths: ['stable'], free: true },
        ],
      },
      {
        provider: 'anthropic',
        billing: 'per_use',
        notes: 'ANTHROPIC_API_KEY required.',
        models: [
          { id: 'claude-sonnet-4.5', context: 200, strengths: ['balanced', 'latest'] },
          { id: 'claude-haiku-4.5', context: 200, strengths: ['fast'] },
        ],
      },
      {
        provider: 'openai',
        billing: 'per_use',
        notes: 'OPENAI_API_KEY required.',
        models: [
          { id: 'gpt-5', context: 400, strengths: ['flagship'] },
          { id: 'gpt-5-mini', context: 400, strengths: ['balanced'] },
        ],
      },
    ],
  },
]

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get all valid (agent, provider, model) combinations.
 */
export function getAllCombinations(): Array<{ agent: AgentType; provider: ProviderType; model: string; billing: string }> {
  const combos: Array<{ agent: AgentType; provider: ProviderType; model: string; billing: string }> = []

  for (const agentCap of AGENT_MATRIX) {
    for (const providerModels of agentCap.providers) {
      for (const model of providerModels.models) {
        combos.push({
          agent: agentCap.agent,
          provider: providerModels.provider,
          model: model.id,
          billing: providerModels.billing,
        })
      }
    }
  }

  return combos
}

/**
 * Get models for a specific agent and provider.
 */
export function getModelsForAgent(agent: AgentType, provider?: ProviderType): ModelInfo[] {
  const agentCap = AGENT_MATRIX.find(a => a.agent === agent)
  if (!agentCap) return []

  if (provider) {
    const providerModels = agentCap.providers.find(p => p.provider === provider)
    return providerModels?.models ?? []
  }

  // Return all models from all providers
  return agentCap.providers.flatMap(p => p.models)
}

/**
 * Get free models across all agents.
 */
export function getFreeModels(): Array<{ agent: AgentType; provider: ProviderType; model: ModelInfo }> {
  const free: Array<{ agent: AgentType; provider: ProviderType; model: ModelInfo }> = []

  for (const agentCap of AGENT_MATRIX) {
    for (const providerModels of agentCap.providers) {
      if (providerModels.billing === 'free') {
        for (const model of providerModels.models) {
          free.push({ agent: agentCap.agent, provider: providerModels.provider, model })
        }
      } else {
        // Check individual free models (like OpenRouter free tier)
        for (const model of providerModels.models) {
          if (model.free) {
            free.push({ agent: agentCap.agent, provider: providerModels.provider, model })
          }
        }
      }
    }
  }

  return free
}

/**
 * Build compact markdown for discovery prompts.
 */
export function buildAgentMatrixMarkdown(): string {
  const lines: string[] = [
    '## Agent-Provider-Model Matrix',
    '',
    '### Quick Reference',
    '',
    '| Agent | Provider | Billing | Top Models |',
    '|-------|----------|---------|------------|',
  ]

  for (const agentCap of AGENT_MATRIX) {
    for (const pm of agentCap.providers) {
      const topModels = pm.models.slice(0, 3).map(m => m.short ?? m.id).join(', ')
      lines.push(`| ${agentCap.agent} | ${pm.provider} | ${pm.billing} | ${topModels} |`)
    }
  }

  lines.push('')
  lines.push('### Free Options (prefer these to save costs)')
  lines.push('')

  const freeModels = getFreeModels()
  for (const fm of freeModels.slice(0, 15)) {
    lines.push(`- \`${fm.agent}\` + \`${fm.provider}\`: ${fm.model.id} (${fm.model.strengths.join(', ')})`)
  }

  return lines.join('\n')
}

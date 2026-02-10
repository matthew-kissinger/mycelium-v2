/**
 * Seed the dynamic agent/provider registry from AGENT_MATRIX.
 *
 * Uses INSERT OR IGNORE so manual DB edits always win.
 * Called from initDb() on every startup - idempotent.
 */

import { AGENT_MATRIX, type AgentCapabilities, type ProviderModels, type ModelInfo } from '@mycelium/shared'
import { AGENT_PROVIDERS, type AgentType, type ProviderType } from '@mycelium/shared'
import type { Database } from 'bun:sqlite'

// Fallback model chains (same data as fallback.ts constants)
const FALLBACK_MODEL_MAP: Record<string, Record<string, string | null>> = {
  claude: {
    haiku: 'sonnet',
    sonnet: 'opus',
    opus: null,
  },
  codex: {
    'gpt-5.2-codex-fast': 'gpt-5.2-codex',
    'gpt-5.2-codex': 'gpt-5.2-codex-high',
    'gpt-5.2-codex-high': 'gpt-5.3-codex',
    'gpt-5.3-codex': null,
  },
  gemini: {
    flash: 'gemini-3-flash-preview',
    'gemini-3-flash-preview': 'gemini-3-pro-preview',
    'gemini-3-pro-preview': null,
    'gemini-2.5-flash': 'gemini-3-flash-preview',
    'gemini-2.5-pro': null,
  },
  cline: {
    'glm-4.7-flash': 'glm-4.7',
    'glm-4.7': 'deepseek/deepseek-v3.2',
    'deepseek/deepseek-v3.2': 'qwen/qwen3-coder',
    'qwen/qwen3-coder': 'moonshotai/kimi-k2.5',
    'moonshotai/kimi-k2.5': null,
  },
  cursor: {
    'gemini-3-flash': 'composer-1',
    'gpt-5.2-codex': 'composer-1',
    'sonnet-4.5': 'composer-1',
    'composer-1': 'composer-1.5',
    'composer-1.5': 'opus-4.6-thinking',
    'opus-4.6-thinking': null,
  },
}

const CROSS_AGENT_FALLBACK: Record<string, { agent: string; model: string }> = {
  claude: { agent: 'codex', model: 'gpt-5.2-codex' },
  codex: { agent: 'cursor', model: 'composer-1.5' },
  cursor: { agent: 'claude', model: 'sonnet' },
  gemini: { agent: 'pi', model: 'google/gemini-2.5-flash' },
  cline: { agent: 'pi', model: 'qwen/qwen3-coder' },
  kiro: { agent: 'claude', model: 'sonnet' },
  copilot: { agent: 'claude', model: 'sonnet' },
  pi: { agent: 'opencode', model: 'opencode/kimi-k2.5-free' },
  opencode: { agent: 'gemini', model: 'flash' },
  vibe: { agent: 'cline', model: 'mistralai/devstral-2512' },
}

const AGENT_DEFAULT_MODELS: Record<string, string> = {
  claude: 'sonnet',
  codex: 'gpt-5.2-codex',
  gemini: 'flash',
  cline: 'moonshotai/kimi-k2.5',
  cursor: 'opus-4.6-thinking',
  kiro: 'default',
  vibe: 'default',
  pi: 'moonshotai/kimi-k2.5',
  opencode: 'opencode/kimi-k2.5-free',
  copilot: 'claude-opus-4.6',
}

// Provider metadata for seeding
const PROVIDER_META: Record<string, { name: string; api_base?: string; auth_type?: string; auth_key_env?: string }> = {
  anthropic: { name: 'Anthropic', api_base: 'https://api.anthropic.com', auth_type: 'api_key', auth_key_env: 'ANTHROPIC_API_KEY' },
  openai: { name: 'OpenAI', api_base: 'https://api.openai.com', auth_type: 'api_key', auth_key_env: 'OPENAI_API_KEY' },
  openrouter: { name: 'OpenRouter', api_base: 'https://openrouter.ai/api', auth_type: 'api_key', auth_key_env: 'OPENROUTER_API_KEY' },
  groq: { name: 'Groq', api_base: 'https://api.groq.com', auth_type: 'api_key', auth_key_env: 'GROQ_API_KEY' },
  cerebras: { name: 'Cerebras', api_base: 'https://api.cerebras.ai', auth_type: 'api_key', auth_key_env: 'CEREBRAS_API_KEY' },
  mistral: { name: 'Mistral', api_base: 'https://api.mistral.ai', auth_type: 'api_key', auth_key_env: 'MISTRAL_API_KEY' },
  google: { name: 'Google AI', api_base: 'https://generativelanguage.googleapis.com', auth_type: 'api_key', auth_key_env: 'GOOGLE_API_KEY' },
  cline: { name: 'Cline Account', auth_type: 'oauth' },
  'opencode-zen': { name: 'OpenCode Zen', auth_type: 'none' },
  github: { name: 'GitHub Copilot', auth_type: 'api_key', auth_key_env: 'GH_TOKEN' },
  aws: { name: 'AWS (Kiro)', auth_type: 'sso' },
  cursor: { name: 'Cursor', auth_type: 'oauth' },
}

/**
 * Seed the registry tables from AGENT_MATRIX.
 * Uses INSERT OR IGNORE - existing rows (manual edits) are preserved.
 */
export function seedRegistry(sqlite: Database): void {
  const now = new Date().toISOString()

  // Prepare statements for bulk insert
  const insertProvider = sqlite.prepare(`
    INSERT OR IGNORE INTO providers (id, name, api_base, billing, auth_type, auth_key_env, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'unknown', ?, ?)
  `)

  const insertAgent = sqlite.prepare(`
    INSERT OR IGNORE INTO agents (id, command, timeout_seconds, default_provider, default_model, enabled, notes, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `)

  const insertModel = sqlite.prepare(`
    INSERT OR IGNORE INTO models (id, provider_id, model_id, short_name, context_window, cost_input, cost_output, strengths, thinking, vision, free, compatible_agents, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)
  `)

  const updateFallback = sqlite.prepare(`
    UPDATE models SET fallback_model_id = ? WHERE id = ? AND fallback_model_id IS NULL
  `)

  // Track seeded providers to avoid duplicates
  const seededProviders = new Set<string>()
  // Track model IDs for fallback wiring
  const modelIdMap = new Map<string, string>() // 'agent/model_id' -> 'provider/model_id'

  // Transaction for atomicity
  const transaction = sqlite.transaction(() => {
    for (const agentCap of AGENT_MATRIX) {
      const agentId = agentCap.agent
      const agentProviders = AGENT_PROVIDERS[agentId as AgentType]

      // Seed providers
      for (const pm of agentCap.providers) {
        if (!seededProviders.has(pm.provider)) {
          const meta = PROVIDER_META[pm.provider] ?? { name: pm.provider }
          insertProvider.run(
            pm.provider,
            meta.name,
            meta.api_base ?? null,
            pm.billing,
            meta.auth_type ?? null,
            meta.auth_key_env ?? null,
            now,
            now,
          )
          seededProviders.add(pm.provider)
        }
      }

      // Seed agent
      const defaultProvider = agentProviders?.default ?? agentCap.providers[0]?.provider ?? 'anthropic'
      const defaultModel = AGENT_DEFAULT_MODELS[agentId] ?? agentCap.providers[0]?.models[0]?.id
      const agentConfig: Record<string, unknown> = {}
      // Store supported providers in config
      if (agentProviders) {
        agentConfig.supported_providers = agentProviders.supported
      }

      insertAgent.run(
        agentId,
        agentCap.command,
        agentCap.timeout,
        defaultProvider,
        defaultModel ?? null,
        agentCap.notes ?? null,
        Object.keys(agentConfig).length > 0 ? JSON.stringify(agentConfig) : null,
        now,
        now,
      )

      // Seed models
      for (const pm of agentCap.providers) {
        for (const model of pm.models) {
          const modelPk = `${pm.provider}/${model.id}`
          const compatibleAgents = [agentId]

          insertModel.run(
            modelPk,
            pm.provider,
            model.id,
            model.short ?? null,
            model.context ?? null,
            model.costIn ?? null,
            model.costOut ?? null,
            JSON.stringify(model.strengths ?? []),
            model.thinking ? 1 : 0,
            model.vision ? 1 : 0,
            model.free ? 1 : 0,
            JSON.stringify(compatibleAgents),
            now,
            now,
          )

          // Track for fallback wiring
          modelIdMap.set(`${agentId}/${model.id}`, modelPk)
        }
      }
    }

    // Wire fallback chains
    for (const [agent, fallbackMap] of Object.entries(FALLBACK_MODEL_MAP)) {
      const agentCap = AGENT_MATRIX.find(a => a.agent === agent)
      if (!agentCap) continue

      for (const [fromModel, toModel] of Object.entries(fallbackMap)) {
        if (!toModel) continue

        // Find the provider for this agent's models
        const fromPk = modelIdMap.get(`${agent}/${fromModel}`)
        const toPk = modelIdMap.get(`${agent}/${toModel}`)

        if (fromPk && toPk) {
          updateFallback.run(toPk, fromPk)
        }
      }
    }

    // Store cross-agent fallback in config_overrides
    const crossAgentFallbackJson = JSON.stringify(CROSS_AGENT_FALLBACK)
    sqlite.prepare(`
      INSERT OR IGNORE INTO config_overrides (key, value, updated_at)
      VALUES ('registry:cross_agent_fallback', ?, ?)
    `).run(crossAgentFallbackJson, now)
  })

  transaction()

  // Count what was seeded
  const agentCount = (sqlite.prepare('SELECT COUNT(*) as c FROM agents').get() as any)?.c ?? 0
  const providerCount = (sqlite.prepare('SELECT COUNT(*) as c FROM providers').get() as any)?.c ?? 0
  const modelCount = (sqlite.prepare('SELECT COUNT(*) as c FROM models').get() as any)?.c ?? 0

  console.log(`[Registry] Seeded: ${agentCount} agents, ${providerCount} providers, ${modelCount} models`)
}

/**
 * Merge compatible_agents for models shared across agents.
 * E.g., 'openrouter/moonshotai/kimi-k2.5' is used by both cline and pi.
 * This runs after initial seed to update the compatible_agents arrays.
 */
export function mergeCompatibleAgents(sqlite: Database): void {
  // Build a map of model_id+provider -> list of agents
  const modelAgents = new Map<string, Set<string>>()

  for (const agentCap of AGENT_MATRIX) {
    for (const pm of agentCap.providers) {
      for (const model of pm.models) {
        const key = `${pm.provider}/${model.id}`
        if (!modelAgents.has(key)) {
          modelAgents.set(key, new Set())
        }
        modelAgents.get(key)!.add(agentCap.agent)
      }
    }
  }

  const updateStmt = sqlite.prepare(`
    UPDATE models SET compatible_agents = ? WHERE id = ?
  `)

  for (const [modelPk, agents] of modelAgents) {
    if (agents.size > 1) {
      updateStmt.run(JSON.stringify(Array.from(agents)), modelPk)
    }
  }
}

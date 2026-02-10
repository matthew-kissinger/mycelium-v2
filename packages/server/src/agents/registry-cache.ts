/**
 * Registry Cache - In-memory cache with write-through to DB.
 *
 * Sub-millisecond reads for dispatch hot paths.
 * Write operations go to DB first, then invalidate cache.
 * initRegistryCache() loads everything on startup.
 */

import type { AgentRow, ProviderRow, ModelRow, HealthRow } from '../db/registry-queries'

// =============================================================================
// Cache State
// =============================================================================

let agentCache = new Map<string, AgentRow>()
let providerCache = new Map<string, ProviderRow>()
let modelCache = new Map<string, ModelRow>() // keyed by composite ID
let modelsByAgentCache = new Map<string, ModelRow[]>()
let modelsByProviderCache = new Map<string, ModelRow[]>()
let healthCache = new Map<string, HealthRow>()
let crossAgentFallbackCache: Record<string, { agent: string; model: string }> = {}
let cacheInitialized = false

// =============================================================================
// Init
// =============================================================================

/**
 * Load all registry data from DB into cache.
 * Called once on startup after seed.
 */
export async function initRegistryCache(): Promise<void> {
  const {
    getAllAgents, getAllProviders, getAllModels, getAllAgentHealth,
    getModelsForAgent, getModelsForProvider,
  } = await import('../db/registry-queries')

  // Load agents
  const agents = getAllAgents()
  agentCache.clear()
  for (const agent of agents) {
    agentCache.set(agent.id, agent)
  }

  // Load providers
  const providers = getAllProviders()
  providerCache.clear()
  for (const provider of providers) {
    providerCache.set(provider.id, provider)
  }

  // Load models
  const models = getAllModels()
  modelCache.clear()
  modelsByAgentCache.clear()
  modelsByProviderCache.clear()

  for (const model of models) {
    modelCache.set(model.id, model)

    // Index by provider
    if (!modelsByProviderCache.has(model.provider_id)) {
      modelsByProviderCache.set(model.provider_id, [])
    }
    modelsByProviderCache.get(model.provider_id)!.push(model)

    // Index by compatible agents
    const compatAgents = model.compatible_agents ? JSON.parse(model.compatible_agents) as string[] : []
    for (const agentId of compatAgents) {
      if (!modelsByAgentCache.has(agentId)) {
        modelsByAgentCache.set(agentId, [])
      }
      modelsByAgentCache.get(agentId)!.push(model)
    }
  }

  // Load health
  const healthRows = getAllAgentHealth()
  healthCache.clear()
  for (const row of healthRows) {
    healthCache.set(row.agent_id, row)
  }

  // Load cross-agent fallback
  try {
    const { getCrossAgentFallback } = await import('../db/registry-queries')
    // Load the full map from config_overrides
    const { db, schema } = await import('../db/index')
    const { eq } = await import('drizzle-orm')
    const row = db.select().from(schema.config_overrides)
      .where(eq(schema.config_overrides.key, 'registry:cross_agent_fallback'))
      .get()
    if (row) {
      crossAgentFallbackCache = JSON.parse(row.value)
    }
  } catch {
    crossAgentFallbackCache = {}
  }

  cacheInitialized = true
  console.log(`[Registry Cache] Loaded: ${agents.length} agents, ${providers.length} providers, ${models.length} models, ${healthRows.length} health entries`)
}

// =============================================================================
// Agent Reads
// =============================================================================

export function getCachedAgent(id: string): AgentRow | undefined {
  return agentCache.get(id)
}

export function getCachedAllAgents(): AgentRow[] {
  return Array.from(agentCache.values())
}

export function getCachedEnabledAgents(): AgentRow[] {
  return Array.from(agentCache.values()).filter(a => a.enabled)
}

// =============================================================================
// Provider Reads
// =============================================================================

export function getCachedProvider(id: string): ProviderRow | undefined {
  return providerCache.get(id)
}

export function getCachedAllProviders(): ProviderRow[] {
  return Array.from(providerCache.values())
}

// =============================================================================
// Model Reads
// =============================================================================

export function getCachedModel(id: string): ModelRow | undefined {
  return modelCache.get(id)
}

export function getCachedModelsForAgent(agentId: string): ModelRow[] {
  return modelsByAgentCache.get(agentId) ?? []
}

export function getCachedModelsForProvider(providerId: string): ModelRow[] {
  return modelsByProviderCache.get(providerId) ?? []
}

export function getCachedDefaultModel(agentId: string): string | null {
  const agent = agentCache.get(agentId)
  return agent?.default_model ?? null
}

/**
 * Get the fallback model for an agent/model combination.
 * Follows fallback_model_id in the models table.
 */
export function getCachedFallbackModel(agentId: string, modelId: string): string | null {
  const agentModels = modelsByAgentCache.get(agentId) ?? []

  // Find the model entry with a matching provider for this agent
  const agent = agentCache.get(agentId)
  const defaultProvider = agent?.default_provider

  // Look for the model within the agent's compatible models
  const current = agentModels.find(m => m.model_id === modelId)
  if (!current?.fallback_model_id) return null

  const fallback = modelCache.get(current.fallback_model_id)
  return fallback?.model_id ?? null
}

/**
 * Get cross-agent fallback for when an agent exhausts its model chain.
 */
export function getCachedCrossAgentFallback(agentId: string): { agent: string; model: string } | null {
  return crossAgentFallbackCache[agentId] ?? null
}

// =============================================================================
// Health Reads
// =============================================================================

export function getCachedHealthState(key: string): HealthRow | undefined {
  return healthCache.get(key)
}

export function getCachedAllHealth(): HealthRow[] {
  return Array.from(healthCache.values())
}

// =============================================================================
// Cache Invalidation (write-through)
// =============================================================================

/**
 * Invalidate and reload a single agent from DB.
 */
export async function invalidateAgent(id: string): Promise<void> {
  const { getAgent } = await import('../db/registry-queries')
  const agent = getAgent(id)
  if (agent) {
    agentCache.set(id, agent)
  } else {
    agentCache.delete(id)
  }
}

/**
 * Invalidate and reload a single provider from DB.
 */
export async function invalidateProvider(id: string): Promise<void> {
  const { getProvider } = await import('../db/registry-queries')
  const provider = getProvider(id)
  if (provider) {
    providerCache.set(id, provider)
  } else {
    providerCache.delete(id)
  }
}

/**
 * Invalidate and rebuild model caches for an agent.
 */
export async function invalidateModelsForAgent(agentId: string): Promise<void> {
  const { getModelsForAgent } = await import('../db/registry-queries')
  const models = getModelsForAgent(agentId)
  modelsByAgentCache.set(agentId, models)

  // Also update individual model cache entries
  for (const model of models) {
    modelCache.set(model.id, model)
  }
}

/**
 * Invalidate and reload a single health entry.
 */
export async function invalidateHealth(key: string): Promise<void> {
  const { getAgentHealth } = await import('../db/registry-queries')
  const health = getAgentHealth(key)
  if (health) {
    healthCache.set(key, health)
  } else {
    healthCache.delete(key)
  }
}

/**
 * Full cache reload (used after bulk operations like model fetch).
 */
export async function reloadCache(): Promise<void> {
  await initRegistryCache()
}

/**
 * Check if cache is initialized.
 */
export function isCacheReady(): boolean {
  return cacheInitialized
}

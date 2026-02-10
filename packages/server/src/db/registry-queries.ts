/**
 * Registry Queries - CRUD for agents, providers, and models tables.
 *
 * Follows the same patterns as queries.ts (direct Drizzle queries).
 * Health state is persisted to agent_stats with extended columns.
 */

import { eq, and, like, sql, desc } from 'drizzle-orm'
import { db, schema } from './index'

// =============================================================================
// Types
// =============================================================================

export interface AgentRow {
  id: string
  command: string
  cli_version: string | null
  timeout_seconds: number | null
  max_turns: number | null
  supports_streaming: boolean | null
  default_provider: string | null
  default_model: string | null
  enabled: boolean | null
  status: string | null
  has_headless: boolean | null
  has_json_output: boolean | null
  has_model_list_cmd: boolean | null
  has_mcp: boolean | null
  has_acp: boolean | null
  model_list_cmd: string | null
  cli_detected_at: string | null
  notes: string | null
  config: string | null
  created_at: string
  updated_at: string | null
}

export interface ProviderRow {
  id: string
  name: string
  api_base: string | null
  billing: string
  auth_type: string | null
  auth_key_env: string | null
  status: string | null
  last_checked_at: string | null
  last_error: string | null
  rate_limit_info: string | null
  credits_info: string | null
  models_fetched_at: string | null
  config: string | null
  created_at: string
  updated_at: string | null
}

export interface ModelRow {
  id: string
  provider_id: string
  model_id: string
  short_name: string | null
  context_window: number | null
  cost_input: number | null
  cost_output: number | null
  strengths: string | null
  thinking: boolean | null
  vision: boolean | null
  free: boolean | null
  compatible_agents: string | null
  fallback_model_id: string | null
  available: boolean | null
  last_used_at: string | null
  source: string | null
  created_at: string
  updated_at: string | null
}

export interface HealthRow {
  agent_id: string
  model: string | null
  provider: string | null
  status: string | null
  total_tasks: number | null
  successful: number | null
  failed: number | null
  success_rate: number | null
  total_cost: number | null
  quota_reset_at: string | null
  last_error: string | null
  last_error_at: string | null
  last_success_at: string | null
  error_count_recent: number | null
  updated_at: string | null
}

// =============================================================================
// Agent Queries
// =============================================================================

export function getAgent(id: string): AgentRow | undefined {
  return db.select().from(schema.agents).where(eq(schema.agents.id, id)).get() as AgentRow | undefined
}

export function getAllAgents(): AgentRow[] {
  return db.select().from(schema.agents).all() as AgentRow[]
}

export function getEnabledAgents(): AgentRow[] {
  return db.select().from(schema.agents).where(eq(schema.agents.enabled, true)).all() as AgentRow[]
}

export function upsertAgent(id: string, data: Partial<AgentRow>): void {
  const now = new Date().toISOString()
  const existing = getAgent(id)

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: now }
    if (data.command !== undefined) updates.command = data.command
    if (data.cli_version !== undefined) updates.cli_version = data.cli_version
    if (data.timeout_seconds !== undefined) updates.timeout_seconds = data.timeout_seconds
    if (data.default_provider !== undefined) updates.default_provider = data.default_provider
    if (data.default_model !== undefined) updates.default_model = data.default_model
    if (data.enabled !== undefined) updates.enabled = data.enabled
    if (data.status !== undefined) updates.status = data.status
    if (data.cli_detected_at !== undefined) updates.cli_detected_at = data.cli_detected_at
    if (data.notes !== undefined) updates.notes = data.notes
    if (data.config !== undefined) updates.config = data.config

    db.update(schema.agents).set(updates).where(eq(schema.agents.id, id)).run()
  } else {
    db.insert(schema.agents).values({
      id,
      command: data.command ?? id,
      timeout_seconds: data.timeout_seconds ?? 1800,
      default_provider: data.default_provider ?? null,
      default_model: data.default_model ?? null,
      enabled: data.enabled ?? true,
      status: data.status ?? 'unknown',
      notes: data.notes ?? null,
      config: data.config ?? null,
      created_at: now,
      updated_at: now,
    }).run()
  }
}

export function updateAgentStatus(id: string, status: string, cliVersion?: string): void {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { status, updated_at: now }
  if (cliVersion !== undefined) {
    updates.cli_version = cliVersion
    updates.cli_detected_at = now
  }
  db.update(schema.agents).set(updates).where(eq(schema.agents.id, id)).run()
}

// =============================================================================
// Provider Queries
// =============================================================================

export function getProvider(id: string): ProviderRow | undefined {
  return db.select().from(schema.providers).where(eq(schema.providers.id, id)).get() as ProviderRow | undefined
}

export function getAllProviders(): ProviderRow[] {
  return db.select().from(schema.providers).all() as ProviderRow[]
}

export function upsertProvider(id: string, data: Partial<ProviderRow>): void {
  const now = new Date().toISOString()
  const existing = getProvider(id)

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: now }
    if (data.name !== undefined) updates.name = data.name
    if (data.api_base !== undefined) updates.api_base = data.api_base
    if (data.billing !== undefined) updates.billing = data.billing
    if (data.status !== undefined) updates.status = data.status
    if (data.last_checked_at !== undefined) updates.last_checked_at = data.last_checked_at
    if (data.last_error !== undefined) updates.last_error = data.last_error
    if (data.rate_limit_info !== undefined) updates.rate_limit_info = data.rate_limit_info
    if (data.credits_info !== undefined) updates.credits_info = data.credits_info
    if (data.models_fetched_at !== undefined) updates.models_fetched_at = data.models_fetched_at
    if (data.config !== undefined) updates.config = data.config

    db.update(schema.providers).set(updates).where(eq(schema.providers.id, id)).run()
  } else {
    db.insert(schema.providers).values({
      id,
      name: data.name ?? id,
      api_base: data.api_base ?? null,
      billing: data.billing ?? 'subscription',
      status: data.status ?? 'unknown',
      created_at: now,
      updated_at: now,
    }).run()
  }
}

export function updateProviderStatus(id: string, status: string, rateLimitInfo?: object, creditsInfo?: object): void {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { status, last_checked_at: now, updated_at: now }
  if (rateLimitInfo !== undefined) updates.rate_limit_info = JSON.stringify(rateLimitInfo)
  if (creditsInfo !== undefined) updates.credits_info = JSON.stringify(creditsInfo)
  db.update(schema.providers).set(updates).where(eq(schema.providers.id, id)).run()
}

// =============================================================================
// Model Queries
// =============================================================================

export function getModel(id: string): ModelRow | undefined {
  return db.select().from(schema.models).where(eq(schema.models.id, id)).get() as ModelRow | undefined
}

export function getModelsForProvider(providerId: string): ModelRow[] {
  return db.select().from(schema.models)
    .where(eq(schema.models.provider_id, providerId))
    .all() as ModelRow[]
}

export function getModelsForAgent(agentId: string): ModelRow[] {
  // compatible_agents is a JSON array, use LIKE for simple matching
  return db.select().from(schema.models)
    .where(like(schema.models.compatible_agents, `%"${agentId}"%`))
    .all() as ModelRow[]
}

export function getFreeModels(): ModelRow[] {
  return db.select().from(schema.models)
    .where(eq(schema.models.free, true))
    .all() as ModelRow[]
}

export function getAllModels(): ModelRow[] {
  return db.select().from(schema.models).all() as ModelRow[]
}

export function upsertModel(id: string, data: Partial<ModelRow>): void {
  const now = new Date().toISOString()
  const existing = getModel(id)

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: now }
    if (data.short_name !== undefined) updates.short_name = data.short_name
    if (data.context_window !== undefined) updates.context_window = data.context_window
    if (data.cost_input !== undefined) updates.cost_input = data.cost_input
    if (data.cost_output !== undefined) updates.cost_output = data.cost_output
    if (data.strengths !== undefined) updates.strengths = data.strengths
    if (data.thinking !== undefined) updates.thinking = data.thinking
    if (data.vision !== undefined) updates.vision = data.vision
    if (data.free !== undefined) updates.free = data.free
    if (data.compatible_agents !== undefined) updates.compatible_agents = data.compatible_agents
    if (data.fallback_model_id !== undefined) updates.fallback_model_id = data.fallback_model_id
    if (data.available !== undefined) updates.available = data.available
    if (data.source !== undefined) updates.source = data.source

    db.update(schema.models).set(updates).where(eq(schema.models.id, id)).run()
  } else {
    db.insert(schema.models).values({
      id,
      provider_id: data.provider_id ?? id.split('/')[0],
      model_id: data.model_id ?? id.split('/').slice(1).join('/'),
      short_name: data.short_name ?? null,
      context_window: data.context_window ?? null,
      cost_input: data.cost_input ?? null,
      cost_output: data.cost_output ?? null,
      strengths: data.strengths ?? null,
      thinking: data.thinking ?? false,
      vision: data.vision ?? false,
      free: data.free ?? false,
      compatible_agents: data.compatible_agents ?? null,
      fallback_model_id: data.fallback_model_id ?? null,
      available: data.available ?? true,
      source: data.source ?? 'manual',
      created_at: now,
      updated_at: now,
    }).run()
  }
}

// =============================================================================
// Health Queries (agent_stats table with extended columns)
// =============================================================================

export function getAgentHealth(agentId: string): HealthRow | undefined {
  return db.select().from(schema.agent_stats)
    .where(eq(schema.agent_stats.agent_id, agentId))
    .get() as HealthRow | undefined
}

export function getAllAgentHealth(): HealthRow[] {
  return db.select().from(schema.agent_stats).all() as unknown as HealthRow[]
}

export function upsertAgentHealth(key: string, data: Partial<HealthRow>): void {
  const now = new Date().toISOString()
  const existing = getAgentHealth(key)

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: now }
    if (data.status !== undefined) updates.status = data.status
    if (data.total_tasks !== undefined) updates.total_tasks = data.total_tasks
    if (data.successful !== undefined) updates.successful = data.successful
    if (data.failed !== undefined) updates.failed = data.failed
    if (data.success_rate !== undefined) updates.success_rate = data.success_rate
    if (data.total_cost !== undefined) updates.total_cost = data.total_cost
    if (data.quota_reset_at !== undefined) updates.quota_reset_at = data.quota_reset_at
    if (data.last_error !== undefined) updates.last_error = data.last_error
    if (data.last_error_at !== undefined) updates.last_error_at = data.last_error_at
    if (data.last_success_at !== undefined) updates.last_success_at = data.last_success_at
    if (data.error_count_recent !== undefined) updates.error_count_recent = data.error_count_recent
    if (data.model !== undefined) updates.model = data.model
    if (data.provider !== undefined) updates.provider = data.provider

    db.update(schema.agent_stats).set(updates).where(eq(schema.agent_stats.agent_id, key)).run()
  } else {
    db.insert(schema.agent_stats).values({
      agent_id: key,
      total_tasks: data.total_tasks ?? 0,
      successful: data.successful ?? 0,
      failed: data.failed ?? 0,
      success_rate: data.success_rate ?? 0,
      total_cost: data.total_cost ?? 0,
      updated_at: now,
      // Extended columns (these may not exist yet in the schema object but exist in the DB)
    } as any).run()

    // Update extended columns separately since they're migration-added
    const updates: Record<string, unknown> = {}
    if (data.status) updates.status = data.status
    if (data.quota_reset_at) updates.quota_reset_at = data.quota_reset_at
    if (data.last_error) updates.last_error = data.last_error
    if (data.last_error_at) updates.last_error_at = data.last_error_at
    if (data.last_success_at) updates.last_success_at = data.last_success_at
    if (data.error_count_recent !== undefined) updates.error_count_recent = data.error_count_recent
    if (data.model) updates.model = data.model
    if (data.provider) updates.provider = data.provider

    if (Object.keys(updates).length > 0) {
      db.update(schema.agent_stats).set(updates).where(eq(schema.agent_stats.agent_id, key)).run()
    }
  }
}

export function getRegistryHealthSummary(): Record<string, {
  status: string
  errorCount: number
  successCount: number
  lastError?: string
  quotaResetAt?: string
}> {
  const rows = getAllAgentHealth()
  const result: Record<string, any> = {}

  for (const row of rows) {
    result[row.agent_id] = {
      status: row.status ?? 'healthy',
      errorCount: row.failed ?? 0,
      successCount: row.successful ?? 0,
      lastError: row.last_error ?? undefined,
      quotaResetAt: row.quota_reset_at ?? undefined,
    }
  }

  return result
}

// =============================================================================
// Composite Queries
// =============================================================================

/**
 * Get the fallback chain for an agent+model.
 * Follows fallback_model_id links in the models table.
 */
export function getFallbackChain(agentId: string, modelId: string): string[] {
  const chain: string[] = []
  const agentModels = getModelsForAgent(agentId)

  // Find the starting model
  let current = agentModels.find(m => m.model_id === modelId)
  if (!current) return chain

  // Follow fallback chain (max 5 to prevent infinite loops)
  let seen = new Set<string>()
  while (current?.fallback_model_id && chain.length < 5) {
    if (seen.has(current.fallback_model_id)) break
    seen.add(current.fallback_model_id)

    const next = getModel(current.fallback_model_id)
    if (!next) break
    chain.push(next.model_id)
    current = next
  }

  return chain
}

/**
 * Get the cross-agent fallback for an agent.
 */
export function getCrossAgentFallback(agentId: string): { agent: string; model: string } | null {
  try {
    const row = db.select().from(schema.config_overrides)
      .where(eq(schema.config_overrides.key, 'registry:cross_agent_fallback'))
      .get()
    if (!row) return null

    const map = JSON.parse(row.value) as Record<string, { agent: string; model: string }>
    return map[agentId] ?? null
  } catch {
    return null
  }
}

/**
 * Reconstruct the AGENT_MATRIX shape from DB for backwards compat.
 */
export function getAgentMatrix(): Array<{
  agent: string
  command: string
  timeout: number
  enabled: boolean
  status: string
  default_model: string | null
  default_provider: string | null
  models: ModelRow[]
}> {
  const agents = getAllAgents()
  return agents.map(agent => ({
    agent: agent.id,
    command: agent.command,
    timeout: agent.timeout_seconds ?? 1800,
    enabled: agent.enabled ?? true,
    status: agent.status ?? 'unknown',
    default_model: agent.default_model,
    default_provider: agent.default_provider,
    models: getModelsForAgent(agent.id),
  }))
}

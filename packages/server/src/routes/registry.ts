/**
 * Registry API Routes
 *
 * CRUD for agents, providers, models, health, and registry operations.
 */

import { Hono } from 'hono'
import {
  getAllAgents, getAgent, upsertAgent,
  getAllProviders, getProvider, upsertProvider,
  getAllModels, getModelsForAgent, getModelsForProvider, getFreeModels, upsertModel,
  getAgentMatrix, getFallbackChain, getRegistryHealthSummary,
} from '../db/registry-queries'
import { broadcast } from '../sse'

const app = new Hono()

// =========================================================================
// Agents
// =========================================================================

// GET /api/registry/agents - List all agents with status
app.get('/agents', (c) => {
  const agents = getAllAgents()
  return c.json(agents)
})

// GET /api/registry/agents/:id - Agent detail + models + health
app.get('/agents/:id', (c) => {
  const id = c.req.param('id')
  const agent = getAgent(id)
  if (!agent) return c.json({ error: 'Agent not found' }, 404)

  const models = getModelsForAgent(id)
  return c.json({ ...agent, models })
})

// PATCH /api/registry/agents/:id - Update agent
app.patch('/agents/:id', async (c) => {
  const id = c.req.param('id')
  const agent = getAgent(id)
  if (!agent) return c.json({ error: 'Agent not found' }, 404)

  const body = await c.req.json()
  const updates: Record<string, unknown> = {}
  if (body.enabled !== undefined) updates.enabled = body.enabled
  if (body.timeout_seconds !== undefined) updates.timeout_seconds = body.timeout_seconds
  if (body.default_model !== undefined) updates.default_model = body.default_model
  if (body.default_provider !== undefined) updates.default_provider = body.default_provider
  if (body.notes !== undefined) updates.notes = body.notes

  upsertAgent(id, updates as any)

  // Invalidate cache
  try {
    const { invalidateAgent } = await import('../agents/registry-cache')
    await invalidateAgent(id)
  } catch { /* cache not ready */ }

  const updated = getAgent(id)
  return c.json(updated)
})

// =========================================================================
// Providers
// =========================================================================

// GET /api/registry/providers - List all providers
app.get('/providers', (c) => {
  const providers = getAllProviders()
  return c.json(providers)
})

// GET /api/registry/providers/:id - Provider detail + models
app.get('/providers/:id', (c) => {
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Provider not found' }, 404)

  const models = getModelsForProvider(id)
  return c.json({ ...provider, models })
})

// PATCH /api/registry/providers/:id - Update provider config
app.patch('/providers/:id', async (c) => {
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Provider not found' }, 404)

  const body = await c.req.json()
  const updates: Record<string, unknown> = {}
  if (body.api_base !== undefined) updates.api_base = body.api_base
  if (body.billing !== undefined) updates.billing = body.billing
  if (body.config !== undefined) updates.config = JSON.stringify(body.config)

  upsertProvider(id, updates as any)

  const updated = getProvider(id)
  return c.json(updated)
})

// POST /api/registry/providers/:id/refresh - Trigger model fetch for one provider
app.post('/providers/:id/refresh', async (c) => {
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Provider not found' }, 404)

  try {
    const { fetchProviderModels } = await import('../agents/fetch-models')
    const result = await fetchProviderModels(id)
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Fetch failed' }, 500)
  }
})

// =========================================================================
// Models
// =========================================================================

// GET /api/registry/models - List models with optional filters
app.get('/models', (c) => {
  const agent = c.req.query('agent')
  const provider = c.req.query('provider')
  const free = c.req.query('free')

  let models
  if (agent) {
    models = getModelsForAgent(agent)
  } else if (provider) {
    models = getModelsForProvider(provider)
  } else if (free === 'true') {
    models = getFreeModels()
  } else {
    models = getAllModels()
  }

  return c.json(models)
})

// PATCH /api/registry/models/:id - Update model
app.patch('/models/:id{.+}', async (c) => {
  const id = c.req.param('id')

  const body = await c.req.json()
  const updates: Record<string, unknown> = {}
  if (body.available !== undefined) updates.available = body.available
  if (body.fallback_model_id !== undefined) updates.fallback_model_id = body.fallback_model_id
  if (body.compatible_agents !== undefined) updates.compatible_agents = JSON.stringify(body.compatible_agents)

  upsertModel(id, updates as any)

  return c.json({ success: true, id })
})

// =========================================================================
// Matrix & Health
// =========================================================================

// GET /api/registry/matrix - Full matrix view
app.get('/matrix', (c) => {
  const matrix = getAgentMatrix()
  return c.json(matrix)
})

// GET /api/registry/health - Health summary
app.get('/health', (c) => {
  const health = getRegistryHealthSummary()
  return c.json(health)
})

// GET /api/registry/fallback/:agent/:model - Show fallback chain
app.get('/fallback/:agent/:model', (c) => {
  const agent = c.req.param('agent')
  const model = c.req.param('model')
  const chain = getFallbackChain(agent, model)
  return c.json({ agent, model, chain })
})

// =========================================================================
// Operations
// =========================================================================

// POST /api/registry/detect - Trigger CLI detection
app.post('/detect', async (c) => {
  try {
    const { detectAllAgents } = await import('../agents/detect')
    const result = await detectAllAgents()
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Detection failed' }, 500)
  }
})

// POST /api/registry/refresh - Trigger full refresh
app.post('/refresh', async (c) => {
  try {
    const { runRegistryRefreshCycle } = await import('../scheduler/cycles/registry-refresh')
    // Run in background
    runRegistryRefreshCycle({} as any).catch(e => console.error('[Registry] Refresh failed:', e))
    return c.json({ status: 'started', message: 'Registry refresh triggered' })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Refresh failed' }, 500)
  }
})

// GET /api/registry/credentials - List available credential keys (names only, no values)
app.get('/credentials', (c) => {
  try {
    const { getAvailableCredentialKeys } = require('../agents/credentials')
    const keys = getAvailableCredentialKeys()
    return c.json({ keys, count: keys.length })
  } catch {
    return c.json({ keys: [], count: 0 })
  }
})

export default app

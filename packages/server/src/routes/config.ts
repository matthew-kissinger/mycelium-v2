/**
 * Config API Routes
 *
 * GET/PATCH endpoints for system configuration:
 * - /api/config/scheduler - Scheduler configuration
 * - /api/config/genesis - Genesis agent configuration
 * - /api/config/hooks - Hooks/webhook configuration
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  SchedulerConfig,
  GenesisConfig,
  HooksConfig,
} from '@mycelium/shared'
import {
  loadSchedulerConfig,
  saveSchedulerConfig,
  getSchedulerConfigPath,
  loadGenesisConfig,
  saveGenesisConfig,
  getGenesisConfigPath,
  loadHooksConfig,
  saveHooksConfig,
  getHooksConfigPath,
  getConfigDir,
  listConfigFiles,
  loadAgentsConfig,
  saveAgentsConfig,
  getAgentConfig,
  updateAgentConfig,
  getAgentsConfigPath,
  getEnabledAgents,
} from '../config'
import { getConfigHistory, saveConfigOverride } from '../db/config-store'

const app = new Hono()

// =============================================================================
// Config Overview
// =============================================================================

// GET /api/config - Get overview of all config
app.get('/', async (c) => {
  return c.json({
    config_dir: getConfigDir(),
    files: listConfigFiles(),
    endpoints: {
      scheduler: '/api/config/scheduler',
      genesis: '/api/config/genesis',
      hooks: '/api/config/hooks',
      agents: '/api/config/agents',
    },
  })
})

// =============================================================================
// Scheduler Configuration
// =============================================================================

// GET /api/config/scheduler - Get scheduler config
app.get('/scheduler', async (c) => {
  const config = loadSchedulerConfig()
  return c.json({
    config,
    config_path: getSchedulerConfigPath(),
  })
})

// Validation schema for scheduler config updates
const SchedulerConfigUpdateSchema = z.object({
  // Dispatcher
  dispatcher_enabled: z.boolean().optional(),
  dispatcher_interval_sec: z.number().int().positive().optional(),
  max_concurrent_tasks: z.number().int().positive().optional(),
  min_concurrent_tasks: z.number().int().positive().optional(),
  max_concurrent_ceiling: z.number().int().positive().optional(),
  blocked_task_timeout_sec: z.number().int().positive().optional(),
  blocked_check_enabled: z.boolean().optional(),
  orphan_cancel_timeout_sec: z.number().int().positive().optional(),
  // Discovery
  discovery_enabled: z.boolean().optional(),
  discovery_interval_sec: z.number().int().positive().optional(),
  discovery_repos: z.array(z.string()).optional(),
  discovery_auto_create: z.array(z.string()).optional(),
  // Shepherd
  shepherd_enabled: z.boolean().optional(),
  shepherd_batch_size: z.number().int().positive().optional(),
  // Armory
  armory_enabled: z.boolean().optional(),
  armory_batch_size: z.number().int().positive().optional(),
  // Digest
  digest_enabled: z.boolean().optional(),
  digest_interval_sec: z.number().int().positive().optional(),
  // Compaction
  compaction_enabled: z.boolean().optional(),
  compaction_interval_sec: z.number().int().positive().optional(),
  // Auto prune
  auto_prune_enabled: z.boolean().optional(),
  auto_prune_threshold: z.number().int().positive().optional(),
  auto_prune_keep: z.number().int().positive().optional(),
})

// PATCH /api/config/scheduler - Update scheduler config
app.patch('/scheduler', zValidator('json', SchedulerConfigUpdateSchema), async (c) => {
  const updates = c.req.valid('json')

  // Load current config
  const current = loadSchedulerConfig()

  // Merge updates
  const updated: SchedulerConfig = { ...current, ...updates }

  // Save to disk (fallback) and DB (primary)
  saveSchedulerConfig(updated)
  saveConfigOverride('scheduler', JSON.stringify(updated), 'api')

  return c.json({
    message: 'Scheduler config updated',
    config: updated,
    config_path: getSchedulerConfigPath(),
  })
})

// =============================================================================
// Genesis Configuration
// =============================================================================

// GET /api/config/genesis - Get genesis config
app.get('/genesis', async (c) => {
  const config = loadGenesisConfig()
  return c.json({
    config,
    config_path: getGenesisConfigPath(),
  })
})

// Validation schema for genesis config updates
const GenesisConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  interval_sec: z.number().int().positive().optional(),
  auto_create: z.boolean().optional(),
  default_public: z.boolean().optional(),
  default_language: z.string().optional().nullable(),
  repos_dir: z.string().optional(),
  last_run: z.string().datetime().optional().nullable(),
})

// PATCH /api/config/genesis - Update genesis config
app.patch('/genesis', zValidator('json', GenesisConfigUpdateSchema), async (c) => {
  const updates = c.req.valid('json')

  // Load current config
  const current = loadGenesisConfig()

  // Handle nullable fields (convert null to undefined)
  const processedUpdates: Partial<GenesisConfig> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      (processedUpdates as any)[key] = undefined
    } else if (value !== undefined) {
      (processedUpdates as any)[key] = value
    }
  }

  // Merge updates
  const updated: GenesisConfig = { ...current, ...processedUpdates }

  // Save to disk (fallback) and DB (primary)
  saveGenesisConfig(updated)
  saveConfigOverride('genesis', JSON.stringify(updated), 'api')

  return c.json({
    message: 'Genesis config updated',
    config: updated,
    config_path: getGenesisConfigPath(),
  })
})

// =============================================================================
// Hooks Configuration
// =============================================================================

// GET /api/config/hooks - Get hooks config
app.get('/hooks', async (c) => {
  const config = loadHooksConfig()

  // Count hooks by type
  const hookCounts: Record<string, number> = {}
  for (const [type, webhooks] of Object.entries(config.hooks)) {
    hookCounts[type] = webhooks.filter((w) => w.enabled).length
  }

  return c.json({
    config,
    config_path: getHooksConfigPath(),
    hooks_summary: hookCounts,
    total_hooks: Object.values(hookCounts).reduce((a, b) => a + b, 0),
  })
})

// Validation schema for hooks config updates
const HooksConfigUpdateSchema = z.object({
  hooks: z.record(z.string(), z.array(z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT']).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
  }))).optional(),
  global_headers: z.record(z.string(), z.string()).optional().nullable(),
  timeout_ms: z.number().int().positive().optional(),
  retry_count: z.number().int().nonnegative().optional(),
})

// PATCH /api/config/hooks - Update hooks config
app.patch('/hooks', zValidator('json', HooksConfigUpdateSchema), async (c) => {
  const updates = c.req.valid('json')

  // Load current config
  const current = loadHooksConfig()

  // Handle nullable fields
  const processedUpdates: Partial<HooksConfig> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      (processedUpdates as any)[key] = undefined
    } else if (value !== undefined) {
      (processedUpdates as any)[key] = value
    }
  }

  // Merge updates
  const updated: HooksConfig = { ...current, ...processedUpdates }

  // Save to disk (fallback) and DB (primary)
  saveHooksConfig(updated)
  saveConfigOverride('hooks', JSON.stringify(updated), 'api')

  return c.json({
    message: 'Hooks config updated',
    config: updated,
    config_path: getHooksConfigPath(),
  })
})

// =============================================================================
// Agents Configuration
// =============================================================================

// GET /api/config/agents - Get all agents config
app.get('/agents', async (c) => {
  const config = loadAgentsConfig()
  const enabledAgents = getEnabledAgents()

  return c.json({
    agents: config.agents,
    config_path: getAgentsConfigPath(),
    enabled_count: enabledAgents.length,
    total_count: Object.keys(config.agents).length,
  })
})

// GET /api/config/agents/:name - Get specific agent config
app.get('/agents/:name', async (c) => {
  const agentName = c.req.param('name')
  const agentConfig = getAgentConfig(agentName)

  if (!agentConfig) {
    return c.json({ error: `Agent not found: ${agentName}` }, 404)
  }

  return c.json({
    name: agentName,
    config: agentConfig,
  })
})

// Validation schema for agent config updates
const AgentConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  timeout_seconds: z.number().int().positive().optional(),
  max_turns: z.number().int().positive().optional(),
  default_model: z.string().optional().nullable(),
  description: z.string().optional(),
  command: z.string().optional(),
  supports_streaming: z.boolean().optional(),
})

// PATCH /api/config/agents/:name - Update specific agent config
app.patch('/agents/:name', zValidator('json', AgentConfigUpdateSchema), async (c) => {
  const agentName = c.req.param('name')
  const updates = c.req.valid('json')

  // Check if agent exists
  const existing = getAgentConfig(agentName)
  if (!existing) {
    return c.json({ error: `Agent not found: ${agentName}` }, 404)
  }

  // Handle nullable fields
  const processedUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      processedUpdates[key] = undefined
    } else if (value !== undefined) {
      processedUpdates[key] = value
    }
  }

  // Update agent config (saves to disk)
  const updated = updateAgentConfig(agentName, processedUpdates)

  // Also save to DB for history tracking
  saveConfigOverride(`agents:${agentName}`, JSON.stringify(updated), 'api')

  return c.json({
    message: `Agent ${agentName} config updated`,
    name: agentName,
    config: updated,
  })
})

// =============================================================================
// Config History
// =============================================================================

// GET /api/config/history - Get config change history
app.get('/history', async (c) => {
  const key = c.req.query('key')
  const limit = parseInt(c.req.query('limit') ?? '50')
  const offset = parseInt(c.req.query('offset') ?? '0')

  const history = getConfigHistory({ key: key || undefined, limit, offset })

  return c.json({
    history,
    total: history.length,
    filters: { key: key || null, limit, offset },
  })
})

export default app

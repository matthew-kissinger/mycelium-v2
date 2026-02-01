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
} from '../config'

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
  dispatcher_enabled: z.boolean().optional(),
  dispatcher_interval_sec: z.number().int().positive().optional(),
  max_concurrent_tasks: z.number().int().positive().optional(),
  min_concurrent_tasks: z.number().int().positive().optional(),
  max_concurrent_ceiling: z.number().int().positive().optional(),
  blocked_task_timeout_sec: z.number().int().positive().optional(),
  blocked_check_enabled: z.boolean().optional(),
  orphan_cancel_timeout_sec: z.number().int().positive().optional(),
  discovery_enabled: z.boolean().optional(),
  discovery_interval_sec: z.number().int().positive().optional(),
  discovery_repos: z.array(z.string()).optional(),
  discovery_auto_create: z.array(z.string()).optional(),
  digest_enabled: z.boolean().optional(),
  digest_interval_sec: z.number().int().positive().optional(),
  compaction_enabled: z.boolean().optional(),
  compaction_day: z.number().int().min(0).max(6).optional(),
  compaction_hour: z.number().int().min(0).max(23).optional(),
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

  // Save to disk
  saveSchedulerConfig(updated)

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

  // Save to disk
  saveGenesisConfig(updated)

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

  // Save to disk
  saveHooksConfig(updated)

  return c.json({
    message: 'Hooks config updated',
    config: updated,
    config_path: getHooksConfigPath(),
  })
})

export default app

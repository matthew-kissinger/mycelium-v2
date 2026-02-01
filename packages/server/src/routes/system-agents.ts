import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../db/queries'
import { broadcast } from '../sse'
import {
  getSchedulerStatus,
  getSchedulerConfig,
  updateSchedulerConfig,
  startScheduler,
  stopScheduler,
} from '../scheduler'

// =============================================================================
// System Agent Runs Routes (/api/system-agents)
// =============================================================================

export const systemAgentsRoutes = new Hono()

// GET /api/system-agents/runs - List system agent runs with filters
systemAgentsRoutes.get('/runs', async (c) => {
  const agent_type = c.req.query('agent_type') as queries.SystemAgentType | undefined
  const status = c.req.query('status') as queries.SystemAgentStatus | undefined
  const repo_path = c.req.query('repo_path')
  const limit = parseInt(c.req.query('limit') ?? '50')
  const offset = parseInt(c.req.query('offset') ?? '0')

  // Get runs with filters
  let runs = await queries.getRuns({
    agent_type,
    status,
    limit: limit + offset, // Fetch enough for offset + limit
  })

  // Apply offset (simple pagination)
  runs = runs.slice(offset, offset + limit)

  // Filter by repo_path if specified (not in getRuns options)
  if (repo_path) {
    runs = runs.filter((run) => run.repo_path === repo_path)
  }

  return c.json(runs.map(queries.parseRun))
})

// GET /api/system-agents/runs/:id - Get run details
systemAgentsRoutes.get('/runs/:id', async (c) => {
  const id = c.req.param('id')
  const run = await queries.getRun(id)

  if (!run) {
    return c.json({ error: 'System agent run not found' }, 404)
  }

  return c.json(queries.parseRun(run))
})

// =============================================================================
// Discovery Routes (/api/discovery)
// =============================================================================

export const discoveryRoutes = new Hono()

// Validation schema for trigger requests
const TriggerRequestSchema = z.object({
  repo_path: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

// POST /api/discovery/trigger - Manually trigger discovery for a repo
discoveryRoutes.post('/trigger', zValidator('json', TriggerRequestSchema), async (c) => {
  const data = c.req.valid('json')

  const run = await queries.createRun({
    agent_type: 'discovery',
    repo_path: data.repo_path,
    context: data.context,
  })

  // Broadcast the event
  broadcast('system:agent_started', {
    id: run.id,
    agent_type: 'discovery',
    repo_path: run.repo_path,
  })

  return c.json({
    message: 'Discovery agent triggered',
    run: queries.parseRun(run as any),
  }, 201)
})

// =============================================================================
// Sequencer Routes (/api/sequencer)
// =============================================================================

export const sequencerRoutes = new Hono()

// POST /api/sequencer/trigger - Manually trigger sequencer
sequencerRoutes.post('/trigger', zValidator('json', TriggerRequestSchema), async (c) => {
  const data = c.req.valid('json')

  const run = await queries.createRun({
    agent_type: 'sequencer',
    repo_path: data.repo_path,
    context: data.context,
  })

  // Broadcast the event
  broadcast('system:agent_started', {
    id: run.id,
    agent_type: 'sequencer',
    repo_path: run.repo_path,
  })

  return c.json({
    message: 'Sequencer agent triggered',
    run: queries.parseRun(run as any),
  }, 201)
})

// =============================================================================
// Shepherd Routes (/api/shepherd)
// =============================================================================

export const shepherdRoutes = new Hono()

// POST /api/shepherd/trigger - Manually trigger shepherd evaluation
shepherdRoutes.post('/trigger', zValidator('json', TriggerRequestSchema), async (c) => {
  const data = c.req.valid('json')

  // Shepherd requires repo_path
  if (!data.repo_path) {
    return c.json({ error: 'repo_path is required for shepherd trigger' }, 400)
  }

  const run = await queries.createRun({
    agent_type: 'shepherd',
    repo_path: data.repo_path,
    context: data.context,
  })

  // Broadcast the event
  broadcast('system:agent_started', {
    id: run.id,
    agent_type: 'shepherd',
    repo_path: run.repo_path,
  })

  return c.json({
    message: 'Shepherd agent triggered',
    run: queries.parseRun(run as any),
  }, 201)
})

// GET /api/shepherd/status - Get shepherd batch status
shepherdRoutes.get('/status', async (c) => {
  // Get unevaluated tasks count per repo
  const unevaluatedTasks = await queries.getUnevaluatedTasks(undefined, 1000)

  // Group by repo
  const repoStats: Record<string, { unevaluated: number; last_evaluation?: string }> = {}

  for (const task of unevaluatedTasks) {
    const repo = task.repo_path
    if (!repoStats[repo]) {
      repoStats[repo] = { unevaluated: 0 }
    }
    repoStats[repo].unevaluated++
  }

  // Get recent shepherd runs
  const recentRuns = await queries.getRuns({ agent_type: 'shepherd', limit: 10 })

  // Get recent evaluations per repo
  const evaluations = await queries.getShepherdEvaluations({ limit: 50 })
  for (const eval_ of evaluations) {
    if (!repoStats[eval_.repo_path]) {
      repoStats[eval_.repo_path] = { unevaluated: 0 }
    }
    if (!repoStats[eval_.repo_path].last_evaluation) {
      repoStats[eval_.repo_path].last_evaluation = eval_.evaluated_at
    }
  }

  // Determine which repos are ready for evaluation (batch_size threshold = 5)
  const batchSize = 5
  const readyRepos = Object.entries(repoStats)
    .filter(([_, stats]) => stats.unevaluated >= batchSize)
    .map(([path, stats]) => ({ path, ...stats }))

  return c.json({
    batch_size: batchSize,
    repos: repoStats,
    ready_repos: readyRepos,
    recent_runs: recentRuns.map(queries.parseRun),
    total_unevaluated: unevaluatedTasks.length,
  })
})

// GET /api/shepherd/evaluations - List shepherd evaluations
shepherdRoutes.get('/evaluations', async (c) => {
  const repo_path = c.req.query('repo_path')
  const limit = parseInt(c.req.query('limit') ?? '50')
  const offset = parseInt(c.req.query('offset') ?? '0')

  const evaluations = await queries.getShepherdEvaluations({
    repo_path: repo_path ?? undefined,
    limit: limit + offset,
  })

  // Apply offset
  const paginatedEvaluations = evaluations.slice(offset, offset + limit)

  return c.json({
    evaluations: paginatedEvaluations.map(queries.parseShepherdEvaluation),
    total: evaluations.length,
  })
})

// POST /api/shepherd/reset-counter - Reset evaluation counter for tasks
shepherdRoutes.post('/reset-counter', async (c) => {
  let repo_path: string | undefined
  try {
    const body = await c.req.json()
    repo_path = body.repo_path
  } catch {
    // No body, reset all
  }

  const { db } = await import('../db')
  const { schema } = await import('../db')
  const { eq } = await import('drizzle-orm')

  // Reset shepherd_evaluated_at for done tasks
  if (repo_path) {
    // Reset for specific repo
    await db.update(schema.tasks)
      .set({ shepherd_evaluated_at: null })
      .where(eq(schema.tasks.repo_path, repo_path))

    return c.json({
      message: `Shepherd evaluation counter reset for repo: ${repo_path}`,
      repo_path,
    })
  } else {
    // Reset all
    await db.update(schema.tasks)
      .set({ shepherd_evaluated_at: null })

    return c.json({
      message: 'Shepherd evaluation counter reset for all tasks',
    })
  }
})

// =============================================================================
// Scheduler Routes (/api/scheduler)
// =============================================================================

export const schedulerRoutes = new Hono()

// GET /api/scheduler/status - Get scheduler status
schedulerRoutes.get('/status', async (c) => {
  const status = getSchedulerStatus()
  return c.json(status)
})

// GET /api/scheduler/config - Get scheduler config
schedulerRoutes.get('/config', async (c) => {
  const config = getSchedulerConfig()
  return c.json(config)
})

// Validation schema for config updates
const ConfigUpdateSchema = z.object({
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

// POST /api/scheduler/config - Update scheduler config
schedulerRoutes.post('/config', zValidator('json', ConfigUpdateSchema), async (c) => {
  const updates = c.req.valid('json')
  const config = updateSchedulerConfig(updates)
  return c.json({
    message: 'Scheduler config updated',
    config,
  })
})

// POST /api/scheduler/start - Start the scheduler
schedulerRoutes.post('/start', async (c) => {
  const status = startScheduler()
  return c.json({
    message: 'Scheduler started',
    status,
  })
})

// POST /api/scheduler/stop - Stop the scheduler
schedulerRoutes.post('/stop', async (c) => {
  const status = stopScheduler()
  return c.json({
    message: 'Scheduler stopped',
    status,
  })
})

// Default export for backwards compatibility
export default systemAgentsRoutes

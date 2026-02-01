import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as queries from '../db/queries'
import { broadcast } from '../sse'

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

// =============================================================================
// Scheduler Routes (/api/scheduler)
// =============================================================================

export const schedulerRoutes = new Hono()

// GET /api/scheduler/status - Get scheduler status (placeholder for now)
schedulerRoutes.get('/status', async (c) => {
  // Placeholder status - actual implementation comes in Phase 5
  // Returns a valid SchedulerStatus object with default/placeholder values

  const cycles: Array<{
    name: string
    enabled: boolean
    running: boolean
    last_run?: string
    next_run?: string
    runs_completed: number
    errors: number
  }> = [
    {
      name: 'dispatcher',
      enabled: true,
      running: false,
      runs_completed: 0,
      errors: 0,
    },
    {
      name: 'discovery',
      enabled: true,
      running: false,
      runs_completed: 0,
      errors: 0,
    },
    {
      name: 'sequencer',
      enabled: true,
      running: false,
      runs_completed: 0,
      errors: 0,
    },
    {
      name: 'shepherd',
      enabled: true,
      running: false,
      runs_completed: 0,
      errors: 0,
    },
    {
      name: 'digest',
      enabled: true,
      running: false,
      runs_completed: 0,
      errors: 0,
    },
    {
      name: 'compaction',
      enabled: true,
      running: false,
      runs_completed: 0,
      errors: 0,
    },
    {
      name: 'blocked_check',
      enabled: true,
      running: false,
      runs_completed: 0,
      errors: 0,
    },
  ]

  const status = {
    running: false, // Scheduler not implemented yet
    started_at: undefined,
    cycles,
  }

  return c.json(status)
})

// Default export for backwards compatibility
export default systemAgentsRoutes

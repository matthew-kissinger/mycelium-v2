import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { MemoryPatternCreateRequest, MemoryWarningCreateRequest, MemoryWriteRequest, MemoryCompactRequest } from '@mycelium/shared'
import {
  getGlobalPatterns,
  getGlobalWarnings,
  getPatterns,
  getWarnings,
  createPattern,
  createWarning,
  parsePattern,
} from '../db/queries'
import { broadcast } from '../sse'

const app = new Hono()

// GET /api/memory/global - Get global memory (patterns + warnings)
app.get('/global', async (c) => {
  const [patterns, warnings] = await Promise.all([
    getGlobalPatterns(),
    getGlobalWarnings(),
  ])

  return c.json({
    patterns: patterns.map(parsePattern),
    warnings,
  })
})

// POST /api/memory/global - Add to global memory (pattern or warning)
app.post('/global', zValidator('json', MemoryWriteRequest), async (c) => {
  const data = c.req.valid('json')

  if (data.type === 'pattern') {
    const pattern = await createPattern({
      content: data.content,
      source: data.source ?? 'manual',
      task_id: data.task_id,
      repo_path: undefined, // Global memory has no repo_path
      tags: data.tags ?? [],
    })

    const result = parsePattern(pattern as any)
    broadcast('memory:pattern_created', result)

    return c.json(result, 201)
  } else {
    const warning = await createWarning({
      content: data.content,
      severity: data.severity ?? 'medium',
      task_id: data.task_id,
      repo_path: undefined, // Global memory has no repo_path
    })

    broadcast('memory:warning_created', warning)

    return c.json(warning, 201)
  }
})

// GET /api/memory/repo/:path - Get repo-specific memory
// Note: path should be URL-encoded (e.g., %2Fhome%2Fuser%2Frepo)
app.get('/repo/:path', async (c) => {
  const encodedPath = c.req.param('path')
  const repoPath = decodeURIComponent(encodedPath)

  const [patterns, warnings] = await Promise.all([
    getPatterns({ repo_path: repoPath }),
    getWarnings({ repo_path: repoPath }),
  ])

  return c.json({
    repo_path: repoPath,
    patterns: patterns.map(parsePattern),
    warnings,
  })
})

// POST /api/memory/repo/:path - Add to repo memory
app.post('/repo/:path', zValidator('json', MemoryWriteRequest), async (c) => {
  const encodedPath = c.req.param('path')
  const repoPath = decodeURIComponent(encodedPath)
  const data = c.req.valid('json')

  if (data.type === 'pattern') {
    const pattern = await createPattern({
      content: data.content,
      source: data.source ?? 'manual',
      task_id: data.task_id,
      repo_path: repoPath,
      tags: data.tags ?? [],
    })

    const result = parsePattern(pattern as any)
    broadcast('memory:pattern_created', { ...result, repo_path: repoPath })

    return c.json(result, 201)
  } else {
    const warning = await createWarning({
      content: data.content,
      severity: data.severity ?? 'medium',
      task_id: data.task_id,
      repo_path: repoPath,
    })

    broadcast('memory:warning_created', { ...warning, repo_path: repoPath })

    return c.json(warning, 201)
  }
})

// POST /api/memory/compact - Trigger memory compaction (placeholder)
app.post('/compact', zValidator('json', MemoryCompactRequest), async (c) => {
  const data = c.req.valid('json')

  // Placeholder: Memory compaction would be handled by a system agent
  // For now, just return a success response indicating the request was received
  return c.json({
    message: 'Memory compaction triggered',
    repo_path: data.repo_path ?? 'global',
    status: 'queued',
  })
})

// =============================================================================
// Agent Stats Endpoints
// =============================================================================

// GET /api/memory/agent-stats - Get all agent performance stats
app.get('/agent-stats', async (c) => {
  const stats = await calculateAgentStats()
  return c.json(stats)
})

// GET /api/memory/agent-stats/:agent - Get stats for specific agent
app.get('/agent-stats/:agent', async (c) => {
  const agent = c.req.param('agent')
  const stats = await calculateAgentStats(agent)

  if (!stats.agents[agent]) {
    return c.json({
      error: `No stats found for agent: ${agent}`,
      available_agents: Object.keys(stats.agents),
    }, 404)
  }

  return c.json({
    agent,
    stats: stats.agents[agent],
    period: stats.period,
  })
})

// POST /api/memory/agent-stats/backfill - Rebuild stats from completed tasks
app.post('/agent-stats/backfill', async (c) => {
  // Get all completed tasks
  const { db } = await import('../db')
  const { schema } = await import('../db')
  const { eq, or } = await import('drizzle-orm')

  const completedTasks = await db.select().from(schema.tasks)
    .where(or(eq(schema.tasks.status, 'done'), eq(schema.tasks.status, 'failed')))

  const stats = await calculateAgentStats()

  return c.json({
    message: 'Agent stats rebuilt from task history',
    tasks_processed: completedTasks.length,
    stats,
  })
})

// =============================================================================
// Helper: Calculate agent performance stats
// =============================================================================
async function calculateAgentStats(filterAgent?: string) {
  const { db } = await import('../db')
  const { schema } = await import('../db')
  const { or, eq, and } = await import('drizzle-orm')

  // Get all completed tasks (done + failed)
  const completedTasks = await db.select().from(schema.tasks)
    .where(or(eq(schema.tasks.status, 'done'), eq(schema.tasks.status, 'failed')))

  // Group by agent
  const agentStats: Record<string, {
    total_tasks: number
    successful: number
    failed: number
    success_rate: number
    total_cost_usd: number
    avg_cost_usd: number
    total_duration_seconds: number
    avg_duration_seconds: number
    models_used: Record<string, number>
  }> = {}

  for (const task of completedTasks) {
    const agent = task.agent ?? 'unknown'

    if (filterAgent && agent !== filterAgent) {
      continue
    }

    if (!agentStats[agent]) {
      agentStats[agent] = {
        total_tasks: 0,
        successful: 0,
        failed: 0,
        success_rate: 0,
        total_cost_usd: 0,
        avg_cost_usd: 0,
        total_duration_seconds: 0,
        avg_duration_seconds: 0,
        models_used: {},
      }
    }

    const s = agentStats[agent]
    s.total_tasks++

    if (task.status === 'done') {
      s.successful++
    } else {
      s.failed++
    }

    s.total_cost_usd += task.cost_usd ?? 0
    s.total_duration_seconds += task.duration_seconds ?? 0

    // Track model usage
    const model = task.model ?? 'default'
    s.models_used[model] = (s.models_used[model] ?? 0) + 1
  }

  // Calculate averages
  for (const agent of Object.keys(agentStats)) {
    const s = agentStats[agent]
    s.success_rate = s.total_tasks > 0 ? s.successful / s.total_tasks : 0
    s.avg_cost_usd = s.total_tasks > 0 ? s.total_cost_usd / s.total_tasks : 0
    s.avg_duration_seconds = s.total_tasks > 0 ? s.total_duration_seconds / s.total_tasks : 0
  }

  // Find date range
  const timestamps = completedTasks
    .map((t) => t.completed_at)
    .filter(Boolean)
    .sort()

  return {
    agents: agentStats,
    period: {
      start: timestamps[0] ?? null,
      end: timestamps[timestamps.length - 1] ?? null,
      total_tasks: completedTasks.length,
    },
  }
}

export default app

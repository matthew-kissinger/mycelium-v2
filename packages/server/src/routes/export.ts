import { Hono } from 'hono'
import { db, schema } from '../db'
import { desc, eq, and, gte, lte } from 'drizzle-orm'

const app = new Hono()

// =============================================================================
// GET /api/export/tasks - Export tasks as CSV or JSON
// =============================================================================
app.get('/tasks', async (c) => {
  // Parse query parameters
  const format = (c.req.query('format') ?? 'json') as 'json' | 'csv'
  const status = c.req.query('status')
  const repo_path = c.req.query('repo_path')
  const start_date = c.req.query('start_date')
  const end_date = c.req.query('end_date')
  const limit = parseInt(c.req.query('limit') ?? '1000')
  const include_result = c.req.query('include_result') === 'true'

  // Build query conditions
  const conditions: any[] = []

  if (status) {
    conditions.push(eq(schema.tasks.status, status))
  }

  if (repo_path) {
    conditions.push(eq(schema.tasks.repo_path, repo_path))
  }

  if (start_date) {
    conditions.push(gte(schema.tasks.created_at, start_date))
  }

  if (end_date) {
    conditions.push(lte(schema.tasks.created_at, end_date))
  }

  // Fetch tasks
  let tasks
  if (conditions.length > 0) {
    tasks = await db.select().from(schema.tasks)
      .where(and(...conditions))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  } else {
    tasks = await db.select().from(schema.tasks)
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  // Transform tasks for export
  const exportData = tasks.map((task) => {
    const base = {
      id: task.id,
      title: task.title,
      status: task.status,
      agent: task.agent,
      model: task.model,
      repo_path: task.repo_path,
      sequenced: task.sequenced,
      depends_on: task.depends_on,
      cost_usd: task.cost_usd ?? 0,
      duration_seconds: task.duration_seconds ?? 0,
      created_at: task.created_at,
      started_at: task.started_at,
      completed_at: task.completed_at,
      error: task.error,
    }

    if (include_result) {
      return {
        ...base,
        prompt: task.prompt,
        result: task.result,
      }
    }

    return base
  })

  if (format === 'csv') {
    // Generate CSV
    const csv = generateCSV(exportData)

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="tasks_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  // Return JSON
  return c.json({
    tasks: exportData,
    count: exportData.length,
    exported_at: new Date().toISOString(),
    filters: {
      status,
      repo_path,
      start_date,
      end_date,
      limit,
    },
  })
})

// =============================================================================
// GET /api/export/evaluations - Export shepherd evaluations
// =============================================================================
app.get('/evaluations', async (c) => {
  const format = (c.req.query('format') ?? 'json') as 'json' | 'csv'
  const repo_path = c.req.query('repo_path')
  const limit = parseInt(c.req.query('limit') ?? '500')

  let evaluations
  if (repo_path) {
    evaluations = await db.select().from(schema.shepherd_evaluations)
      .where(eq(schema.shepherd_evaluations.repo_path, repo_path))
      .orderBy(desc(schema.shepherd_evaluations.evaluated_at))
      .limit(limit)
  } else {
    evaluations = await db.select().from(schema.shepherd_evaluations)
      .orderBy(desc(schema.shepherd_evaluations.evaluated_at))
      .limit(limit)
  }

  // Transform for export
  const exportData = evaluations.map((eval_) => ({
    id: eval_.id,
    repo_path: eval_.repo_path,
    evaluated_at: eval_.evaluated_at,
    health: eval_.health,
    headline: eval_.headline,
    recommendation: eval_.recommendation,
    tasks_evaluated: eval_.tasks_evaluated,
    concerns: eval_.concerns,
    wins: eval_.wins,
  }))

  if (format === 'csv') {
    const csv = generateCSV(exportData)

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="evaluations_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  return c.json({
    evaluations: exportData,
    count: exportData.length,
    exported_at: new Date().toISOString(),
  })
})

// =============================================================================
// GET /api/export/memory - Export memory patterns and warnings
// =============================================================================
app.get('/memory', async (c) => {
  const format = (c.req.query('format') ?? 'json') as 'json' | 'csv'
  const repo_path = c.req.query('repo_path')
  const type = c.req.query('type') // 'patterns' | 'warnings' | 'all'

  const includePatterns = !type || type === 'all' || type === 'patterns'
  const includeWarnings = !type || type === 'all' || type === 'warnings'

  let patterns: any[] = []
  let warnings: any[] = []

  if (includePatterns) {
    if (repo_path) {
      patterns = await db.select().from(schema.memory_patterns)
        .where(eq(schema.memory_patterns.repo_path, repo_path))
        .orderBy(desc(schema.memory_patterns.created_at))
    } else {
      patterns = await db.select().from(schema.memory_patterns)
        .orderBy(desc(schema.memory_patterns.created_at))
    }
  }

  if (includeWarnings) {
    if (repo_path) {
      warnings = await db.select().from(schema.memory_warnings)
        .where(eq(schema.memory_warnings.repo_path, repo_path))
        .orderBy(desc(schema.memory_warnings.created_at))
    } else {
      warnings = await db.select().from(schema.memory_warnings)
        .orderBy(desc(schema.memory_warnings.created_at))
    }
  }

  if (format === 'csv') {
    // Combine patterns and warnings with a type column
    const combined = [
      ...patterns.map((p) => ({ type: 'pattern', ...p })),
      ...warnings.map((w) => ({ type: 'warning', ...w })),
    ]

    const csv = generateCSV(combined)

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="memory_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  return c.json({
    patterns,
    warnings,
    counts: {
      patterns: patterns.length,
      warnings: warnings.length,
    },
    exported_at: new Date().toISOString(),
  })
})

// =============================================================================
// GET /api/export/stats - Export comprehensive stats
// =============================================================================
app.get('/stats', async (c) => {
  const format = (c.req.query('format') ?? 'json') as 'json' | 'csv'

  // Get all tasks
  const tasks = await db.select().from(schema.tasks)

  // Calculate stats per repo
  const repoStats: Record<string, {
    total: number
    pending: number
    running: number
    done: number
    failed: number
    cancelled: number
    total_cost_usd: number
    avg_duration_seconds: number
  }> = {}

  // Calculate stats per agent
  const agentStats: Record<string, {
    total: number
    successful: number
    failed: number
    total_cost_usd: number
    avg_duration_seconds: number
  }> = {}

  for (const task of tasks) {
    // Repo stats
    const repo = task.repo_path
    if (!repoStats[repo]) {
      repoStats[repo] = {
        total: 0,
        pending: 0,
        running: 0,
        done: 0,
        failed: 0,
        cancelled: 0,
        total_cost_usd: 0,
        avg_duration_seconds: 0,
      }
    }

    const rs = repoStats[repo]
    rs.total++
    if (task.status === 'pending') rs.pending++
    else if (task.status === 'running') rs.running++
    else if (task.status === 'done') rs.done++
    else if (task.status === 'failed') rs.failed++
    else if (task.status === 'cancelled') rs.cancelled++
    rs.total_cost_usd += task.cost_usd ?? 0

    // Agent stats
    const agent = task.agent ?? 'unknown'
    if (!agentStats[agent]) {
      agentStats[agent] = {
        total: 0,
        successful: 0,
        failed: 0,
        total_cost_usd: 0,
        avg_duration_seconds: 0,
      }
    }

    const as = agentStats[agent]
    as.total++
    if (task.status === 'done') as.successful++
    else if (task.status === 'failed') as.failed++
    as.total_cost_usd += task.cost_usd ?? 0
  }

  // Calculate averages (simplified)
  for (const repo of Object.keys(repoStats)) {
    const rs = repoStats[repo]
    const completed = rs.done + rs.failed
    rs.avg_duration_seconds = completed > 0
      ? tasks.filter((t) => t.repo_path === repo && t.duration_seconds).reduce((a, t) => a + (t.duration_seconds ?? 0), 0) / completed
      : 0
  }

  for (const agent of Object.keys(agentStats)) {
    const as = agentStats[agent]
    const completed = as.successful + as.failed
    as.avg_duration_seconds = completed > 0
      ? tasks.filter((t) => t.agent === agent && t.duration_seconds).reduce((a, t) => a + (t.duration_seconds ?? 0), 0) / completed
      : 0
  }

  const data = {
    total_tasks: tasks.length,
    by_repo: repoStats,
    by_agent: agentStats,
    total_cost_usd: tasks.reduce((a, t) => a + (t.cost_usd ?? 0), 0),
    exported_at: new Date().toISOString(),
  }

  if (format === 'csv') {
    // Flatten for CSV
    const rows = Object.entries(repoStats).map(([repo, stats]) => ({
      repo,
      ...stats,
    }))

    const csv = generateCSV(rows)

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="stats_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  return c.json(data)
})

// =============================================================================
// Helper: Generate CSV from array of objects
// =============================================================================
function generateCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) {
    return ''
  }

  // Get all unique keys from all objects
  const keys = [...new Set(data.flatMap((obj) => Object.keys(obj)))]

  // Generate header row
  const header = keys.map(escapeCSV).join(',')

  // Generate data rows
  const rows = data.map((obj) =>
    keys.map((key) => escapeCSV(obj[key])).join(',')
  )

  return [header, ...rows].join('\n')
}

// =============================================================================
// Helper: Escape CSV value
// =============================================================================
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)

  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

export default app

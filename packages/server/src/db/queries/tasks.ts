import { eq, desc, asc, and, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'
import { serializeJsonColumn, buildWhere } from '../serialize'

// ============================================================================
// Types
// ============================================================================

export interface TaskCreateInput {
  title: string
  repo_path: string
  prompt?: string
  agent?: string
  model?: string
  depends_on?: string[]
  timeout_seconds?: number
  skills?: string[]
}

export interface TaskUpdateInput {
  status?: string
  agent?: string
  model?: string
  provider?: string
  prompt?: string
  result?: string | null
  parsed_result?: object
  error?: string | null
  error_details?: object
  sequenced?: boolean
  depends_on?: string[]
  skills?: string[]
  cost_usd?: number | null
  duration_seconds?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
  started_at?: string | null
  completed_at?: string | null
  shepherd_evaluated_at?: string
  armory_reviewed_at?: string
  retry_context?: string | null
  spec_context?: string | null
  worktree_path?: string | null
  branch_name?: string | null
  github_pr_number?: number | null
  github_pr_url?: string | null
}

// ============================================================================
// CRUD
// ============================================================================

export async function getTasks(options?: {
  status?: string
  repo_path?: string
  limit?: number
  sequenced?: boolean
}) {
  const { status, repo_path, limit = 50, sequenced } = options ?? {}

  const where = buildWhere(
    status ? eq(schema.tasks.status, status) : undefined,
    repo_path ? eq(schema.tasks.repo_path, repo_path) : undefined,
    sequenced !== undefined ? eq(schema.tasks.sequenced, sequenced) : undefined,
  )

  if (where) {
    return db.select().from(schema.tasks)
      .where(where)
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  return db.select().from(schema.tasks)
    .orderBy(desc(schema.tasks.created_at))
    .limit(limit)
}

export async function getTasksPaginated(options?: {
  status?: string
  repo_path?: string
  sequenced?: boolean
  limit?: number
  offset?: number
}): Promise<{ tasks: (typeof schema.tasks.$inferSelect)[]; total: number }> {
  const { status, repo_path, sequenced, limit = 50, offset = 0 } = options ?? {}

  const where = buildWhere(
    status ? eq(schema.tasks.status, status) : undefined,
    repo_path ? eq(schema.tasks.repo_path, repo_path) : undefined,
    sequenced !== undefined ? eq(schema.tasks.sequenced, sequenced) : undefined,
  )

  const [tasks, countResult] = await Promise.all([
    where
      ? db.select().from(schema.tasks).where(where).orderBy(desc(schema.tasks.created_at)).limit(limit).offset(offset)
      : db.select().from(schema.tasks).orderBy(desc(schema.tasks.created_at)).limit(limit).offset(offset),
    where
      ? db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks).where(where)
      : db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks),
  ])

  return { tasks, total: Number(countResult[0]?.count ?? 0) }
}

export async function getTask(id: string) {
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  return rows[0] ?? null
}

export async function createTask(input: TaskCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const task = {
    id,
    title: input.title,
    status: 'pending',
    agent: input.agent ?? null,
    model: input.model ?? null,
    repo_path: input.repo_path,
    prompt: input.prompt ?? null,
    depends_on: JSON.stringify(input.depends_on ?? []),
    skills: JSON.stringify(input.skills ?? []),
    sequenced: true,
    timeout_seconds: input.timeout_seconds ?? null,
    created_at: now,
  }

  await db.insert(schema.tasks).values(task)
  return task
}

export async function updateTask(id: string, input: TaskUpdateInput) {
  const updates: Record<string, unknown> = {}

  if (input.status !== undefined) updates.status = input.status
  if (input.agent !== undefined) updates.agent = input.agent
  if (input.model !== undefined) updates.model = input.model
  if (input.provider !== undefined) updates.provider = input.provider
  if (input.prompt !== undefined) updates.prompt = input.prompt
  if (input.result !== undefined) updates.result = input.result
  if (input.error !== undefined) updates.error = input.error
  if (input.sequenced !== undefined) updates.sequenced = input.sequenced
  if (input.cost_usd !== undefined) updates.cost_usd = input.cost_usd
  if (input.duration_seconds !== undefined) updates.duration_seconds = input.duration_seconds
  if (input.input_tokens !== undefined) updates.input_tokens = input.input_tokens
  if (input.output_tokens !== undefined) updates.output_tokens = input.output_tokens
  if (input.started_at !== undefined) updates.started_at = input.started_at
  if (input.completed_at !== undefined) updates.completed_at = input.completed_at
  if (input.shepherd_evaluated_at !== undefined) updates.shepherd_evaluated_at = input.shepherd_evaluated_at
  if (input.armory_reviewed_at !== undefined) updates.armory_reviewed_at = input.armory_reviewed_at
  if (input.depends_on !== undefined) updates.depends_on = JSON.stringify(input.depends_on)
  if (input.skills !== undefined) updates.skills = JSON.stringify(input.skills)
  if (input.parsed_result !== undefined) updates.parsed_result = JSON.stringify(input.parsed_result)
  if (input.error_details !== undefined) updates.error_details = JSON.stringify(input.error_details)
  if (input.retry_context !== undefined) updates.retry_context = input.retry_context
  if (input.spec_context !== undefined) updates.spec_context = input.spec_context
  if (input.worktree_path !== undefined) updates.worktree_path = input.worktree_path
  if (input.branch_name !== undefined) updates.branch_name = input.branch_name
  if (input.github_pr_number !== undefined) updates.github_pr_number = input.github_pr_number
  if (input.github_pr_url !== undefined) updates.github_pr_url = input.github_pr_url

  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, id))

  return getTask(id)
}

export async function deleteTask(id: string) {
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
}

// ============================================================================
// Specialized queries
// ============================================================================

export async function getReadyTasks(limit = 10) {
  const pendingTasks = await db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.status, 'pending'),
      eq(schema.tasks.sequenced, true)
    ))
    .limit(limit * 2)

  const allDepIds = new Set<string>()
  const taskDeps = new Map<string, string[]>()

  for (const task of pendingTasks) {
    const deps = JSON.parse(task.depends_on ?? '[]') as string[]
    taskDeps.set(task.id, deps)
    for (const depId of deps) {
      allDepIds.add(depId)
    }
  }

  const depTaskMap = new Map<string, { status: string }>()
  if (allDepIds.size > 0) {
    const depTasks = await db.select({ id: schema.tasks.id, status: schema.tasks.status })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, Array.from(allDepIds)))
    for (const dt of depTasks) {
      depTaskMap.set(dt.id, dt)
    }
  }

  const ready: typeof pendingTasks = []

  for (const task of pendingTasks) {
    const deps = taskDeps.get(task.id) ?? []

    if (deps.length === 0) {
      ready.push(task)
      if (ready.length >= limit) break
      continue
    }

    const allDone = deps.every((depId) => depTaskMap.get(depId)?.status === 'done')
    if (allDone) {
      ready.push(task)
      if (ready.length >= limit) break
    }
  }

  return ready
}

export async function getTasksByIds(ids: string[]) {
  if (ids.length === 0) return []
  return db.select().from(schema.tasks).where(inArray(schema.tasks.id, ids))
}

export async function getTasksByRepo(repo_path: string, options?: { status?: string; limit?: number }) {
  const { status, limit = 50 } = options ?? {}

  const where = buildWhere(
    eq(schema.tasks.repo_path, repo_path),
    status ? eq(schema.tasks.status, status) : undefined,
  )

  return db.select().from(schema.tasks)
    .where(where!)
    .orderBy(desc(schema.tasks.created_at))
    .limit(limit)
}

export async function getUnevaluatedTasks(repo_path?: string, limit = 50) {
  const where = buildWhere(
    eq(schema.tasks.status, 'done'),
    isNull(schema.tasks.shepherd_evaluated_at),
    repo_path ? eq(schema.tasks.repo_path, repo_path) : undefined,
  )

  return db.select().from(schema.tasks)
    .where(where!)
    .orderBy(asc(schema.tasks.completed_at))
    .limit(limit)
}

export async function getUnreviewedTasks(limit = 50) {
  return db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.status, 'done'),
      isNull(schema.tasks.armory_reviewed_at)
    ))
    .orderBy(desc(schema.tasks.completed_at))
    .limit(limit)
}

// ============================================================================
// Stats
// ============================================================================

export async function getTaskStats() {
  const rows = await db.select({
    status: schema.tasks.status,
    count: sql<number>`COUNT(*)`,
    total_cost: sql<number>`COALESCE(SUM(${schema.tasks.cost_usd}), 0)`,
    total_input: sql<number>`COALESCE(SUM(${schema.tasks.input_tokens}), 0)`,
    total_output: sql<number>`COALESCE(SUM(${schema.tasks.output_tokens}), 0)`,
    duration_sum: sql<number>`COALESCE(SUM(${schema.tasks.duration_seconds}), 0)`,
    duration_count: sql<number>`COUNT(${schema.tasks.duration_seconds})`,
  }).from(schema.tasks).groupBy(schema.tasks.status)

  const stats = {
    total: 0,
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
    total_cost_usd: 0,
    avg_duration_seconds: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
  }

  let durationSum = 0
  let durationCount = 0

  for (const row of rows) {
    const count = Number(row.count)
    stats.total += count

    if (row.status === 'pending') stats.pending = count
    else if (row.status === 'running') stats.running = count
    else if (row.status === 'done') stats.done = count
    else if (row.status === 'failed') stats.failed = count
    else if (row.status === 'cancelled') stats.cancelled = count

    stats.total_cost_usd += Number(row.total_cost)
    stats.total_input_tokens += Number(row.total_input)
    stats.total_output_tokens += Number(row.total_output)

    durationSum += Number(row.duration_sum)
    durationCount += Number(row.duration_count)
  }

  if (durationCount > 0) {
    stats.avg_duration_seconds = durationSum / durationCount
  }

  return stats
}

export async function getTaskDistributionByAgent(): Promise<Record<string, { total: number; done: number; failed: number; pending: number; running: number }>> {
  const rows = await db.select({
    agent: schema.tasks.agent,
    status: schema.tasks.status,
    count: sql<number>`COUNT(*)`,
  }).from(schema.tasks).groupBy(schema.tasks.agent, schema.tasks.status)

  const dist: Record<string, { total: number; done: number; failed: number; pending: number; running: number }> = {}

  for (const row of rows) {
    const agent = row.agent ?? 'claude'
    const count = Number(row.count)
    if (!dist[agent]) {
      dist[agent] = { total: 0, done: 0, failed: 0, pending: 0, running: 0 }
    }
    dist[agent].total += count
    if (row.status === 'done') dist[agent].done += count
    else if (row.status === 'failed') dist[agent].failed += count
    else if (row.status === 'pending') dist[agent].pending += count
    else if (row.status === 'running') dist[agent].running += count
  }

  return dist
}

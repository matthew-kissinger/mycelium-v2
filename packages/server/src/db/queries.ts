import { eq, desc, asc, and, inArray, isNull, ne, sql, lt } from 'drizzle-orm'
import { db } from './index'
import * as schema from './schema'

// ============================================================================
// Tasks
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

export async function getTasks(options?: {
  status?: string
  repo_path?: string
  limit?: number
  sequenced?: boolean
}) {
  const { status, repo_path, limit = 50, sequenced } = options ?? {}

  let query = db.select().from(schema.tasks).orderBy(desc(schema.tasks.created_at))

  if (status && repo_path && sequenced !== undefined) {
    return db.select().from(schema.tasks)
      .where(and(
        eq(schema.tasks.status, status),
        eq(schema.tasks.repo_path, repo_path),
        eq(schema.tasks.sequenced, sequenced)
      ))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  if (status && repo_path) {
    return db.select().from(schema.tasks)
      .where(and(
        eq(schema.tasks.status, status),
        eq(schema.tasks.repo_path, repo_path)
      ))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  if (status) {
    return db.select().from(schema.tasks)
      .where(eq(schema.tasks.status, status))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  if (repo_path) {
    return db.select().from(schema.tasks)
      .where(eq(schema.tasks.repo_path, repo_path))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  if (sequenced !== undefined) {
    return db.select().from(schema.tasks)
      .where(eq(schema.tasks.sequenced, sequenced))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  return query.limit(limit)
}

/**
 * Get paginated tasks with a separate count query.
 * Uses SQL LIMIT/OFFSET instead of loading all rows.
 */
export async function getTasksPaginated(options?: {
  status?: string
  repo_path?: string
  sequenced?: boolean
  limit?: number
  offset?: number
}): Promise<{ tasks: (typeof schema.tasks.$inferSelect)[]; total: number }> {
  const { status, repo_path, sequenced, limit = 50, offset = 0 } = options ?? {}

  // Build conditions
  const conditions = []
  if (status) conditions.push(eq(schema.tasks.status, status))
  if (repo_path) conditions.push(eq(schema.tasks.repo_path, repo_path))
  if (sequenced !== undefined) conditions.push(eq(schema.tasks.sequenced, sequenced))

  const where = conditions.length > 0
    ? conditions.length === 1 ? conditions[0] : and(...conditions)
    : undefined

  // Run data query and count query in parallel
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

/**
 * Get tasks that are ready to run:
 * - Status is 'pending'
 * - Has been sequenced (sequenced = true)
 * - All dependencies are 'done'
 */
export async function getReadyTasks(limit = 10) {
  // Get pending, sequenced tasks
  const pendingTasks = await db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.status, 'pending'),
      eq(schema.tasks.sequenced, true)
    ))
    .limit(limit * 2) // Fetch more since we'll filter

  // Collect all dependency IDs across all pending tasks
  const allDepIds = new Set<string>()
  const taskDeps = new Map<string, string[]>()

  for (const task of pendingTasks) {
    const deps = JSON.parse(task.depends_on ?? '[]') as string[]
    taskDeps.set(task.id, deps)
    for (const depId of deps) {
      allDepIds.add(depId)
    }
  }

  // Batch-fetch all dependency tasks in a single query
  const depTaskMap = new Map<string, { status: string }>()
  if (allDepIds.size > 0) {
    const depTasks = await db.select({ id: schema.tasks.id, status: schema.tasks.status })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, Array.from(allDepIds)))
    for (const dt of depTasks) {
      depTaskMap.set(dt.id, dt)
    }
  }

  // Filter in memory
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

/**
 * Batch-fetch tasks by an array of IDs in a single query.
 */
export async function getTasksByIds(ids: string[]) {
  if (ids.length === 0) return []
  return db.select().from(schema.tasks).where(inArray(schema.tasks.id, ids))
}

export async function getTasksByRepo(repo_path: string, options?: { status?: string; limit?: number }) {
  const { status, limit = 50 } = options ?? {}

  if (status) {
    return db.select().from(schema.tasks)
      .where(and(
        eq(schema.tasks.repo_path, repo_path),
        eq(schema.tasks.status, status)
      ))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
  }

  return db.select().from(schema.tasks)
    .where(eq(schema.tasks.repo_path, repo_path))
    .orderBy(desc(schema.tasks.created_at))
    .limit(limit)
}

/**
 * Get tasks that haven't been evaluated by Shepherd
 */
export async function getUnevaluatedTasks(repo_path?: string, limit = 50) {
  if (repo_path) {
    return db.select().from(schema.tasks)
      .where(and(
        eq(schema.tasks.repo_path, repo_path),
        eq(schema.tasks.status, 'done'),
        isNull(schema.tasks.shepherd_evaluated_at)
      ))
      .orderBy(asc(schema.tasks.completed_at))
      .limit(limit)
  }

  return db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.status, 'done'),
      isNull(schema.tasks.shepherd_evaluated_at)
    ))
    .orderBy(asc(schema.tasks.completed_at))
    .limit(limit)
}

/**
 * Get tasks that haven't been reviewed by Armory
 */
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
// Repos
// ============================================================================

export interface RepoCreateInput {
  path: string
  name: string
  description?: string
  language?: string
  mode?: string
}

export interface RepoUpdateInput {
  description?: string
  language?: string
  mode?: string
  skills?: string[]
  last_scanned_at?: string
  github_owner?: string
  github_repo?: string
  github_default_branch?: string
  is_public?: number | null
}

export async function getRepos() {
  return db.select().from(schema.repos)
}

export async function getRepo(id: string) {
  const rows = await db.select().from(schema.repos).where(eq(schema.repos.id, id))
  return rows[0] ?? null
}

export async function getRepoByPath(path: string) {
  const rows = await db.select().from(schema.repos).where(eq(schema.repos.path, path))
  return rows[0] ?? null
}

export async function createRepo(input: RepoCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const repo = {
    id,
    path: input.path,
    name: input.name,
    description: input.description ?? null,
    language: input.language ?? null,
    mode: input.mode ?? 'align',
    created_at: now,
  }

  await db.insert(schema.repos).values(repo)
  return repo
}

export async function updateRepo(id: string, input: RepoUpdateInput) {
  const updates: Record<string, unknown> = {}

  if (input.description !== undefined) updates.description = input.description
  if (input.language !== undefined) updates.language = input.language
  if (input.mode !== undefined) updates.mode = input.mode
  if (input.skills !== undefined) updates.skills = JSON.stringify(input.skills)
  if (input.last_scanned_at !== undefined) updates.last_scanned_at = input.last_scanned_at
  if (input.github_owner !== undefined) updates.github_owner = input.github_owner
  if (input.github_repo !== undefined) updates.github_repo = input.github_repo
  if (input.github_default_branch !== undefined) updates.github_default_branch = input.github_default_branch
  if (input.is_public !== undefined) updates.is_public = input.is_public

  await db.update(schema.repos).set(updates).where(eq(schema.repos.id, id))

  return getRepo(id)
}

export async function deleteRepo(id: string) {
  await db.delete(schema.repos).where(eq(schema.repos.id, id))
}

// ============================================================================
// Signals
// ============================================================================

export interface SignalCreateInput {
  question: string
  options?: string[]
  task_id?: string
  repo_path?: string
}

export async function getSignals(options?: { status?: string; limit?: number }) {
  const { status, limit = 50 } = options ?? {}

  if (status) {
    return db.select().from(schema.signals)
      .where(eq(schema.signals.status, status))
      .orderBy(desc(schema.signals.created_at))
      .limit(limit)
  }

  return db.select().from(schema.signals)
    .orderBy(desc(schema.signals.created_at))
    .limit(limit)
}

export async function getSignal(id: string) {
  const rows = await db.select().from(schema.signals).where(eq(schema.signals.id, id))
  return rows[0] ?? null
}

export async function createSignal(input: SignalCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const signal = {
    id,
    question: input.question,
    options: input.options ? JSON.stringify(input.options) : null,
    status: 'pending',
    task_id: input.task_id ?? null,
    repo_path: input.repo_path ?? null,
    created_at: now,
  }

  await db.insert(schema.signals).values(signal)
  return signal
}

export async function respondToSignal(id: string, response: string) {
  const now = new Date().toISOString()

  await db.update(schema.signals).set({
    status: 'responded',
    response,
    responded_at: now,
  }).where(eq(schema.signals.id, id))

  return getSignal(id)
}

export async function getPendingSignals(limit = 50) {
  return db.select().from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))
    .orderBy(desc(schema.signals.created_at))
    .limit(limit)
}

/**
 * Parse signal for API response (deserialize JSON fields)
 */
export function parseSignal(signal: typeof schema.signals.$inferSelect) {
  return {
    ...signal,
    options: signal.options ? JSON.parse(signal.options) : null,
  }
}

// ============================================================================
// Memory Patterns
// ============================================================================

export interface PatternCreateInput {
  content: string
  source: string
  task_id?: string
  repo_path?: string
  tags?: string[]
}

export async function getPatterns(options?: { repo_path?: string; limit?: number }) {
  const { repo_path, limit = 100 } = options ?? {}

  if (repo_path) {
    return db.select().from(schema.memory_patterns)
      .where(eq(schema.memory_patterns.repo_path, repo_path))
      .orderBy(desc(schema.memory_patterns.created_at))
      .limit(limit)
  }

  return db.select().from(schema.memory_patterns)
    .orderBy(desc(schema.memory_patterns.created_at))
    .limit(limit)
}

export async function getGlobalPatterns(limit = 100) {
  return db.select().from(schema.memory_patterns)
    .where(isNull(schema.memory_patterns.repo_path))
    .orderBy(desc(schema.memory_patterns.created_at))
    .limit(limit)
}

export async function createPattern(input: PatternCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const pattern = {
    id,
    content: input.content,
    source: input.source,
    task_id: input.task_id ?? null,
    repo_path: input.repo_path ?? null,
    tags: JSON.stringify(input.tags ?? []),
    created_at: now,
  }

  await db.insert(schema.memory_patterns).values(pattern)
  return pattern
}

export async function deletePattern(id: string) {
  await db.delete(schema.memory_patterns).where(eq(schema.memory_patterns.id, id))
}

export async function updatePattern(id: string, updates: { content?: string; repo_path?: string | null; tags?: string[] }) {
  const updateData: Record<string, unknown> = {}
  if (updates.content !== undefined) updateData.content = updates.content
  if (updates.repo_path !== undefined) updateData.repo_path = updates.repo_path
  if (updates.tags !== undefined) updateData.tags = JSON.stringify(updates.tags)

  if (Object.keys(updateData).length > 0) {
    await db.update(schema.memory_patterns).set(updateData).where(eq(schema.memory_patterns.id, id))
  }
}

/**
 * Parse pattern for API response (deserialize JSON fields)
 */
export function parsePattern(pattern: typeof schema.memory_patterns.$inferSelect) {
  return {
    ...pattern,
    tags: JSON.parse(pattern.tags ?? '[]'),
  }
}

// ============================================================================
// Memory Warnings
// ============================================================================

export interface WarningCreateInput {
  content: string
  severity?: string
  task_id?: string
  repo_path?: string
}

export async function getWarnings(options?: { repo_path?: string; severity?: string; limit?: number }) {
  const { repo_path, severity, limit = 100 } = options ?? {}

  if (repo_path && severity) {
    return db.select().from(schema.memory_warnings)
      .where(and(
        eq(schema.memory_warnings.repo_path, repo_path),
        eq(schema.memory_warnings.severity, severity)
      ))
      .orderBy(desc(schema.memory_warnings.created_at))
      .limit(limit)
  }

  if (repo_path) {
    return db.select().from(schema.memory_warnings)
      .where(eq(schema.memory_warnings.repo_path, repo_path))
      .orderBy(desc(schema.memory_warnings.created_at))
      .limit(limit)
  }

  if (severity) {
    return db.select().from(schema.memory_warnings)
      .where(eq(schema.memory_warnings.severity, severity))
      .orderBy(desc(schema.memory_warnings.created_at))
      .limit(limit)
  }

  return db.select().from(schema.memory_warnings)
    .orderBy(desc(schema.memory_warnings.created_at))
    .limit(limit)
}

export async function getGlobalWarnings(limit = 100) {
  return db.select().from(schema.memory_warnings)
    .where(isNull(schema.memory_warnings.repo_path))
    .orderBy(desc(schema.memory_warnings.created_at))
    .limit(limit)
}

export async function createWarning(input: WarningCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const warning = {
    id,
    content: input.content,
    severity: input.severity ?? 'medium',
    task_id: input.task_id ?? null,
    repo_path: input.repo_path ?? null,
    created_at: now,
  }

  await db.insert(schema.memory_warnings).values(warning)
  return warning
}

export async function deleteWarning(id: string) {
  await db.delete(schema.memory_warnings).where(eq(schema.memory_warnings.id, id))
}

export async function updateWarning(id: string, updates: { content?: string; severity?: string }) {
  const updateData: Record<string, unknown> = {}
  if (updates.content !== undefined) updateData.content = updates.content
  if (updates.severity !== undefined) updateData.severity = updates.severity

  if (Object.keys(updateData).length > 0) {
    await db.update(schema.memory_warnings).set(updateData).where(eq(schema.memory_warnings.id, id))
  }
}

// Get all patterns (both global and repo-specific) with repo info
export async function getAllPatterns(limit = 500) {
  return db.select().from(schema.memory_patterns)
    .orderBy(desc(schema.memory_patterns.created_at))
    .limit(limit)
}

// Get all warnings (both global and repo-specific) with repo info
export async function getAllWarnings(limit = 500) {
  return db.select().from(schema.memory_warnings)
    .orderBy(desc(schema.memory_warnings.created_at))
    .limit(limit)
}

// Get unique repo paths that have memory
export async function getReposWithMemory() {
  const patternRepos = await db.selectDistinct({ repo_path: schema.memory_patterns.repo_path })
    .from(schema.memory_patterns)
    .where(sql`${schema.memory_patterns.repo_path} IS NOT NULL`)

  const warningRepos = await db.selectDistinct({ repo_path: schema.memory_warnings.repo_path })
    .from(schema.memory_warnings)
    .where(sql`${schema.memory_warnings.repo_path} IS NOT NULL`)

  const allRepos = new Set<string>()
  for (const r of patternRepos) {
    if (r.repo_path) allRepos.add(r.repo_path)
  }
  for (const r of warningRepos) {
    if (r.repo_path) allRepos.add(r.repo_path)
  }

  return Array.from(allRepos).sort()
}

// ============================================================================
// System Agent Runs
// ============================================================================

export type SystemAgentType = 'discovery' | 'shepherd' | 'armory' | 'genesis' | 'digest' | 'compaction'
export type SystemAgentStatus = 'running' | 'completed' | 'failed' | 'blocked'

export interface SystemAgentRunCreateInput {
  agent_type: SystemAgentType
  repo_path?: string
  context?: object
}

export interface SystemAgentRunUpdateInput {
  status?: SystemAgentStatus
  output?: string
  error?: string
  completed_at?: string
}

export async function getRuns(options?: { agent_type?: string; status?: string; limit?: number }) {
  const { agent_type, status, limit = 50 } = options ?? {}

  if (agent_type && status) {
    return db.select().from(schema.system_agent_runs)
      .where(and(
        eq(schema.system_agent_runs.agent_type, agent_type),
        eq(schema.system_agent_runs.status, status)
      ))
      .orderBy(desc(schema.system_agent_runs.started_at))
      .limit(limit)
  }

  if (agent_type) {
    return db.select().from(schema.system_agent_runs)
      .where(eq(schema.system_agent_runs.agent_type, agent_type))
      .orderBy(desc(schema.system_agent_runs.started_at))
      .limit(limit)
  }

  if (status) {
    return db.select().from(schema.system_agent_runs)
      .where(eq(schema.system_agent_runs.status, status))
      .orderBy(desc(schema.system_agent_runs.started_at))
      .limit(limit)
  }

  return db.select().from(schema.system_agent_runs)
    .orderBy(desc(schema.system_agent_runs.started_at))
    .limit(limit)
}

export async function getRun(id: string) {
  const rows = await db.select().from(schema.system_agent_runs).where(eq(schema.system_agent_runs.id, id))
  return rows[0] ?? null
}

export async function createRun(input: SystemAgentRunCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const run = {
    id,
    agent_type: input.agent_type,
    status: 'running',
    repo_path: input.repo_path ?? null,
    context: input.context ? JSON.stringify(input.context) : null,
    started_at: now,
  }

  await db.insert(schema.system_agent_runs).values(run)
  return run
}

export async function updateRun(id: string, input: SystemAgentRunUpdateInput) {
  const updates: Record<string, unknown> = {}

  if (input.status !== undefined) updates.status = input.status
  if (input.output !== undefined) updates.output = input.output
  if (input.error !== undefined) updates.error = input.error
  if (input.completed_at !== undefined) updates.completed_at = input.completed_at

  await db.update(schema.system_agent_runs).set(updates).where(eq(schema.system_agent_runs.id, id))

  return getRun(id)
}

export async function completeRun(id: string, output?: string) {
  return updateRun(id, {
    status: 'completed',
    output,
    completed_at: new Date().toISOString(),
  })
}

export async function failRun(id: string, error: string) {
  return updateRun(id, {
    status: 'failed',
    error,
    completed_at: new Date().toISOString(),
  })
}

/**
 * Clean up orphaned system agent runs.
 * Marks runs that are 'running' but older than threshold as failed.
 * Called on startup and periodically by blocked check cycle.
 */
export async function cleanupOrphanedRuns(thresholdHours: number = 1): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()

  // Get all running system agent runs older than threshold
  const orphaned = await db.select()
    .from(schema.system_agent_runs)
    .where(and(
      eq(schema.system_agent_runs.status, 'running'),
      lt(schema.system_agent_runs.started_at, cutoff)
    ))

  let cleaned = 0
  for (const run of orphaned) {
    const age = ((Date.now() - new Date(run.started_at).getTime()) / 3600000).toFixed(1)
    console.log(`[Cleanup] Marking orphaned ${run.agent_type} run ${run.id.slice(0, 8)} as failed (${age}h old)`)

    await updateRun(run.id, {
      status: 'failed',
      error: `Orphaned - server restart or process died after ${age}h`,
      completed_at: new Date().toISOString(),
    })
    cleaned++
  }

  return cleaned
}

/**
 * Parse run for API response (deserialize JSON fields)
 */
export function parseRun(run: typeof schema.system_agent_runs.$inferSelect) {
  return {
    ...run,
    context: run.context ? JSON.parse(run.context) : null,
  }
}

// ============================================================================
// Shepherd Evaluations
// ============================================================================

export interface ShepherdEvaluationCreateInput {
  repo_path: string
  tasks_evaluated: string[]
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  concerns?: string[]
  wins?: string[]
  recommendation?: string
  global_patterns?: object[]
  global_warnings?: object[]
  branch_evaluations?: object[]
  raw_response?: string
}

export async function getShepherdEvaluations(options?: { repo_path?: string; limit?: number }) {
  const { repo_path, limit = 50 } = options ?? {}

  if (repo_path) {
    return db.select().from(schema.shepherd_evaluations)
      .where(eq(schema.shepherd_evaluations.repo_path, repo_path))
      .orderBy(desc(schema.shepherd_evaluations.evaluated_at))
      .limit(limit)
  }

  return db.select().from(schema.shepherd_evaluations)
    .orderBy(desc(schema.shepherd_evaluations.evaluated_at))
    .limit(limit)
}

export async function getShepherdEvaluation(id: string) {
  const rows = await db.select().from(schema.shepherd_evaluations).where(eq(schema.shepherd_evaluations.id, id))
  return rows[0] ?? null
}

export async function createShepherdEvaluation(input: ShepherdEvaluationCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const evaluation = {
    id,
    repo_path: input.repo_path,
    evaluated_at: now,
    tasks_evaluated: JSON.stringify(input.tasks_evaluated),
    health: input.health,
    headline: input.headline,
    concerns: input.concerns ? JSON.stringify(input.concerns) : null,
    wins: input.wins ? JSON.stringify(input.wins) : null,
    recommendation: input.recommendation ?? null,
    global_patterns: input.global_patterns ? JSON.stringify(input.global_patterns) : null,
    global_warnings: input.global_warnings ? JSON.stringify(input.global_warnings) : null,
    branch_evaluations: input.branch_evaluations ? JSON.stringify(input.branch_evaluations) : null,
    raw_response: input.raw_response ?? null,
  }

  await db.insert(schema.shepherd_evaluations).values(evaluation)
  return evaluation
}

/**
 * Parse shepherd evaluation for API response (deserialize JSON fields)
 */
export function parseShepherdEvaluation(evaluation: typeof schema.shepherd_evaluations.$inferSelect) {
  return {
    ...evaluation,
    tasks_evaluated: JSON.parse(evaluation.tasks_evaluated),
    concerns: evaluation.concerns ? JSON.parse(evaluation.concerns) : null,
    wins: evaluation.wins ? JSON.parse(evaluation.wins) : null,
    global_patterns: evaluation.global_patterns ? JSON.parse(evaluation.global_patterns) : null,
    global_warnings: evaluation.global_warnings ? JSON.parse(evaluation.global_warnings) : null,
    branch_evaluations: evaluation.branch_evaluations ? JSON.parse(evaluation.branch_evaluations) : null,
  }
}

// ============================================================================
// Stats
// ============================================================================

export async function getTaskStats() {
  // Use SQL aggregation instead of loading all tasks into memory
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

/**
 * Get task distribution by agent (counts per agent across all tasks).
 * Returns map of agent -> { total, done, failed, pending, running }.
 */
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

// ============================================================================
// Devices
// ============================================================================

export interface DeviceCreateInput {
  name: string
  type: string
  host: string
  port?: number
  protocol?: string
  config?: Record<string, unknown>
  description?: string
}

export interface DeviceUpdateInput {
  name?: string
  host?: string
  port?: number
  protocol?: string
  config?: Record<string, unknown>
  description?: string
  status?: string
  last_seen?: string
  last_error?: string
  response_time_ms?: number
}

export async function getDevices(options?: { type?: string; status?: string }) {
  const { type, status } = options ?? {}

  if (type && status) {
    return db.select().from(schema.devices)
      .where(and(
        eq(schema.devices.type, type),
        eq(schema.devices.status, status)
      ))
      .orderBy(schema.devices.name)
  }

  if (type) {
    return db.select().from(schema.devices)
      .where(eq(schema.devices.type, type))
      .orderBy(schema.devices.name)
  }

  if (status) {
    return db.select().from(schema.devices)
      .where(eq(schema.devices.status, status))
      .orderBy(schema.devices.name)
  }

  return db.select().from(schema.devices).orderBy(schema.devices.name)
}

export async function getDevice(id: string) {
  const rows = await db.select().from(schema.devices).where(eq(schema.devices.id, id))
  return rows[0] ?? null
}

export async function getDeviceByName(name: string) {
  const rows = await db.select().from(schema.devices).where(eq(schema.devices.name, name))
  return rows[0] ?? null
}

export async function createDevice(input: DeviceCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const device = {
    id,
    name: input.name,
    type: input.type,
    host: input.host,
    port: input.port ?? null,
    protocol: input.protocol ?? 'http',
    config: input.config ? JSON.stringify(input.config) : null,
    description: input.description ?? null,
    status: 'unknown',
    created_at: now,
  }

  await db.insert(schema.devices).values(device)
  return device
}

export async function updateDevice(id: string, input: DeviceUpdateInput) {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.name !== undefined) updates.name = input.name
  if (input.host !== undefined) updates.host = input.host
  if (input.port !== undefined) updates.port = input.port
  if (input.protocol !== undefined) updates.protocol = input.protocol
  if (input.description !== undefined) updates.description = input.description
  if (input.status !== undefined) updates.status = input.status
  if (input.last_seen !== undefined) updates.last_seen = input.last_seen
  if (input.last_error !== undefined) updates.last_error = input.last_error
  if (input.response_time_ms !== undefined) updates.response_time_ms = input.response_time_ms
  if (input.config !== undefined) updates.config = JSON.stringify(input.config)

  await db.update(schema.devices).set(updates).where(eq(schema.devices.id, id))

  return getDevice(id)
}

export async function deleteDevice(id: string) {
  await db.delete(schema.devices).where(eq(schema.devices.id, id))
}

/**
 * Parse device for API response (deserialize JSON fields)
 */
export function parseDevice(device: typeof schema.devices.$inferSelect) {
  return {
    ...device,
    config: device.config ? JSON.parse(device.config) : null,
  }
}

// ============================================================================
// Fruiting Sessions
// ============================================================================

export interface FruitingSessionCreateInput {
  task_id: string
  repo_path: string
  agent?: string
  model?: string
  context_trace?: object
  full_prompt?: string
  session_log?: Array<{ chunk: string; stream: string; timestamp: string }>
}

export async function createFruitingSession(input: FruitingSessionCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const session = {
    id,
    task_id: input.task_id,
    repo_path: input.repo_path,
    agent: input.agent ?? null,
    model: input.model ?? null,
    context_trace: input.context_trace ? JSON.stringify(input.context_trace) : null,
    full_prompt: input.full_prompt ?? null,
    session_log: input.session_log ? JSON.stringify(input.session_log) : null,
    created_at: now,
  }

  await db.insert(schema.fruiting_sessions).values(session)
  return session
}

/**
 * Clear session_log for sessions older than the TTL.
 * Keeps the session record but nulls out the log data.
 */
export async function cleanExpiredSessionLogs(ttlMs = 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - ttlMs).toISOString()

  const result = await db.update(schema.fruiting_sessions)
    .set({ session_log: null })
    .where(and(
      sql`${schema.fruiting_sessions.created_at} < ${cutoff}`,
      sql`${schema.fruiting_sessions.session_log} IS NOT NULL`
    ))

  return result
}

export async function getFruitingSessionsByTask(taskId: string) {
  return db.select().from(schema.fruiting_sessions)
    .where(eq(schema.fruiting_sessions.task_id, taskId))
    .orderBy(desc(schema.fruiting_sessions.created_at))
}

/**
 * Get devices that need health check (not checked recently or unknown status)
 */
export async function getDevicesForHealthCheck(maxAgeMs = 60000) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString()

  // Get devices that haven't been seen recently or have unknown status
  return db.select().from(schema.devices)
    .where(sql`${schema.devices.last_seen} IS NULL OR ${schema.devices.last_seen} < ${cutoff} OR ${schema.devices.status} = 'unknown'`)
    .orderBy(schema.devices.name)
}

// ============================================================================
// Scheduler Stats
// ============================================================================

export interface SchedulerCycleStats {
  cycle_name: string
  runs_completed: number
  errors: number
  last_run_at: string | null
  last_duration_ms: number | null
  last_error: string | null
  updated_at: string | null
}

/**
 * Upsert scheduler cycle stats after a cycle completes.
 * Increments runs_completed or errors counter and records timing.
 */
export async function upsertSchedulerStats(
  cycleName: string,
  success: boolean,
  durationMs: number,
  error?: string
): Promise<void> {
  const now = new Date().toISOString()

  // Try insert first, then update on conflict
  const existing = await db.select().from(schema.scheduler_stats)
    .where(eq(schema.scheduler_stats.cycle_name, cycleName))

  if (existing.length === 0) {
    await db.insert(schema.scheduler_stats).values({
      cycle_name: cycleName,
      runs_completed: success ? 1 : 0,
      errors: success ? 0 : 1,
      last_run_at: now,
      last_duration_ms: durationMs,
      last_error: error ?? null,
      updated_at: now,
    })
  } else {
    const current = existing[0]
    await db.update(schema.scheduler_stats)
      .set({
        runs_completed: (current.runs_completed ?? 0) + (success ? 1 : 0),
        errors: (current.errors ?? 0) + (success ? 0 : 1),
        last_run_at: now,
        last_duration_ms: durationMs,
        last_error: error ?? current.last_error,
        updated_at: now,
      })
      .where(eq(schema.scheduler_stats.cycle_name, cycleName))
  }
}

/**
 * Get all scheduler cycle stats from database.
 */
export async function getSchedulerStats(): Promise<SchedulerCycleStats[]> {
  return db.select().from(schema.scheduler_stats)
}

/**
 * Get scheduler stats for a specific cycle.
 */
export async function getSchedulerStatsForCycle(cycleName: string): Promise<SchedulerCycleStats | null> {
  const rows = await db.select().from(schema.scheduler_stats)
    .where(eq(schema.scheduler_stats.cycle_name, cycleName))
  return rows[0] ?? null
}

// ============================================================================
// Data Cleanup
// ============================================================================

/**
 * Clear full_prompt for fruiting sessions older than the retention period.
 * Keeps context_trace (small JSON) but drops the large prompt text.
 * Default retention: 7 days.
 */
export async function cleanExpiredSessionPrompts(retentionDays = 7) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

  return db.update(schema.fruiting_sessions)
    .set({ full_prompt: null })
    .where(and(
      sql`${schema.fruiting_sessions.created_at} < ${cutoff}`,
      sql`${schema.fruiting_sessions.full_prompt} IS NOT NULL`
    ))
}

/**
 * Delete config_history entries older than retention period.
 * Keeps at most maxEntries total.
 * Default retention: 90 days, max 1000 entries.
 */
export async function pruneConfigHistory(retentionDays = 90, maxEntries = 1000): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

  // Delete entries older than retention period
  await db.delete(schema.config_history)
    .where(lt(schema.config_history.changed_at, cutoff))

  // If still over max entries, delete oldest beyond the limit
  const allEntries = await db.select({ id: schema.config_history.id })
    .from(schema.config_history)
    .orderBy(desc(schema.config_history.changed_at))

  if (allEntries.length > maxEntries) {
    const toDelete = allEntries.slice(maxEntries).map(e => e.id)
    if (toDelete.length > 0) {
      await db.delete(schema.config_history)
        .where(inArray(schema.config_history.id, toDelete))
    }
    return toDelete.length
  }

  return 0
}

/**
 * Prune old failed and cancelled tasks.
 * Keeps at least keepRecent of each status.
 * Default: delete tasks older than 30 days, keep 50 recent of each status.
 */
export async function pruneFailedAndCancelledTasks(retentionDays = 30, keepRecent = 50): Promise<number> {
  let pruned = 0

  for (const status of ['failed', 'cancelled'] as const) {
    const tasks = await db.select({ id: schema.tasks.id, completed_at: schema.tasks.completed_at, created_at: schema.tasks.created_at })
      .from(schema.tasks)
      .where(eq(schema.tasks.status, status))
      .orderBy(desc(schema.tasks.completed_at))

    if (tasks.length <= keepRecent) continue

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

    // Only delete tasks beyond keepRecent AND older than retention
    const candidates = tasks.slice(keepRecent)
    const toDelete = candidates.filter(t => {
      const time = t.completed_at ?? t.created_at
      return time < cutoff
    })

    if (toDelete.length > 0) {
      const ids = toDelete.map(t => t.id)
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids))
      pruned += ids.length
    }
  }

  return pruned
}

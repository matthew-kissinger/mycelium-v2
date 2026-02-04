import { eq, desc, asc, and, inArray, isNull, ne, sql } from 'drizzle-orm'
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
}

export interface TaskUpdateInput {
  status?: string
  agent?: string
  model?: string
  prompt?: string
  result?: string | null
  parsed_result?: object
  error?: string | null
  error_details?: object
  sequenced?: boolean
  depends_on?: string[]
  cost_usd?: number | null
  duration_seconds?: number | null
  started_at?: string | null
  completed_at?: string | null
  shepherd_evaluated_at?: string
  armory_reviewed_at?: string
  retry_context?: string | null
  spec_context?: string | null
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
    sequenced: false,
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
  if (input.prompt !== undefined) updates.prompt = input.prompt
  if (input.result !== undefined) updates.result = input.result
  if (input.error !== undefined) updates.error = input.error
  if (input.sequenced !== undefined) updates.sequenced = input.sequenced
  if (input.cost_usd !== undefined) updates.cost_usd = input.cost_usd
  if (input.duration_seconds !== undefined) updates.duration_seconds = input.duration_seconds
  if (input.started_at !== undefined) updates.started_at = input.started_at
  if (input.completed_at !== undefined) updates.completed_at = input.completed_at
  if (input.shepherd_evaluated_at !== undefined) updates.shepherd_evaluated_at = input.shepherd_evaluated_at
  if (input.armory_reviewed_at !== undefined) updates.armory_reviewed_at = input.armory_reviewed_at
  if (input.depends_on !== undefined) updates.depends_on = JSON.stringify(input.depends_on)
  if (input.parsed_result !== undefined) updates.parsed_result = JSON.stringify(input.parsed_result)
  if (input.error_details !== undefined) updates.error_details = JSON.stringify(input.error_details)
  if (input.retry_context !== undefined) updates.retry_context = input.retry_context
  if (input.spec_context !== undefined) updates.spec_context = input.spec_context

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

  const ready: typeof pendingTasks = []

  for (const task of pendingTasks) {
    const deps = JSON.parse(task.depends_on ?? '[]') as string[]

    if (deps.length === 0) {
      ready.push(task)
      if (ready.length >= limit) break
      continue
    }

    // Check if all dependencies are done
    const depTasks = await db.select().from(schema.tasks).where(inArray(schema.tasks.id, deps))
    const allDone = depTasks.every((t) => t.status === 'done')

    if (allDone) {
      ready.push(task)
      if (ready.length >= limit) break
    }
  }

  return ready
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

/**
 * Get unsequenced tasks (pending tasks that haven't gone through Sequencer)
 */
export async function getUnsequencedTasks(limit = 50) {
  return db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.status, 'pending'),
      eq(schema.tasks.sequenced, false)
    ))
    .orderBy(desc(schema.tasks.created_at))
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
  last_scanned_at?: string
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
  if (input.last_scanned_at !== undefined) updates.last_scanned_at = input.last_scanned_at

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

export type SystemAgentType = 'discovery' | 'sequencer' | 'shepherd' | 'armory' | 'genesis' | 'digest' | 'compaction'
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
  const allTasks = await db.select().from(schema.tasks)

  const stats = {
    total: allTasks.length,
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
    total_cost_usd: 0,
    avg_duration_seconds: 0,
  }

  let durationSum = 0
  let durationCount = 0

  for (const task of allTasks) {
    if (task.status === 'pending') stats.pending++
    else if (task.status === 'running') stats.running++
    else if (task.status === 'done') stats.done++
    else if (task.status === 'failed') stats.failed++
    else if (task.status === 'cancelled') stats.cancelled++

    stats.total_cost_usd += task.cost_usd ?? 0

    if (task.duration_seconds) {
      durationSum += task.duration_seconds
      durationCount++
    }
  }

  if (durationCount > 0) {
    stats.avg_duration_seconds = durationSum / durationCount
  }

  return stats
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

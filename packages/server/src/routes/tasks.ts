import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, desc, inArray, and } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../db'
import {
  TaskCreate,
  TaskUpdate,
  TaskStatus,
  TaskListParams,
  TaskCreateRequest,
  TaskUpdateRequest,
  TaskRunRequest,
} from '@mycelium/shared'
import { dispatch, killProcess, clearDependencies } from '../agents'
import { broadcast } from '../sse'
import * as queries from '../db/queries'
import { startTaskLog, appendLog, completeTaskLog, getTaskLogs, getLogBufferStats } from '../logs'

const app = new Hono()

// Track abort controllers for task cancellation
// Note: Process management is now handled by the registry
const runningTasks = new Map<string, AbortController>()

// =============================================================================
// GET /api/tasks - List tasks with filters
// =============================================================================
app.get('/', async (c) => {
  const status = c.req.query('status')
  const repo_path = c.req.query('repo_path')
  const limit = parseInt(c.req.query('limit') ?? '50')
  const offset = parseInt(c.req.query('offset') ?? '0')
  const sequenced = c.req.query('sequenced')

  // Use query functions from queries.ts
  const tasks = await queries.getTasks({
    status: status ?? undefined,
    repo_path: repo_path ?? undefined,
    limit: 1000, // Get all for total count, then paginate
    sequenced: sequenced !== undefined ? sequenced === 'true' : undefined,
  })

  // Apply offset and limit for pagination
  const paginatedTasks = tasks.slice(offset, offset + limit)

  return c.json({
    tasks: paginatedTasks.map(parseTask),
    total: tasks.length,
  })
})

// =============================================================================
// GET /api/tasks/graph - Return dependency graph
// =============================================================================
app.get('/graph', async (c) => {
  const repo_path = c.req.query('repo_path')
  const status = c.req.query('status')

  // Get tasks based on filters
  let tasks
  if (repo_path) {
    tasks = await queries.getTasksByRepo(repo_path, { status: status ?? undefined })
  } else if (status) {
    tasks = await queries.getTasks({ status })
  } else {
    tasks = await queries.getTasks({ limit: 200 })
  }

  // Build graph nodes with dependency information
  const nodes = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    repo_path: task.repo_path,
    agent: task.agent,
    sequenced: task.sequenced,
    depends_on: JSON.parse(task.depends_on ?? '[]') as string[],
    created_at: task.created_at,
  }))

  // Build edges for visualization
  const edges: Array<{ source: string; target: string }> = []
  for (const node of nodes) {
    for (const depId of node.depends_on) {
      edges.push({ source: depId, target: node.id })
    }
  }

  return c.json({ nodes, edges })
})

// =============================================================================
// GET /api/tasks/:id - Get single task with parsed JSON fields
// =============================================================================
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const task = await queries.getTask(id)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  return c.json({ task: parseTask(task) })
})

// =============================================================================
// GET /api/tasks/:id/context - Get assembled context for task
// =============================================================================
app.get('/:id/context', async (c) => {
  const id = c.req.param('id')
  const task = await queries.getTask(id)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  // Assemble context from various sources
  const context: Record<string, unknown> = {
    task: parseTask(task),
  }

  // Get repo info if available
  if (task.repo_path) {
    const repo = await queries.getRepoByPath(task.repo_path)
    if (repo) {
      context.repo = repo
    }

    // Get memory patterns for this repo
    const patterns = await queries.getPatterns({ repo_path: task.repo_path, limit: 20 })
    context.patterns = patterns.map(queries.parsePattern)

    // Get warnings for this repo
    const warnings = await queries.getWarnings({ repo_path: task.repo_path, limit: 10 })
    context.warnings = warnings

    // Get recent shepherd evaluations
    const evaluations = await queries.getShepherdEvaluations({ repo_path: task.repo_path, limit: 3 })
    context.evaluations = evaluations.map(queries.parseShepherdEvaluation)

    // Get other tasks in this repo for context
    const repoTasks = await queries.getTasksByRepo(task.repo_path, { limit: 10 })
    context.related_tasks = repoTasks
      .filter((t) => t.id !== task.id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        agent: t.agent,
      }))
  }

  // Get dependency info
  const deps = JSON.parse(task.depends_on ?? '[]') as string[]
  if (deps.length > 0) {
    const depTasks = await Promise.all(deps.map((depId) => queries.getTask(depId)))
    context.dependencies = depTasks.filter(Boolean).map((t) => ({
      id: t!.id,
      title: t!.title,
      status: t!.status,
      result: t!.result,
    }))
  }

  // Get global patterns
  const globalPatterns = await queries.getGlobalPatterns(10)
  context.global_patterns = globalPatterns.map(queries.parsePattern)

  return c.json(context)
})

// =============================================================================
// GET /api/tasks/:id/logs - Get task output logs
// =============================================================================
app.get('/:id/logs', async (c) => {
  const id = c.req.param('id')
  const since = c.req.query('since')
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined

  // First check if task exists
  const task = await queries.getTask(id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  // Get logs from buffer
  const logs = getTaskLogs(id, since ?? undefined, limit)

  // If no logs in buffer but task has result/error, provide that
  if (!logs.found && (task.result || task.error)) {
    return c.json({
      task_id: id,
      entries: [{
        chunk: task.result || task.error || '',
        timestamp: task.completed_at || task.started_at || task.created_at,
        stream: task.error ? 'stderr' : 'stdout',
      }],
      started_at: task.started_at,
      completed_at: task.completed_at,
      status: task.status,
      from_result: true,
    })
  }

  return c.json({
    task_id: id,
    entries: logs.entries,
    started_at: logs.started_at || task.started_at,
    completed_at: logs.completed_at || task.completed_at,
    status: task.status,
    from_result: false,
  })
})

// =============================================================================
// GET /api/tasks/logs/stats - Get log buffer statistics
// =============================================================================
app.get('/logs/stats', async (c) => {
  const stats = getLogBufferStats()
  return c.json(stats)
})

// =============================================================================
// POST /api/tasks - Create task with dependency resolution
// =============================================================================
app.post('/', zValidator('json', TaskCreate), async (c) => {
  const data = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // Resolve short dependency IDs to full UUIDs
  const resolvedDeps = await resolveDependencyIds(data.depends_on ?? [])

  // Validate that all dependencies exist
  if (resolvedDeps.length > 0) {
    const depTasks = await Promise.all(resolvedDeps.map((depId) => queries.getTask(depId)))
    const missing = resolvedDeps.filter((_, i) => !depTasks[i])
    if (missing.length > 0) {
      return c.json({
        error: 'Some dependencies do not exist',
        missing: missing,
      }, 400)
    }
  }

  const task = {
    id,
    title: data.title,
    status: 'pending',
    agent: data.agent ?? null,
    model: data.model ?? null,
    provider: data.provider ?? null,
    repo_path: data.repo_path,
    prompt: data.prompt ?? null,
    depends_on: JSON.stringify(resolvedDeps),
    sequenced: false,
    created_at: now,
  }

  await db.insert(schema.tasks).values(task)

  const result = parseTask(task)
  broadcast('task:created', result)

  return c.json({ task: result }, 201)
})

// =============================================================================
// PATCH /api/tasks/:id - Update task (status, depends_on, etc.)
// =============================================================================
app.patch('/:id', zValidator('json', TaskUpdate), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  const existing = await queries.getTask(id)
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const updates: Record<string, unknown> = {}
  if (data.status !== undefined) updates.status = data.status
  if (data.agent !== undefined) updates.agent = data.agent
  if (data.model !== undefined) updates.model = data.model
  if (data.provider !== undefined) updates.provider = data.provider
  if (data.result !== undefined) updates.result = data.result
  if (data.error !== undefined) updates.error = data.error
  if (data.sequenced !== undefined) updates.sequenced = data.sequenced

  // Handle depends_on updates
  if (data.depends_on !== undefined) {
    const resolved = await resolveDependencyIds(data.depends_on)
    updates.depends_on = JSON.stringify(resolved)
  }

  // Handle clear_deps flag from API schema
  if ((data as any).clear_deps === true) {
    updates.depends_on = JSON.stringify([])
  }

  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, id))

  const updated = await queries.getTask(id)
  const result = parseTask(updated!)
  broadcast('task:updated', result)

  return c.json({ task: result })
})

// =============================================================================
// DELETE /api/tasks/:id - Delete task
// =============================================================================
app.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await queries.getTask(id)
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404)
  }

  // Don't delete running tasks
  if (existing.status === 'running') {
    return c.json({ error: 'Cannot delete running task. Cancel it first.' }, 400)
  }

  // Check if other tasks depend on this one
  const allTasks = await queries.getTasks({ limit: 1000 })
  const dependents = allTasks.filter((t) => {
    const deps = JSON.parse(t.depends_on ?? '[]') as string[]
    return deps.includes(id)
  })

  if (dependents.length > 0) {
    return c.json({
      error: 'Cannot delete task with dependents',
      dependents: dependents.map((t) => ({ id: t.id, title: t.title })),
    }, 400)
  }

  await queries.deleteTask(id)
  broadcast('task:deleted', { id })

  return c.json({ message: 'Task deleted', id })
})

// =============================================================================
// POST /api/tasks/:id/run - Execute task (use dispatch from agents/dispatch.ts)
// =============================================================================
app.post('/:id/run', async (c) => {
  const id = c.req.param('id')

  // Parse optional overrides from body
  let overrides: { agent?: string; model?: string; provider?: string } = {}
  try {
    const body = await c.req.json()
    if (body.agent) overrides.agent = body.agent
    if (body.model) overrides.model = body.model
    if (body.provider) overrides.provider = body.provider
  } catch {
    // No body or invalid JSON, use task defaults
  }

  const task = await queries.getTask(id)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  if (task.status !== 'pending') {
    return c.json({ error: `Task is ${task.status}, not pending` }, 400)
  }

  const agent = overrides.agent ?? task.agent
  if (!agent) {
    return c.json({ error: 'Task has no agent assigned' }, 400)
  }

  if (!task.prompt) {
    return c.json({ error: 'Task has no prompt' }, 400)
  }

  // Check dependencies
  const deps = JSON.parse(task.depends_on ?? '[]') as string[]
  if (deps.length > 0) {
    const depTasks = await Promise.all(deps.map((depId) => queries.getTask(depId)))
    const incomplete = depTasks.filter((t) => t && t.status !== 'done')
    if (incomplete.length > 0) {
      return c.json({
        error: 'Dependencies not resolved',
        blocking: incomplete.map((t) => ({ id: t!.id, title: t!.title, status: t!.status })),
      }, 400)
    }
  }

  // Mark as running
  const provider = overrides.provider ?? task.provider ?? undefined
  await queries.updateTask(id, {
    status: 'running',
    agent: agent,
    model: overrides.model ?? task.model ?? undefined,
    provider: provider,
    started_at: new Date().toISOString(),
  })

  broadcast('task:started', { id, status: 'running', agent, provider })

  // Execute agent (fire and forget, result handled async)
  executeTask({
    ...task,
    agent,
    model: overrides.model ?? task.model,
    provider,
  }).catch(console.error)

  return c.json({ message: 'Task started', id, agent })
})

// =============================================================================
// POST /api/tasks/:id/cancel - Cancel running task
// =============================================================================
app.post('/:id/cancel', async (c) => {
  const id = c.req.param('id')

  const task = await queries.getTask(id)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  if (task.status !== 'running') {
    return c.json({ error: `Task is ${task.status}, not running` }, 400)
  }

  // Kill the running process via registry
  // This handles graceful termination + force kill + Cline zombie cleanup
  const killed = await killProcess(id)

  // Also abort the controller if it exists
  const controller = runningTasks.get(id)
  if (controller) {
    controller.abort()
    runningTasks.delete(id)
  }

  // Mark as cancelled
  const now = new Date().toISOString()
  await queries.updateTask(id, {
    status: 'cancelled',
    completed_at: now,
    error: 'Task cancelled by user',
  })

  // Clear dependencies on cancelled task so dependents aren't blocked
  const unblocked = await clearDependencies([id])

  broadcast('task:cancelled', { id, status: 'cancelled' })

  return c.json({
    message: 'Task cancelled',
    id,
    process_killed: killed,
    tasks_unblocked: unblocked,
  })
})

// =============================================================================
// Helper: Execute task in background
// =============================================================================
async function executeTask(task: {
  id: string
  agent: string | null
  model: string | null
  provider?: string | null
  prompt: string | null
  repo_path: string
}) {
  // Create abort controller for cancellation
  const controller = new AbortController()
  runningTasks.set(task.id, controller)

  // Start logging for this task
  startTaskLog(task.id)

  try {
    const result = await dispatch({
      agent: task.agent as any,
      prompt: task.prompt!,
      cwd: task.repo_path,
      model: task.model ?? undefined,
      provider: task.provider as 'openrouter' | 'cline' | undefined,
      taskId: task.id,  // Register process for cleanup
      onOutput: (chunk, stream = 'stdout') => {
        // Store in log buffer
        appendLog(task.id, chunk, stream)
        // Broadcast to SSE
        broadcast('task:output', { id: task.id, chunk, stream })
      },
    })

    // Check if cancelled during execution
    if (controller.signal.aborted) {
      return
    }

    const now = new Date().toISOString()

    if (result.success) {
      await queries.updateTask(task.id, {
        status: 'done',
        result: result.output,
        cost_usd: result.cost_usd ?? 0,
        duration_seconds: result.duration_seconds,
        completed_at: now,
      })

      broadcast('task:completed', {
        id: task.id,
        status: 'done',
        cost_usd: result.cost_usd,
        duration_seconds: result.duration_seconds,
      })
    } else {
      await queries.updateTask(task.id, {
        status: 'failed',
        error: result.output,
        error_details: {
          error_type: 'execution_error',
          exit_code: result.exit_code,
        },
        duration_seconds: result.duration_seconds,
        completed_at: now,
      })

      broadcast('task:failed', {
        id: task.id,
        status: 'failed',
        error: result.output,
        exit_code: result.exit_code,
      })
    }
  } catch (error) {
    // Check if cancelled during execution
    if (controller.signal.aborted) {
      return
    }

    await queries.updateTask(task.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
    })

    broadcast('task:failed', {
      id: task.id,
      status: 'failed',
      error: String(error),
    })
  } finally {
    runningTasks.delete(task.id)
    completeTaskLog(task.id)
  }
}

// =============================================================================
// Helper: Parse task from DB row
// =============================================================================
function parseTask(row: typeof schema.tasks.$inferSelect | Record<string, unknown>) {
  const task = row as typeof schema.tasks.$inferSelect
  return {
    ...task,
    depends_on: JSON.parse((task.depends_on as string) ?? '[]'),
    parsed_result: task.parsed_result ? JSON.parse(task.parsed_result as string) : null,
    error_details: task.error_details ? JSON.parse(task.error_details as string) : null,
  }
}

// =============================================================================
// POST /api/tasks/:id/merge - Merge task branch to main
// =============================================================================
app.post('/:id/merge', async (c) => {
  const id = c.req.param('id')
  const task = await queries.getTask(id)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  if (task.status !== 'done') {
    return c.json({ error: `Task is ${task.status}, must be done to merge` }, 400)
  }

  // Parse result to get branch name if available
  const parsedResult = task.parsed_result ? JSON.parse(task.parsed_result) : null
  const branchName = parsedResult?.branch_name ?? `task/${id.slice(0, 8)}`

  // TODO: Actually perform git merge using dispatch
  // For now, return a placeholder response indicating the merge request was received
  broadcast('task:updated', { id, action: 'merge_requested', branch: branchName })

  return c.json({
    message: 'Merge requested',
    task_id: id,
    branch: branchName,
    status: 'pending',
  })
})

// =============================================================================
// POST /api/tasks/:id/clone - Clone task (create copy with same settings)
// =============================================================================
app.post('/:id/clone', async (c) => {
  const id = c.req.param('id')
  const task = await queries.getTask(id)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  // Create a new task with same settings
  const newId = crypto.randomUUID()
  const now = new Date().toISOString()

  const clonedTask = {
    id: newId,
    title: `${task.title} (copy)`,
    status: 'pending',
    agent: task.agent,
    model: task.model,
    provider: task.provider,
    repo_path: task.repo_path,
    prompt: task.prompt,
    depends_on: '[]', // Reset dependencies for clone
    sequenced: false,
    created_at: now,
  }

  await db.insert(schema.tasks).values(clonedTask)

  const result = parseTask(clonedTask)
  broadcast('task:created', result)

  return c.json({
    message: 'Task cloned',
    original_id: id,
    task: result,
  }, 201)
})

// =============================================================================
// GET /api/tasks/:id/sessions - Get fruiting sessions for task
// =============================================================================
app.get('/:id/sessions', async (c) => {
  const id = c.req.param('id')
  const task = await queries.getTask(id)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  // Get fruiting sessions for this task (recorded by dispatcher)
  const fruitingSessions = await queries.getFruitingSessionsByTask(id)

  // Parse JSON fields in fruiting sessions
  const parsedFruitingSessions = fruitingSessions.map((s) => ({
    ...s,
    context_trace: s.context_trace ? JSON.parse(s.context_trace) : null,
    session_log: s.session_log ? JSON.parse(s.session_log) : null,
  }))

  // Also get shepherd evaluations that include this task
  const allEvaluations = await queries.getShepherdEvaluations({ limit: 100 })
  const taskEvaluations = allEvaluations.filter((eval_) => {
    const tasksEvaluated = JSON.parse(eval_.tasks_evaluated ?? '[]')
    return tasksEvaluated.includes(id)
  })

  return c.json({
    task_id: id,
    fruiting_sessions: parsedFruitingSessions,
    evaluations: taskEvaluations.map(queries.parseShepherdEvaluation),
    total_sessions: parsedFruitingSessions.length,
    total_evaluations: taskEvaluations.length,
  })
})

// =============================================================================
// Helper: Resolve short IDs to full UUIDs
// =============================================================================
async function resolveDependencyIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []

  const resolved: string[] = []
  const allTasks = await queries.getTasks({ limit: 1000 })

  for (const id of ids) {
    if (id.length === 36) {
      // Already a full UUID - verify it exists
      const exists = allTasks.some((t) => t.id === id)
      if (exists) {
        resolved.push(id)
      }
    } else {
      // Short ID - find matching task
      const match = allTasks.find((t) => t.id.startsWith(id))
      if (match) {
        resolved.push(match.id)
      }
    }
  }

  return resolved
}

export default app

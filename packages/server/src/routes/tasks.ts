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
import { dispatch } from '../agents'
import { broadcast } from '../sse'
import * as queries from '../db/queries'

const app = new Hono()

// Track running task processes for cancellation
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
    limit,
    sequenced: sequenced !== undefined ? sequenced === 'true' : undefined,
  })

  // Apply offset manually (could be optimized in queries.ts)
  const paginatedTasks = tasks.slice(offset, offset + limit)

  return c.json(paginatedTasks.map(parseTask))
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

  return c.json(parseTask(task))
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
    repo_path: data.repo_path,
    prompt: data.prompt ?? null,
    depends_on: JSON.stringify(resolvedDeps),
    sequenced: false,
    created_at: now,
  }

  await db.insert(schema.tasks).values(task)

  const result = parseTask(task)
  broadcast('task:created', result)

  return c.json(result, 201)
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

  return c.json(result)
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
  let overrides: { agent?: string; model?: string } = {}
  try {
    const body = await c.req.json()
    if (body.agent) overrides.agent = body.agent
    if (body.model) overrides.model = body.model
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
  await queries.updateTask(id, {
    status: 'running',
    agent: agent,
    model: overrides.model ?? task.model ?? undefined,
    started_at: new Date().toISOString(),
  })

  broadcast('task:started', { id, status: 'running', agent })

  // Execute agent (fire and forget, result handled async)
  executeTask({
    ...task,
    agent,
    model: overrides.model ?? task.model,
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

  // Try to abort the running process
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

  broadcast('task:cancelled', { id, status: 'cancelled' })

  return c.json({ message: 'Task cancelled', id })
})

// =============================================================================
// Helper: Execute task in background
// =============================================================================
async function executeTask(task: {
  id: string
  agent: string | null
  model: string | null
  prompt: string | null
  repo_path: string
}) {
  // Create abort controller for cancellation
  const controller = new AbortController()
  runningTasks.set(task.id, controller)

  try {
    const result = await dispatch({
      agent: task.agent as any,
      prompt: task.prompt!,
      cwd: task.repo_path,
      model: task.model ?? undefined,
      onOutput: (chunk) => {
        broadcast('task:output', { id: task.id, chunk })
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

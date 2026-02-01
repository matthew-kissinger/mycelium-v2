import { Hono } from 'hono'
import { db, schema } from '../db'
import { broadcast } from '../sse'
import * as queries from '../db/queries'
import { dispatch } from '../agents'

const app = new Hono()

// Track running task processes for this module
const runningTasks = new Map<string, AbortController>()

// =============================================================================
// GET /api/queue - Get execution queue (pending + running tasks)
// =============================================================================
app.get('/', async (c) => {
  // Get pending and running tasks
  const [pending, running] = await Promise.all([
    queries.getTasks({ status: 'pending', limit: 100 }),
    queries.getTasks({ status: 'running', limit: 100 }),
  ])

  // Get ready tasks (pending, sequenced, dependencies resolved)
  const readyTasks = await queries.getReadyTasks(20)
  const readyIds = new Set(readyTasks.map((t) => t.id))

  // Parse and annotate tasks
  const parsedPending = pending.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    agent: task.agent,
    model: task.model,
    repo_path: task.repo_path,
    sequenced: task.sequenced,
    depends_on: JSON.parse(task.depends_on ?? '[]'),
    created_at: task.created_at,
    ready: readyIds.has(task.id),
  }))

  const parsedRunning = running.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    agent: task.agent,
    model: task.model,
    repo_path: task.repo_path,
    started_at: task.started_at,
    duration_seconds: task.started_at
      ? (Date.now() - new Date(task.started_at).getTime()) / 1000
      : 0,
  }))

  return c.json({
    pending: parsedPending,
    running: parsedRunning,
    ready_count: readyTasks.length,
    pending_count: pending.length,
    running_count: running.length,
  })
})

// =============================================================================
// POST /api/queue/run-next - Run next ready task
// =============================================================================
app.post('/run-next', async (c) => {
  const readyTasks = await queries.getReadyTasks(1)

  if (readyTasks.length === 0) {
    return c.json({
      message: 'No ready tasks in queue',
      started: 0,
    })
  }

  const task = readyTasks[0]

  if (!task.agent) {
    return c.json({
      error: 'Next ready task has no agent assigned',
      task_id: task.id,
      task_title: task.title,
    }, 400)
  }

  if (!task.prompt) {
    return c.json({
      error: 'Next ready task has no prompt',
      task_id: task.id,
      task_title: task.title,
    }, 400)
  }

  // Mark as running
  await queries.updateTask(task.id, {
    status: 'running',
    started_at: new Date().toISOString(),
  })

  broadcast('task:started', { id: task.id, status: 'running', agent: task.agent })

  // Execute in background
  executeTask(task).catch(console.error)

  return c.json({
    message: 'Task started',
    started: 1,
    task: {
      id: task.id,
      title: task.title,
      agent: task.agent,
      model: task.model,
    },
  })
})

// =============================================================================
// POST /api/queue/run-all - Run all ready tasks (up to limit)
// =============================================================================
app.post('/run-all', async (c) => {
  // Parse limit from query or body
  let limit = 5 // Default max concurrent
  try {
    const body = await c.req.json()
    if (body.limit && typeof body.limit === 'number') {
      limit = Math.min(body.limit, 10) // Cap at 10
    }
  } catch {
    // No body or invalid JSON, use default
  }

  // Check how many are already running
  const running = await queries.getTasks({ status: 'running', limit: 100 })
  const availableSlots = Math.max(0, limit - running.length)

  if (availableSlots === 0) {
    return c.json({
      message: 'Already at max concurrent tasks',
      started: 0,
      running: running.length,
    })
  }

  const readyTasks = await queries.getReadyTasks(availableSlots)

  if (readyTasks.length === 0) {
    return c.json({
      message: 'No ready tasks in queue',
      started: 0,
      running: running.length,
    })
  }

  // Filter tasks that have agent and prompt
  const runnableTasks = readyTasks.filter((t) => t.agent && t.prompt)
  const started: Array<{ id: string; title: string; agent: string }> = []

  for (const task of runnableTasks) {
    // Mark as running
    await queries.updateTask(task.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    })

    broadcast('task:started', { id: task.id, status: 'running', agent: task.agent })

    // Execute in background
    executeTask(task).catch(console.error)

    started.push({
      id: task.id,
      title: task.title,
      agent: task.agent!,
    })
  }

  return c.json({
    message: `Started ${started.length} task(s)`,
    started: started.length,
    running: running.length + started.length,
    tasks: started,
  })
})

// =============================================================================
// Helper: Execute task in background
// =============================================================================
async function executeTask(task: typeof schema.tasks.$inferSelect) {
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

export default app

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, desc, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import { TaskCreate, TaskUpdate, TaskStatus } from '@mycelium/shared'
import { dispatch } from '../agents'
import { broadcast } from '../sse'

const app = new Hono()

// List tasks
app.get('/', async (c) => {
  const status = c.req.query('status')
  const limit = parseInt(c.req.query('limit') ?? '50')

  let query = db.select().from(schema.tasks).orderBy(desc(schema.tasks.created_at)).limit(limit)

  if (status) {
    const rows = await db.select().from(schema.tasks)
      .where(eq(schema.tasks.status, status))
      .orderBy(desc(schema.tasks.created_at))
      .limit(limit)
    return c.json(rows.map(parseTask))
  }

  const rows = await query
  return c.json(rows.map(parseTask))
})

// Get single task
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))

  if (rows.length === 0) {
    return c.json({ error: 'Task not found' }, 404)
  }

  return c.json(parseTask(rows[0]))
})

// Create task
app.post('/', zValidator('json', TaskCreate), async (c) => {
  const data = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // Resolve short dependency IDs to full UUIDs
  const resolvedDeps = await resolveDependencyIds(data.depends_on ?? [])

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

// Update task
app.patch('/:id', zValidator('json', TaskUpdate), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  if (existing.length === 0) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const updates: Record<string, unknown> = {}
  if (data.status !== undefined) updates.status = data.status
  if (data.agent !== undefined) updates.agent = data.agent
  if (data.model !== undefined) updates.model = data.model
  if (data.result !== undefined) updates.result = data.result
  if (data.error !== undefined) updates.error = data.error
  if (data.sequenced !== undefined) updates.sequenced = data.sequenced
  if (data.depends_on !== undefined) {
    const resolved = await resolveDependencyIds(data.depends_on)
    updates.depends_on = JSON.stringify(resolved)
  }

  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, id))

  const updated = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  const result = parseTask(updated[0])
  broadcast('task:updated', result)

  return c.json(result)
})

// Run task
app.post('/:id/run', async (c) => {
  const id = c.req.param('id')
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))

  if (rows.length === 0) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const task = rows[0]

  if (task.status !== 'pending') {
    return c.json({ error: `Task is ${task.status}, not pending` }, 400)
  }

  if (!task.agent) {
    return c.json({ error: 'Task has no agent assigned' }, 400)
  }

  if (!task.prompt) {
    return c.json({ error: 'Task has no prompt' }, 400)
  }

  // Check dependencies
  const deps = JSON.parse(task.depends_on ?? '[]') as string[]
  if (deps.length > 0) {
    const depTasks = await db.select().from(schema.tasks).where(inArray(schema.tasks.id, deps))
    const incomplete = depTasks.filter((t) => t.status !== 'done')
    if (incomplete.length > 0) {
      return c.json({
        error: 'Dependencies not resolved',
        blocking: incomplete.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      }, 400)
    }
  }

  // Mark as running
  await db.update(schema.tasks).set({
    status: 'running',
    started_at: new Date().toISOString(),
  }).where(eq(schema.tasks.id, id))

  broadcast('task:started', { id, status: 'running' })

  // Execute agent (fire and forget, result handled async)
  executeTask(task).catch(console.error)

  return c.json({ message: 'Task started', id })
})

// Delete task
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
  return c.json({ message: 'Task deleted' })
})

// Helper: Execute task in background
async function executeTask(task: typeof schema.tasks.$inferSelect) {
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

    const now = new Date().toISOString()

    if (result.success) {
      await db.update(schema.tasks).set({
        status: 'done',
        result: result.output,
        cost_usd: result.cost_usd ?? 0,
        duration_seconds: result.duration_seconds,
        completed_at: now,
      }).where(eq(schema.tasks.id, task.id))

      broadcast('task:completed', { id: task.id, status: 'done', cost_usd: result.cost_usd })
    } else {
      await db.update(schema.tasks).set({
        status: 'failed',
        error: result.output,
        error_details: JSON.stringify({
          error_type: 'execution_error',
          exit_code: result.exit_code,
        }),
        duration_seconds: result.duration_seconds,
        completed_at: now,
      }).where(eq(schema.tasks.id, task.id))

      broadcast('task:failed', { id: task.id, status: 'failed', error: result.output })
    }
  } catch (error) {
    await db.update(schema.tasks).set({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
    }).where(eq(schema.tasks.id, task.id))

    broadcast('task:failed', { id: task.id, status: 'failed', error: String(error) })
  }
}

// Helper: Parse task from DB row
function parseTask(row: typeof schema.tasks.$inferSelect) {
  return {
    ...row,
    depends_on: JSON.parse(row.depends_on ?? '[]'),
    parsed_result: row.parsed_result ? JSON.parse(row.parsed_result) : null,
    error_details: row.error_details ? JSON.parse(row.error_details) : null,
  }
}

// Helper: Resolve short IDs to full UUIDs
async function resolveDependencyIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []

  const resolved: string[] = []
  for (const id of ids) {
    if (id.length === 36) {
      // Already a full UUID
      resolved.push(id)
    } else {
      // Short ID - find matching task
      const rows = await db.select().from(schema.tasks)
      const match = rows.find((t) => t.id.startsWith(id))
      if (match) {
        resolved.push(match.id)
      }
    }
  }

  return resolved
}

export default app

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, desc, and, isNull, lt } from 'drizzle-orm'
import { db, schema } from '../db'
import { SignalCreateRequest, SignalRespondRequest, Signal } from '@mycelium/shared'
import { broadcast } from '../sse'

const app = new Hono()

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse signal from DB row (deserialize JSON fields)
 */
function parseSignal(row: typeof schema.signals.$inferSelect): Signal {
  return {
    ...row,
    options: row.options ? JSON.parse(row.options) : undefined,
    response: row.response ?? undefined,
    task_id: row.task_id ?? undefined,
    repo_path: row.repo_path ?? undefined,
    responded_at: row.responded_at ?? undefined,
  } as Signal
}

/**
 * Check if a signal has expired based on creation time.
 * Default expiration is 24 hours.
 */
function isExpired(signal: typeof schema.signals.$inferSelect, expirationMs = 24 * 60 * 60 * 1000): boolean {
  const createdAt = new Date(signal.created_at).getTime()
  const now = Date.now()
  return now - createdAt > expirationMs
}

/**
 * Mark expired signals as expired and broadcast events.
 */
async function processExpiredSignals(): Promise<number> {
  const expirationThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Find pending signals older than 24 hours
  const expiredSignals = await db.select().from(schema.signals)
    .where(and(
      eq(schema.signals.status, 'pending'),
      lt(schema.signals.created_at, expirationThreshold)
    ))

  // Mark them as expired
  for (const signal of expiredSignals) {
    await db.update(schema.signals).set({
      status: 'expired',
    }).where(eq(schema.signals.id, signal.id))

    broadcast('signal:expired', {
      type: 'signal:expired',
      signal_id: signal.id,
      timestamp: new Date().toISOString(),
    })
  }

  return expiredSignals.length
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/signals
 * List signals with optional filters
 * Query params: status, repo_path, task_id, limit
 */
app.get('/', async (c) => {
  const status = c.req.query('status')
  const repoPath = c.req.query('repo_path')
  const taskId = c.req.query('task_id')
  const limit = parseInt(c.req.query('limit') ?? '50')

  // Process expired signals in the background
  processExpiredSignals().catch(console.error)

  // Build query based on filters
  if (status && repoPath) {
    const rows = await db.select().from(schema.signals)
      .where(and(
        eq(schema.signals.status, status),
        eq(schema.signals.repo_path, repoPath)
      ))
      .orderBy(desc(schema.signals.created_at))
      .limit(limit)
    return c.json(rows.map(parseSignal))
  }

  if (status && taskId) {
    const rows = await db.select().from(schema.signals)
      .where(and(
        eq(schema.signals.status, status),
        eq(schema.signals.task_id, taskId)
      ))
      .orderBy(desc(schema.signals.created_at))
      .limit(limit)
    return c.json(rows.map(parseSignal))
  }

  if (status) {
    const rows = await db.select().from(schema.signals)
      .where(eq(schema.signals.status, status))
      .orderBy(desc(schema.signals.created_at))
      .limit(limit)
    return c.json(rows.map(parseSignal))
  }

  if (repoPath) {
    const rows = await db.select().from(schema.signals)
      .where(eq(schema.signals.repo_path, repoPath))
      .orderBy(desc(schema.signals.created_at))
      .limit(limit)
    return c.json(rows.map(parseSignal))
  }

  if (taskId) {
    const rows = await db.select().from(schema.signals)
      .where(eq(schema.signals.task_id, taskId))
      .orderBy(desc(schema.signals.created_at))
      .limit(limit)
    return c.json(rows.map(parseSignal))
  }

  // No filters - return all signals
  const rows = await db.select().from(schema.signals)
    .orderBy(desc(schema.signals.created_at))
    .limit(limit)
  return c.json(rows.map(parseSignal))
})

/**
 * GET /api/signals/pending
 * Get all pending signals (convenience endpoint)
 */
app.get('/pending', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50')

  // Process expired signals first
  await processExpiredSignals()

  const rows = await db.select().from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))
    .orderBy(desc(schema.signals.created_at))
    .limit(limit)

  return c.json(rows.map(parseSignal))
})

/**
 * GET /api/signals/:id
 * Get a single signal by ID
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id')

  const rows = await db.select().from(schema.signals)
    .where(eq(schema.signals.id, id))

  if (rows.length === 0) {
    return c.json({ error: 'Signal not found' }, 404)
  }

  const signal = rows[0]

  // Check if it should be marked as expired
  if (signal.status === 'pending' && isExpired(signal)) {
    await db.update(schema.signals).set({
      status: 'expired',
    }).where(eq(schema.signals.id, id))

    broadcast('signal:expired', {
      type: 'signal:expired',
      signal_id: id,
      timestamp: new Date().toISOString(),
    })

    signal.status = 'expired'
  }

  return c.json(parseSignal(signal))
})

/**
 * POST /api/signals
 * Create a new alignment signal
 */
app.post('/', zValidator('json', SignalCreateRequest), async (c) => {
  const data = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const signal = {
    id,
    question: data.question,
    options: data.options ? JSON.stringify(data.options) : null,
    status: 'pending',
    task_id: data.task_id ?? null,
    repo_path: data.repo_path ?? null,
    created_at: now,
  }

  await db.insert(schema.signals).values(signal)

  const result = parseSignal(signal as typeof schema.signals.$inferSelect)

  // Broadcast signal:created event
  broadcast('signal:created', {
    type: 'signal:created',
    signal: result,
    timestamp: now,
  })

  // Handle blocking wait mode (if requested)
  if (data.wait) {
    const timeoutMs = (data.timeout_seconds ?? 300) * 1000
    const startTime = Date.now()

    // Poll for response
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Poll every second

      const rows = await db.select().from(schema.signals)
        .where(eq(schema.signals.id, id))

      if (rows.length === 0) {
        return c.json({ error: 'Signal was deleted' }, 410)
      }

      const updated = rows[0]
      if (updated.status !== 'pending') {
        return c.json(parseSignal(updated), 201)
      }
    }

    // Timeout - mark as expired
    await db.update(schema.signals).set({
      status: 'expired',
    }).where(eq(schema.signals.id, id))

    broadcast('signal:expired', {
      type: 'signal:expired',
      signal_id: id,
      timestamp: new Date().toISOString(),
    })

    return c.json({
      error: 'Signal timed out waiting for response',
      signal_id: id,
    }, 408)
  }

  return c.json(result, 201)
})

/**
 * POST /api/signals/:id/respond
 * Record a response to a signal
 */
app.post('/:id/respond', zValidator('json', SignalRespondRequest), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  // Check if signal exists
  const rows = await db.select().from(schema.signals)
    .where(eq(schema.signals.id, id))

  if (rows.length === 0) {
    return c.json({ error: 'Signal not found' }, 404)
  }

  const signal = rows[0]

  // Check if signal is still pending
  if (signal.status !== 'pending') {
    return c.json({
      error: `Signal is ${signal.status}, cannot respond`,
      status: signal.status,
    }, 400)
  }

  // Check if expired
  if (isExpired(signal)) {
    await db.update(schema.signals).set({
      status: 'expired',
    }).where(eq(schema.signals.id, id))

    broadcast('signal:expired', {
      type: 'signal:expired',
      signal_id: id,
      timestamp: new Date().toISOString(),
    })

    return c.json({ error: 'Signal has expired' }, 410)
  }

  // Validate response against options if options were provided
  if (signal.options) {
    const options = JSON.parse(signal.options) as string[]
    if (options.length > 0 && !options.includes(data.response)) {
      return c.json({
        error: 'Response must be one of the provided options',
        options,
        received: data.response,
      }, 400)
    }
  }

  // Update signal with response
  const now = new Date().toISOString()
  await db.update(schema.signals).set({
    status: 'responded',
    response: data.response,
    responded_at: now,
  }).where(eq(schema.signals.id, id))

  // Broadcast signal:responded event
  broadcast('signal:responded', {
    type: 'signal:responded',
    signal_id: id,
    response: data.response,
    timestamp: now,
  })

  // Fetch updated signal
  const updated = await db.select().from(schema.signals)
    .where(eq(schema.signals.id, id))

  return c.json(parseSignal(updated[0]))
})

/**
 * DELETE /api/signals/:id
 * Delete a signal
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const rows = await db.select().from(schema.signals)
    .where(eq(schema.signals.id, id))

  if (rows.length === 0) {
    return c.json({ error: 'Signal not found' }, 404)
  }

  await db.delete(schema.signals).where(eq(schema.signals.id, id))

  return c.json({ message: 'Signal deleted', id })
})

export default app

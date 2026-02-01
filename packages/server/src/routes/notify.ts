import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { broadcast } from '../sse'
import {
  NotifyRequest,
  NotifyResponse,
  SignalCreateRequest,
  InboxMessage,
} from '@mycelium/shared'

const app = new Hono()

// =============================================================================
// POST /notify - Send notification
// Placeholder implementation - logs for now, Telegram integration later
// =============================================================================
app.post('/notify', zValidator('json', NotifyRequest), async (c) => {
  const data = c.req.valid('json')

  // Log the notification (placeholder for Telegram integration)
  console.log('[NOTIFY]', data.message)
  if (data.screenshot_path) {
    console.log('[NOTIFY] Screenshot:', data.screenshot_path)
  }
  if (data.file_path) {
    console.log('[NOTIFY] File:', data.file_path)
  }

  // Note: When Telegram integration is added, we'll send via Telegram here
  // For now, just log and return success

  const response: NotifyResponse = {
    success: true,
    // message_id will be populated when Telegram integration is added
  }

  return c.json(response)
})

// =============================================================================
// POST /align - Create alignment signal
// Creates a signal and optionally waits for response
// =============================================================================
app.post('/align', zValidator('json', SignalCreateRequest), async (c) => {
  const data = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // Create the signal
  const signal = {
    id,
    question: data.question,
    options: data.options ? JSON.stringify(data.options) : null,
    status: 'pending',
    response: null,
    task_id: data.task_id ?? null,
    repo_path: data.repo_path ?? null,
    created_at: now,
    responded_at: null,
  }

  await db.insert(schema.signals).values(signal)

  // Broadcast signal creation (matching SignalCreatedEvent schema)
  broadcast('signal:created', {
    type: 'signal:created',
    signal: {
      id,
      question: data.question,
      options: data.options,
      status: 'pending' as const,
      task_id: data.task_id,
      repo_path: data.repo_path,
      created_at: now,
    },
    timestamp: now,
  })

  // Log alignment request (placeholder for Telegram integration)
  let message = `[ALIGN] ${data.question}`
  if (data.options && data.options.length > 0) {
    message += `\nOptions: ${data.options.join(', ')}`
  }
  console.log(message)

  // If wait=true, wait for response (with timeout)
  if (data.wait) {
    const timeout = (data.timeout_seconds ?? 300) * 1000
    const startTime = Date.now()
    const pollInterval = 1000 // 1 second

    while (Date.now() - startTime < timeout) {
      // Check for response
      const rows = await db.select().from(schema.signals).where(eq(schema.signals.id, id))
      if (rows.length > 0 && rows[0].status === 'responded' && rows[0].response) {
        return c.json({
          id,
          question: data.question,
          options: data.options ?? null,
          status: 'responded',
          response: rows[0].response,
          task_id: data.task_id ?? null,
          repo_path: data.repo_path ?? null,
          created_at: now,
          responded_at: rows[0].responded_at,
        })
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    // Timeout - mark signal as expired
    await db.update(schema.signals).set({
      status: 'expired',
    }).where(eq(schema.signals.id, id))

    return c.json({
      id,
      question: data.question,
      options: data.options ?? null,
      status: 'expired',
      response: null,
      task_id: data.task_id ?? null,
      repo_path: data.repo_path ?? null,
      created_at: now,
      responded_at: null,
      error: 'Signal timed out waiting for response',
    }, 408) // Request Timeout
  }

  // Non-blocking - return immediately
  return c.json({
    id,
    question: data.question,
    options: data.options ?? null,
    status: 'pending',
    response: null,
    task_id: data.task_id ?? null,
    repo_path: data.repo_path ?? null,
    created_at: now,
    responded_at: null,
  }, 201)
})

// =============================================================================
// GET /inbox - Get user messages
// Placeholder - returns empty array, Telegram integration later
// =============================================================================
app.get('/inbox', async (c) => {
  const limitParam = c.req.query('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 20

  // Placeholder: Telegram inbox will be implemented later
  // For now, return empty array
  console.log('[INBOX] Fetching messages (placeholder, limit:', limit, ')')

  const messages: InboxMessage[] = []

  return c.json({
    messages,
    count: 0,
    has_more: false,
  })
})

// =============================================================================
// GET /status - Check Telegram connection status
// Placeholder - returns disconnected status
// =============================================================================
app.get('/status', async (c) => {
  // Placeholder: Will check actual Telegram bot connection later
  return c.json({
    connected: false,
    bot_username: null,
    chat_id: null,
    last_update_id: null,
    error: 'Telegram integration not configured',
  })
})

export default app

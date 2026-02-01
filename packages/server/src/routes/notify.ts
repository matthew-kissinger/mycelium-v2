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
import { getTelegramService, loadConfig } from '../telegram'
import { getInboxMessages } from '../telegram/polling'
import { formatSignalQuestion, formatNotification } from '../telegram/messages'

const app = new Hono()

// =============================================================================
// POST /notify - Send notification
// Sends via Telegram if connected, otherwise just logs
// =============================================================================
app.post('/notify', zValidator('json', NotifyRequest), async (c) => {
  const data = c.req.valid('json')
  const telegram = getTelegramService()

  let messageId: number | null = null

  if (telegram && telegram.isConnected()) {
    // Send via Telegram
    if (data.screenshot_path) {
      // Send as photo with caption
      messageId = await telegram.sendPhoto(data.screenshot_path, data.message)
    } else if (data.file_path) {
      // Send as document with caption
      messageId = await telegram.sendDocument(data.file_path, data.message)
    } else {
      // Send as text message
      const formattedMessage = formatNotification(data.message)
      messageId = await telegram.sendMessage(formattedMessage)
    }

    if (messageId !== null) {
      console.log('[NOTIFY] Sent via Telegram, message_id:', messageId)
    } else {
      console.error('[NOTIFY] Failed to send via Telegram')
    }
  } else {
    // Fall back to logging
    console.log('[NOTIFY]', data.message)
    if (data.screenshot_path) {
      console.log('[NOTIFY] Screenshot:', data.screenshot_path)
    }
    if (data.file_path) {
      console.log('[NOTIFY] File:', data.file_path)
    }
  }

  // Broadcast notification event
  broadcast('notification:sent', {
    type: 'notification:sent',
    message: data.message,
    message_id: messageId ?? undefined,
    timestamp: new Date().toISOString(),
  })

  const response: NotifyResponse = {
    success: messageId !== null || !telegram?.isConnected(),
    message_id: messageId ?? undefined,
    error: messageId === null && telegram?.isConnected()
      ? 'Failed to send message'
      : undefined,
  }

  return c.json(response)
})

// =============================================================================
// POST /align - Create alignment signal
// Creates a signal, sends via Telegram, and optionally waits for response
// =============================================================================
app.post('/align', zValidator('json', SignalCreateRequest), async (c) => {
  const data = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const telegram = getTelegramService()

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

  // Send via Telegram if connected
  if (telegram && telegram.isConnected()) {
    const formattedQuestion = formatSignalQuestion({
      id,
      question: data.question,
      options: data.options,
      repo_path: data.repo_path,
      task_id: data.task_id,
    })

    if (data.options && data.options.length > 0) {
      // Send with inline keyboard buttons
      await telegram.sendButtons(formattedQuestion, data.options, 2)
    } else {
      // Send as plain message
      await telegram.sendMessage(formattedQuestion)
    }
  } else {
    // Fall back to logging
    let message = `[ALIGN] ${data.question}`
    if (data.options && data.options.length > 0) {
      message += `\nOptions: ${data.options.join(', ')}`
    }
    console.log(message)
  }

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
// GET /inbox - Get user messages from Telegram
// =============================================================================
app.get('/inbox', async (c) => {
  const limitParam = c.req.query('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 20
  const telegram = getTelegramService()

  if (!telegram || !telegram.isConnected()) {
    return c.json({
      messages: [],
      count: 0,
      has_more: false,
      error: 'Telegram not connected',
    })
  }

  // Get messages from the in-memory inbox
  const inboxRecords = getInboxMessages(limit)

  const messages: InboxMessage[] = inboxRecords.map(record => ({
    update_id: record.update_id,
    message_id: record.message_id,
    text: record.text,
    timestamp: record.timestamp,
    chat_id: record.chat_id,
    has_file: record.has_file,
  }))

  return c.json({
    messages,
    count: messages.length,
    has_more: inboxRecords.length >= limit,
  })
})

// =============================================================================
// GET /inbox/:message_id/download - Download file from Telegram message
// =============================================================================
app.get('/inbox/:message_id/download', async (c) => {
  const messageIdParam = c.req.param('message_id')
  const messageId = parseInt(messageIdParam, 10)
  const telegram = getTelegramService()

  if (!telegram || !telegram.isConnected()) {
    return c.json({ error: 'Telegram not connected' }, 503)
  }

  // Find the message in inbox
  const inboxRecords = getInboxMessages(100)
  const record = inboxRecords.find(r => r.message_id === messageId)

  if (!record) {
    return c.json({ error: 'Message not found' }, 404)
  }

  if (!record.file_id) {
    return c.json({ error: 'Message has no file' }, 400)
  }

  // Download the file
  const fileData = await telegram.getFile(record.file_id)

  if (!fileData) {
    return c.json({ error: 'Failed to download file' }, 500)
  }

  // Determine content type
  const contentType = record.file_type === 'photo'
    ? 'image/jpeg'
    : 'application/octet-stream'

  // Convert Buffer to ArrayBuffer slice for Response compatibility
  const arrayBuffer = fileData.buffer.slice(
    fileData.byteOffset,
    fileData.byteOffset + fileData.byteLength
  ) as ArrayBuffer

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="telegram_${messageId}"`,
    },
  })
})

// =============================================================================
// GET /status - Check Telegram connection status
// =============================================================================
app.get('/status', async (c) => {
  const telegram = getTelegramService()
  const config = loadConfig()

  if (!telegram) {
    return c.json({
      connected: false,
      bot_username: null,
      chat_id: null,
      last_update_id: null,
      error: config ? 'Telegram service not initialized' : 'Telegram not configured',
    })
  }

  return c.json({
    connected: telegram.isConnected(),
    bot_username: telegram.getBotUsername(),
    chat_id: config?.chatId ?? null,
    last_update_id: telegram.getLastUpdateId(),
    error: telegram.isConnected() ? null : 'Telegram not connected',
  })
})

export default app

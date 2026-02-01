/**
 * Telegram Polling Handler
 *
 * Processes incoming Telegram updates:
 * - Text messages from users
 * - Callback queries (button presses)
 * - Commands (/start, /ping, etc.)
 *
 * Routes signal responses to the database and broadcasts SSE events.
 */

import { eq, and, isNull, desc } from 'drizzle-orm'
import { db, schema } from '../db'
import { broadcast } from '../sse'
import type {
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramService,
} from './index'

// =============================================================================
// Types
// =============================================================================

export interface InboxMessageRecord {
  update_id: number
  message_id: number
  text: string
  timestamp: string
  chat_id: number
  has_file: boolean
  file_id?: string
  file_type?: 'photo' | 'document'
}

// In-memory store for inbox messages (could be moved to DB if persistence needed)
const inboxMessages: InboxMessageRecord[] = []
const MAX_INBOX_MESSAGES = 100

// Signal patterns to detect in callback data or reply text
const SIGNAL_RESPONSE_PATTERNS = [
  /^signal:([a-f0-9-]+):(.+)$/i, // signal:uuid:response
  /^([a-f0-9]{8})$/i, // Short ID (first 8 chars of UUID)
]

// =============================================================================
// Update Handler
// =============================================================================

export function createUpdateHandler(telegram: TelegramService) {
  return async (update: TelegramUpdate): Promise<void> => {
    console.log('[Telegram] Received update:', update.update_id)

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, telegram)
    } else if (update.message) {
      await handleMessage(update.message, telegram)
    }
  }
}

// =============================================================================
// Message Handler
// =============================================================================

async function handleMessage(message: TelegramMessage, telegram: TelegramService): Promise<void> {
  const text = message.text ?? ''
  const chatId = message.chat.id

  // Store in inbox
  const inboxRecord: InboxMessageRecord = {
    update_id: 0, // Will be set by caller
    message_id: message.message_id,
    text,
    timestamp: new Date(message.date * 1000).toISOString(),
    chat_id: chatId,
    has_file: !!(message.photo || message.document),
  }

  if (message.photo && message.photo.length > 0) {
    // Get largest photo
    const largestPhoto = message.photo.reduce((a, b) =>
      (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b
    )
    inboxRecord.file_id = largestPhoto.file_id
    inboxRecord.file_type = 'photo'
  } else if (message.document) {
    inboxRecord.file_id = message.document.file_id
    inboxRecord.file_type = 'document'
  }

  storeInboxMessage(inboxRecord)

  // Handle commands
  if (text.startsWith('/')) {
    await handleCommand(text, message, telegram)
    return
  }

  // Check if this is a reply to a signal
  if (message.reply_to_message) {
    await handlePossibleSignalReply(text, message.reply_to_message, telegram)
    return
  }

  // Try to match as a signal response (if text matches a short ID or signal pattern)
  await tryMatchSignalResponse(text, telegram)
}

// =============================================================================
// Callback Query Handler (Button Presses)
// =============================================================================

async function handleCallbackQuery(
  query: TelegramCallbackQuery,
  telegram: TelegramService
): Promise<void> {
  const data = query.data ?? ''
  console.log('[Telegram] Callback query:', data)

  // Check for signal response format
  const signalMatch = data.match(/^signal:([a-f0-9-]+):(.+)$/i)
  if (signalMatch) {
    const [, signalId, response] = signalMatch
    await respondToSignal(signalId, response)
    // Acknowledge the callback
    if ('answerCallbackQuery' in telegram) {
      await (telegram as any).answerCallbackQuery(query.id, 'Response recorded')
    }
    return
  }

  // Check if the data is a response to a pending signal
  // (Simple button press where data is the option text)
  const responded = await tryMatchPendingSignalOption(data)
  if (responded) {
    if ('answerCallbackQuery' in telegram) {
      await (telegram as any).answerCallbackQuery(query.id, 'Response recorded')
    }
    return
  }

  // Acknowledge unknown callback
  if ('answerCallbackQuery' in telegram) {
    await (telegram as any).answerCallbackQuery(query.id)
  }
}

// =============================================================================
// Command Handler
// =============================================================================

async function handleCommand(
  text: string,
  message: TelegramMessage,
  telegram: TelegramService
): Promise<void> {
  const command = text.split(' ')[0].toLowerCase()
  const chatId = message.chat.id

  switch (command) {
    case '/start':
      await telegram.sendMessage(
        `<b>Mycelium Bot Ready</b>\n\n` +
        `Your chat ID: <code>${chatId}</code>\n\n` +
        `Available commands:\n` +
        `/ping - Check connection\n` +
        `/status - View system status\n` +
        `/pending - View pending signals\n` +
        `/tasks - View recent tasks`
      )
      break

    case '/ping':
      await telegram.sendMessage('Pong!')
      break

    case '/status':
      await sendStatusMessage(telegram)
      break

    case '/pending':
      await sendPendingSignals(telegram)
      break

    case '/tasks':
      await sendRecentTasks(telegram)
      break

    default:
      // Unknown command, ignore
      break
  }
}

// =============================================================================
// Signal Response Handling
// =============================================================================

async function tryMatchSignalResponse(text: string, telegram: TelegramService): Promise<boolean> {
  // Try short ID match (first 8 chars)
  const shortIdMatch = text.match(/^([a-f0-9]{8})\s+(.+)$/i)
  if (shortIdMatch) {
    const [, shortId, response] = shortIdMatch
    return await respondToSignalByShortId(shortId, response)
  }

  // Try full signal:uuid:response format
  const fullMatch = text.match(/^signal:([a-f0-9-]+):(.+)$/i)
  if (fullMatch) {
    const [, signalId, response] = fullMatch
    return await respondToSignal(signalId, response)
  }

  // Try matching as option text for most recent pending signal
  return await tryMatchPendingSignalOption(text)
}

async function tryMatchPendingSignalOption(optionText: string): Promise<boolean> {
  // Get the most recent pending signal
  const signals = await db
    .select()
    .from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))
    .orderBy(desc(schema.signals.created_at))
    .limit(1)

  if (signals.length === 0) {
    return false
  }

  const signal = signals[0]
  const options = signal.options ? JSON.parse(signal.options) : []

  // Check if the option text matches one of the signal's options
  if (options.includes(optionText)) {
    return await respondToSignal(signal.id, optionText)
  }

  return false
}

async function handlePossibleSignalReply(
  text: string,
  replyToMessage: TelegramMessage,
  telegram: TelegramService
): Promise<void> {
  // Look for a signal that was sent around the time of the replied-to message
  // This is a heuristic - we check if the reply-to message text contains signal identifiers
  const replyText = replyToMessage.text ?? ''

  // Try to extract signal ID from the original message
  const signalIdMatch = replyText.match(/Signal ID: ([a-f0-9-]+)/i)
  if (signalIdMatch) {
    const signalId = signalIdMatch[1]
    await respondToSignal(signalId, text)
    return
  }

  // Otherwise treat it as a response to the most recent pending signal
  await tryMatchPendingSignalOption(text)
}

async function respondToSignal(signalId: string, response: string): Promise<boolean> {
  const now = new Date().toISOString()

  // Check if signal exists and is pending
  const signals = await db
    .select()
    .from(schema.signals)
    .where(and(eq(schema.signals.id, signalId), eq(schema.signals.status, 'pending')))

  if (signals.length === 0) {
    console.log(`[Telegram] Signal not found or already responded: ${signalId}`)
    return false
  }

  // Update the signal
  await db
    .update(schema.signals)
    .set({
      status: 'responded',
      response,
      responded_at: now,
    })
    .where(eq(schema.signals.id, signalId))

  console.log(`[Telegram] Signal ${signalId.slice(0, 8)} responded: ${response}`)

  // Broadcast SSE event
  broadcast('signal:responded', {
    type: 'signal:responded',
    signal: {
      id: signalId,
      response,
      status: 'responded' as const,
      responded_at: now,
    },
    timestamp: now,
  })

  return true
}

async function respondToSignalByShortId(shortId: string, response: string): Promise<boolean> {
  // Find signal by short ID prefix
  const signals = await db
    .select()
    .from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))

  const signal = signals.find(s => s.id.startsWith(shortId))
  if (!signal) {
    console.log(`[Telegram] No pending signal found with short ID: ${shortId}`)
    return false
  }

  return await respondToSignal(signal.id, response)
}

// =============================================================================
// Status Messages
// =============================================================================

async function sendStatusMessage(telegram: TelegramService): Promise<void> {
  // Get task counts
  const tasks = await db.select().from(schema.tasks)
  const pending = tasks.filter(t => t.status === 'pending').length
  const running = tasks.filter(t => t.status === 'running').length
  const done = tasks.filter(t => t.status === 'done').length
  const failed = tasks.filter(t => t.status === 'failed').length

  // Get pending signals count
  const pendingSignals = await db
    .select()
    .from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))

  const message =
    `<b>Mycelium Status</b>\n\n` +
    `<b>Tasks:</b>\n` +
    `  Pending: ${pending}\n` +
    `  Running: ${running}\n` +
    `  Completed: ${done}\n` +
    `  Failed: ${failed}\n\n` +
    `<b>Signals:</b>\n` +
    `  Pending: ${pendingSignals.length}`

  await telegram.sendMessage(message)
}

async function sendPendingSignals(telegram: TelegramService): Promise<void> {
  const signals = await db
    .select()
    .from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))
    .orderBy(desc(schema.signals.created_at))
    .limit(5)

  if (signals.length === 0) {
    await telegram.sendMessage('No pending signals.')
    return
  }

  let message = '<b>Pending Signals:</b>\n\n'
  for (const signal of signals) {
    const shortId = signal.id.slice(0, 8)
    const options = signal.options ? JSON.parse(signal.options) : []
    message += `<b>${shortId}</b>\n${signal.question}\n`
    if (options.length > 0) {
      message += `Options: ${options.join(', ')}\n`
    }
    message += '\n'
  }

  await telegram.sendMessage(message)
}

async function sendRecentTasks(telegram: TelegramService): Promise<void> {
  const tasks = await db
    .select()
    .from(schema.tasks)
    .orderBy(desc(schema.tasks.created_at))
    .limit(5)

  if (tasks.length === 0) {
    await telegram.sendMessage('No tasks.')
    return
  }

  let message = '<b>Recent Tasks:</b>\n\n'
  for (const task of tasks) {
    const shortId = task.id.slice(0, 8)
    const statusIcon = {
      pending: '\u23f3',
      running: '\u25b6\ufe0f',
      done: '\u2705',
      failed: '\u274c',
      cancelled: '\u23f9',
    }[task.status] ?? '\u2753'

    message += `${statusIcon} <b>${shortId}</b> ${task.title}\n`
  }

  await telegram.sendMessage(message)
}

// =============================================================================
// Inbox Management
// =============================================================================

function storeInboxMessage(record: InboxMessageRecord): void {
  inboxMessages.unshift(record)

  // Trim to max size
  while (inboxMessages.length > MAX_INBOX_MESSAGES) {
    inboxMessages.pop()
  }
}

export function getInboxMessages(limit: number = 20): InboxMessageRecord[] {
  return inboxMessages.slice(0, limit)
}

export function getInboxMessageById(messageId: number): InboxMessageRecord | undefined {
  return inboxMessages.find(m => m.message_id === messageId)
}

export function clearInbox(): void {
  inboxMessages.length = 0
}

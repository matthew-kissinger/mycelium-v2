/**
 * Telegram Poller - Background polling loop with continuation agents
 *
 * This module manages the Telegram polling lifecycle and handles:
 * - Long-polling for updates (30s timeout)
 * - Processing messages into inbox storage
 * - Handling callback queries for signal responses
 * - Spawning continuation agents when signals are responded to
 *
 * Matches v1 behavior from telegram_poller.py
 */

import { eq, desc, sql } from 'drizzle-orm'
import { spawn } from 'bun'
import { db, schema } from '../db'
import * as queries from '../db/queries'
import { broadcast } from '../sse'
import { dispatch } from '../agents/dispatch'
import { buildMycelContext } from '../prompts/context'
import { escapeHtml } from './messages'
import type {
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramService,
} from './index'

// =============================================================================
// Types
// =============================================================================

export interface InboxMessage {
  update_id: number
  message_id: number
  text: string
  timestamp: string
  chat_id: number
  has_file: boolean
  file_id?: string
  file_type?: 'photo' | 'document'
  signal_id?: string
}

// In-memory inbox (could be moved to DB for persistence)
const inboxMessages: InboxMessage[] = []
const MAX_INBOX_MESSAGES = 100

// Poller state
let pollerRunning = false

// =============================================================================
// Signal Detection Patterns
// =============================================================================

/**
 * Check if a signal question is from Discovery Agent.
 */
export function isDiscoverySignal(question: string): boolean {
  return question.trim().startsWith('[DISCOVERY')
}

/**
 * Check if a signal question is from Genesis Agent.
 */
export function isGenesisSignal(question: string): boolean {
  return question.includes('Genesis proposes:') || question.trim().startsWith('[GENESIS')
}

/**
 * Check if a signal question is from Shepherd Agent.
 */
export function isShepherdSignal(question: string): boolean {
  return question.includes('[SHEPHERD]') || question.includes('Should I merge')
}

/**
 * Extract repo path from Discovery signal question.
 * Questions start with: "[DISCOVERY repo_name]"
 */
export function extractRepoFromDiscoverySignal(question: string): string | null {
  const match = question.match(/\[DISCOVERY\s+([^\]]+)\]/)
  if (!match) return null

  const repoName = match[1].trim()

  // Try to find repo by name in database
  // This is async, so we'll need to handle it differently
  return repoName
}

// =============================================================================
// Continuation Agent Prompts
// =============================================================================

const DISCOVERY_CONTINUATION_PROMPT = `You are the Task Creator Agent for Mycelium.

Your job: Transform a Discovery report into properly-speced tasks based on the human's selection.

## Context

You receive:
1. The **original Discovery report** sent to the human (with numbered suggestions)
2. The **human's response** indicating which tasks to create

## Interpret Human Response

- "all" or "yes" -> Create all suggested tasks
- "1 2 3" or "1, 2, 3" -> Create only those numbered tasks
- "none" or "skip" or "no" -> Don't create any, just confirm
- Custom text -> Interpret intent

## Creating Tasks

For EACH approved task:
1. Parse the Discovery report to understand what needs doing
2. Create via mycel CLI: \`mycel task create "title" --repo {repo_path} --prompt "..."\`
3. Use variety of agents (codex, gemini, cursor, cline, claude)

## Your Process

1. Parse the human's response to identify which tasks to create
2. Create properly-speced tasks
3. Send confirmation: \`mycel notify "[TASK CREATOR] Created N tasks"\`

After completing, output:
<tasks_created>N</tasks_created>

{MYCEL_CONTEXT}

## Input

**Original Discovery Report:**
{original_report}

**Human's Response:**
"{human_response}"

---

Create properly-speced tasks for the items the human approved.
`

const GENESIS_CONTINUATION_PROMPT = `You are the Genesis Agent continuing after human feedback.

## Context

The human was asked about a repo proposal and has now replied.

**Original Proposal:**
{original_proposal}

**Human's Response:**
{human_response}

## Your Task

Based on the human's response, take the appropriate action:

1. If approved ("yes", "go", "create it", etc.):
   - Create the repo using gh CLI
   - Set up the scaffold
   - Add to network via mycel repos add
   - Notify: mycel notify "[GENESIS] Created: repo-name"

2. If rejected ("no", "skip", etc.):
   - Acknowledge and exit
   - Notify: mycel notify "[GENESIS] Proposal declined"

3. If modifications requested:
   - Adjust based on feedback
   - Create with modifications
   - Notify what was created

{MYCEL_CONTEXT}

When complete, output:
<genesis_complete>action</genesis_complete>
`

const SHEPHERD_CONTINUATION_PROMPT = `You are the Shepherd Agent continuing after human feedback.

## Context

You asked the human a question about code evaluation/merge decision and they have replied.

**Original Question:**
{original_question}

**Human's Response:**
{human_response}

## Your Task

Based on the human's response:

1. If they approve merge ("yes", "merge it", etc.):
   - Execute the merge: git checkout main && git merge <branch>
   - Notify: mycel notify "[SHEPHERD] Merged: branch-name"

2. If they reject ("no", "reject", etc.):
   - Mark as rejected, optionally delete branch
   - Notify: mycel notify "[SHEPHERD] Rejected: branch-name"

3. If they want changes:
   - Note the feedback for future reference
   - Notify what action was taken

{MYCEL_CONTEXT}

When complete, output:
<shepherd_complete>action</shepherd_complete>
`

// =============================================================================
// Continuation Agent Handlers
// =============================================================================

/**
 * Run Discovery continuation agent (Task Creator).
 */
async function runDiscoveryContinuation(
  signalQuestion: string,
  humanResponse: string,
  repoPath?: string
): Promise<void> {
  console.log('[Poller] Running Discovery continuation agent')

  const mycelContext = buildMycelContext({
    role: 'task_creator',
    agentId: 'task_creator',
  })

  const sanitizedResponse = '```\n' + humanResponse + '\n```'

  const prompt = DISCOVERY_CONTINUATION_PROMPT
    .replace('{original_report}', signalQuestion)
    .replace('{human_response}', sanitizedResponse)
    .replace('{repo_path}', repoPath ?? '')
    .replace('{MYCEL_CONTEXT}', mycelContext)

  try {
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath ?? process.cwd(),
      model: 'sonnet',
      timeout: 300,
    })

    if (result.success) {
      console.log('[Poller] Discovery continuation completed')
    } else {
      console.error('[Poller] Discovery continuation failed:', result.output.slice(0, 200))
    }
  } catch (error) {
    console.error('[Poller] Discovery continuation error:', error)
  }
}

/**
 * Run Genesis continuation agent.
 */
async function runGenesisContinuation(
  signalQuestion: string,
  humanResponse: string
): Promise<void> {
  console.log('[Poller] Running Genesis continuation agent')

  const mycelContext = buildMycelContext({
    role: 'genesis',
    agentId: 'genesis',
  })

  const sanitizedResponse = '```\n' + humanResponse + '\n```'

  const prompt = GENESIS_CONTINUATION_PROMPT
    .replace('{original_proposal}', signalQuestion)
    .replace('{human_response}', sanitizedResponse)
    .replace('{MYCEL_CONTEXT}', mycelContext)

  try {
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: process.cwd(),
      model: 'opus',
      timeout: 600,
    })

    if (result.success) {
      console.log('[Poller] Genesis continuation completed')
    } else {
      console.error('[Poller] Genesis continuation failed:', result.output.slice(0, 200))
    }
  } catch (error) {
    console.error('[Poller] Genesis continuation error:', error)
  }
}

/**
 * Run Shepherd continuation agent.
 */
async function runShepherdContinuation(
  signalQuestion: string,
  humanResponse: string,
  repoPath?: string
): Promise<void> {
  console.log('[Poller] Running Shepherd continuation agent')

  const mycelContext = buildMycelContext({
    role: 'shepherd',
    agentId: 'shepherd',
  })

  const sanitizedResponse = '```\n' + humanResponse + '\n```'

  const prompt = SHEPHERD_CONTINUATION_PROMPT
    .replace('{original_question}', signalQuestion)
    .replace('{human_response}', sanitizedResponse)
    .replace('{MYCEL_CONTEXT}', mycelContext)

  try {
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath ?? process.cwd(),
      model: 'opus',
      timeout: 300,
    })

    if (result.success) {
      console.log('[Poller] Shepherd continuation completed')
    } else {
      console.error('[Poller] Shepherd continuation failed:', result.output.slice(0, 200))
    }
  } catch (error) {
    console.error('[Poller] Shepherd continuation error:', error)
  }
}

// =============================================================================
// Update Handler with Continuation Agents
// =============================================================================

/**
 * Create an update handler with continuation agent support.
 */
export function createPollerHandler(telegram: TelegramService) {
  return async (update: TelegramUpdate): Promise<void> => {
    console.log('[Poller] Received update:', update.update_id)

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, telegram)
    } else if (update.message) {
      await handleMessage(update.message, update.update_id, telegram)
    }
  }
}

/**
 * Handle incoming message.
 */
async function handleMessage(
  message: TelegramMessage,
  updateId: number,
  telegram: TelegramService
): Promise<void> {
  const text = message.text ?? message.caption ?? ''
  const chatId = message.chat.id

  // Check for file attachments
  let fileId: string | undefined
  let fileType: 'photo' | 'document' | undefined

  if (message.photo && message.photo.length > 0) {
    const largestPhoto = message.photo.reduce((a, b) =>
      (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b
    )
    fileId = largestPhoto.file_id
    fileType = 'photo'
  } else if (message.document) {
    fileId = message.document.file_id
    fileType = 'document'
  }

  // Check if reply to a signal message
  let signalId: string | undefined
  let signal: typeof schema.signals.$inferSelect | undefined

  const SIGNAL_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

  if (message.reply_to_message) {
    const replyToMsgId = message.reply_to_message.message_id

    // First, try to find signal by Telegram message ID (most accurate)
    const signalsByMsgId = await db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.telegram_message_id, replyToMsgId))
      .limit(1)

    if (signalsByMsgId.length > 0) {
      const candidate = signalsByMsgId[0]
      // Check TTL - skip if signal is older than 24 hours
      const signalAge = Date.now() - new Date(candidate.created_at).getTime()
      if (signalAge < SIGNAL_TTL_MS) {
        signal = candidate
        signalId = signal.id
      } else {
        console.log(`[Poller] Skipping expired signal ${candidate.id.slice(0, 8)} (${Math.round(signalAge / 3600000)}h old)`)
      }
    } else {
      // Fallback: match most recent pending signal, require signal ID prefix in text
      const pendingSignals = await db
        .select()
        .from(schema.signals)
        .where(eq(schema.signals.status, 'pending'))
        .orderBy(desc(schema.signals.created_at))
        .limit(5)

      // Check for signal ID prefix in the text (first 8 chars)
      for (const ps of pendingSignals) {
        const shortId = ps.id.slice(0, 8)
        const signalAge = Date.now() - new Date(ps.created_at).getTime()
        if (signalAge >= SIGNAL_TTL_MS) continue

        if (text.includes(shortId)) {
          signal = ps
          signalId = signal.id
          break
        }
      }

      // Final fallback: if only one pending signal and it's recent, use it
      if (!signal && pendingSignals.length === 1) {
        const candidate = pendingSignals[0]
        const signalAge = Date.now() - new Date(candidate.created_at).getTime()
        if (signalAge < SIGNAL_TTL_MS) {
          signal = candidate
          signalId = signal.id
        }
      }
    }
  }

  // Store in inbox
  if (text || fileId) {
    const inboxMessage: InboxMessage = {
      update_id: updateId,
      message_id: message.message_id,
      text,
      timestamp: new Date(message.date * 1000).toISOString(),
      chat_id: chatId,
      has_file: !!fileId,
      file_id: fileId,
      file_type: fileType,
      signal_id: signalId,
    }
    storeInboxMessage(inboxMessage)

    const label = fileId ? '[PHOTO] ' : ''
    console.log(`[Poller] Inbox: ${label}${text.slice(0, 50)}...`)
  }

  // Handle commands
  if (text.startsWith('/')) {
    await handleCommand(text, message, telegram)
    return
  }

  // Handle signal responses
  if (signal && text) {
    await handleSignalResponse(signal, text, telegram)
  }
}

/**
 * Handle signal response and spawn continuation agent if needed.
 */
async function handleSignalResponse(
  signal: typeof schema.signals.$inferSelect,
  response: string,
  telegram: TelegramService
): Promise<void> {
  const now = new Date().toISOString()

  // Update signal status
  await db
    .update(schema.signals)
    .set({
      status: 'responded',
      response,
      responded_at: now,
    })
    .where(eq(schema.signals.id, signal.id))

  console.log(`[Poller] Signal ${signal.id.slice(0, 8)} responded: ${response.slice(0, 50)}`)

  // Broadcast SSE event
  broadcast('signal:responded', {
    type: 'signal:responded',
    signal: {
      id: signal.id,
      response,
      status: 'responded',
      responded_at: now,
    },
    timestamp: now,
  })

  // Spawn continuation agents based on signal type
  // Run in background (don't await) so we don't block the poller
  const runWithRetry = async (
    name: string,
    fn: () => Promise<void>,
    signalId: string,
    tg: TelegramService
  ) => {
    try {
      await fn()
    } catch (err) {
      console.error(`[Poller] ${name} continuation failed, retrying in 30s:`, err)
      await new Promise(resolve => setTimeout(resolve, 30_000))
      try {
        await fn()
      } catch (retryErr) {
        console.error(`[Poller] ${name} continuation retry failed:`, retryErr)
        // Mark signal as error
        await db
          .update(schema.signals)
          .set({ status: 'error' })
          .where(eq(schema.signals.id, signalId))
        // Notify user
        tg.sendMessage('Failed to process your response. Please try again or contact the operator.').catch(() => {})
      }
    }
  }

  if (isDiscoverySignal(signal.question)) {
    runWithRetry(
      'Discovery',
      () => runDiscoveryContinuation(signal.question, response, signal.repo_path ?? undefined),
      signal.id,
      telegram
    )
  } else if (isGenesisSignal(signal.question)) {
    runWithRetry(
      'Genesis',
      () => runGenesisContinuation(signal.question, response),
      signal.id,
      telegram
    )
  } else if (isShepherdSignal(signal.question)) {
    runWithRetry(
      'Shepherd',
      () => runShepherdContinuation(signal.question, response, signal.repo_path ?? undefined),
      signal.id,
      telegram
    )
  }
}

/**
 * Handle callback query (button press).
 */
async function handleCallbackQuery(
  query: TelegramCallbackQuery,
  telegram: TelegramService
): Promise<void> {
  const data = query.data ?? ''
  console.log('[Poller] Callback query:', data)

  // Check for signal:uuid:response format
  const signalMatch = data.match(/^signal:([a-f0-9-]+):(.+)$/i)
  if (signalMatch) {
    const [, signalId, response] = signalMatch
    const signal = await db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.id, signalId))
      .limit(1)

    if (signal.length > 0 && signal[0].status === 'pending') {
      await handleSignalResponse(signal[0], response, telegram)
    }

    // Acknowledge callback
    await telegram.answerCallbackQuery(query.id, 'Response recorded')
    return
  }

  // Try matching as option for most recent pending signal
  const pendingSignals = await db
    .select()
    .from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))
    .orderBy(desc(schema.signals.created_at))
    .limit(1)

  if (pendingSignals.length > 0) {
    const signal = pendingSignals[0]
    const options = signal.options ? JSON.parse(signal.options) : []

    if (options.includes(data)) {
      await handleSignalResponse(signal, data, telegram)
      if ('answerCallbackQuery' in telegram) {
        await (telegram as any).answerCallbackQuery(query.id, 'Response recorded')
      }
      return
    }
  }

  // Acknowledge unknown callback
  await telegram.answerCallbackQuery(query.id)
}

/**
 * Handle commands.
 */
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
          `/worktrees - Active worktrees per repo`
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

    case '/worktrees':
    case '/ws':
      await sendWorktreeStatus(telegram)
      break

    default:
      // Unknown command, ignore
      break
  }
}

/**
 * Send system status message.
 */
async function sendStatusMessage(telegram: TelegramService): Promise<void> {
  // Use SQL aggregation instead of loading all tasks into memory
  const taskCounts = await db
    .select({
      status: schema.tasks.status,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.tasks)
    .groupBy(schema.tasks.status)

  const counts: Record<string, number> = {}
  for (const row of taskCounts) {
    counts[row.status] = row.count
  }

  const signalCount = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))

  const message =
    `<b>Mycelium Status</b>\n\n` +
    `<b>Tasks:</b>\n` +
    `  Pending: ${counts['pending'] ?? 0}\n` +
    `  Running: ${counts['running'] ?? 0}\n` +
    `  Completed: ${counts['done'] ?? 0}\n` +
    `  Failed: ${counts['failed'] ?? 0}\n\n` +
    `<b>Signals:</b>\n` +
    `  Pending: ${signalCount[0]?.count ?? 0}`

  await telegram.sendMessage(message)
}

/**
 * Send pending signals message.
 */
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
    message += `<b>${shortId}</b>\n${signal.question.slice(0, 100)}...\n`
    if (options.length > 0) {
      message += `Options: ${options.join(', ')}\n`
    }
    message += '\n'
  }

  await telegram.sendMessage(message)
}

/**
 * Send worktree status per repo.
 */
async function sendWorktreeStatus(telegram: TelegramService): Promise<void> {
  const repos = await queries.getRepos()

  if (repos.length === 0) {
    await telegram.sendMessage('No repos registered.')
    return
  }

  let message = '<b>Worktree Status</b>\n\n'
  let totalWorktrees = 0

  for (const repo of repos) {
    try {
      const proc = spawn({
        cmd: ['git', 'worktree', 'list', '--porcelain'],
        cwd: repo.path,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      })

      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) continue

      // Parse porcelain output - skip the main worktree
      const blocks = stdout.trim().split('\n\n').filter(Boolean)
      const worktrees: Array<{ branch: string; path: string }> = []

      for (const block of blocks) {
        const lines = block.split('\n')
        const pathLine = lines.find(l => l.startsWith('worktree '))
        const branchLine = lines.find(l => l.startsWith('branch '))

        if (pathLine && branchLine) {
          const wPath = pathLine.replace('worktree ', '')
          const branch = branchLine.replace('branch refs/heads/', '')

          // Only show mycelium worktrees
          if (branch.startsWith('mycel/')) {
            worktrees.push({ branch, path: wPath })
          }
        }
      }

      if (worktrees.length > 0) {
        message += `<b>${escapeHtml(repo.name)}</b>\n`

        for (const wt of worktrees) {
          // Get ahead/behind counts
          let statusStr = ''
          try {
            const logProc = spawn({
              cmd: ['git', 'rev-list', '--left-right', '--count', `main...${wt.branch}`],
              cwd: repo.path,
              stdout: 'pipe',
              stderr: 'pipe',
              stdin: 'ignore',
            })
            const logOut = await new Response(logProc.stdout).text()
            const logExit = await logProc.exited

            if (logExit === 0 && logOut.trim()) {
              const [behind, ahead] = logOut.trim().split('\t').map(Number)
              const parts: string[] = []
              if (ahead > 0) parts.push(`${ahead} ahead`)
              if (behind > 0) parts.push(`${behind} behind`)
              statusStr = parts.length > 0 ? ` (${parts.join(', ')})` : ' (synced)'
            }
          } catch {
            // Ignore - branch might not track main
          }

          message += `  <code>${escapeHtml(wt.branch)}</code>${statusStr}\n`
          totalWorktrees++
        }

        message += '\n'
      }
    } catch {
      // Skip repos that fail
    }
  }

  if (totalWorktrees === 0) {
    await telegram.sendMessage('No active worktrees.')
  } else {
    message += `<b>Total:</b> ${totalWorktrees} active worktree${totalWorktrees === 1 ? '' : 's'}`
    await telegram.sendMessage(message)
  }
}

// =============================================================================
// Inbox Management
// =============================================================================

function storeInboxMessage(message: InboxMessage): void {
  inboxMessages.unshift(message)

  // Trim to max size
  while (inboxMessages.length > MAX_INBOX_MESSAGES) {
    inboxMessages.pop()
  }
}

export function getInboxMessages(limit = 20): InboxMessage[] {
  return inboxMessages.slice(0, limit)
}

export function getInboxMessageById(messageId: number): InboxMessage | undefined {
  return inboxMessages.find((m) => m.message_id === messageId)
}

export function clearInbox(): void {
  inboxMessages.length = 0
}

// =============================================================================
// Poller Lifecycle
// =============================================================================

/**
 * Start the Telegram poller.
 */
export function startPoller(telegram: TelegramService): void {
  if (pollerRunning) {
    console.log('[Poller] Already running')
    return
  }

  pollerRunning = true
  const handler = createPollerHandler(telegram)
  telegram.startPolling(handler)
  console.log('[Poller] Started')
}

/**
 * Stop the Telegram poller.
 */
export function stopPoller(telegram: TelegramService): void {
  if (!pollerRunning) {
    return
  }

  pollerRunning = false
  telegram.stopPolling()
  console.log('[Poller] Stopped')
}

/**
 * Check if poller is running.
 */
export function isPollerRunning(): boolean {
  return pollerRunning
}

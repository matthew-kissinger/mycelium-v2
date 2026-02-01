/**
 * Signal and notification CLI commands for Phase 3C.
 *
 * Commands:
 * - align: Send alignment signal for human input
 * - signals: List alignment signals
 * - check: Check for pending signals
 * - notify: Send notification
 * - inbox: View user messages
 * - status: Check Telegram connection status
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { table, success, error, info, warn } from '../output.ts'

/**
 * Signal type from API response
 */
interface Signal {
  id: string
  question: string
  options?: string[]
  status: 'pending' | 'responded' | 'expired'
  response?: string
  task_id?: string
  repo_path?: string
  created_at: string
  responded_at?: string
}

/**
 * Inbox message type from API response
 */
interface InboxMessage {
  update_id: number
  message_id: number
  text: string
  timestamp: string
  chat_id: number
  has_file: boolean
}

/**
 * Connection status from API response
 */
interface ConnectionStatus {
  connected: boolean
  bot_username: string | null
  chat_id: number | null
  last_update_id: number | null
  error?: string
}

/**
 * Notify response from API
 */
interface NotifyResponse {
  success: boolean
  message_id?: number
  error?: string
}

/**
 * Inbox response from API
 */
interface InboxResponse {
  messages: InboxMessage[]
  count: number
  has_more: boolean
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

/**
 * Format a short ID from UUID (first 8 chars)
 */
function shortId(id: string): string {
  return id.slice(0, 8)
}

/**
 * Format relative time from ISO timestamp
 */
function relativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffDay > 0) return `${diffDay}d ago`
  if (diffHour > 0) return `${diffHour}h ago`
  if (diffMin > 0) return `${diffMin}m ago`
  return 'just now'
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Register all signal-related commands on the program
 */
export function registerSignalCommands(program: Command): void {
  // mycel align <question>
  program
    .command('align <question>')
    .description('Send alignment signal for human input')
    .option('-o, --options <choices...>', 'Response options')
    .option('-w, --wait', 'Wait for response (blocking)')
    .option('-t, --timeout <seconds>', 'Max wait time', '3600')
    .option('-r, --repo <path>', 'Repository path')
    .option('--task <id>', 'Task ID')
    .action(async (question: string, options: {
      options?: string[]
      wait?: boolean
      timeout: string
      repo?: string
      task?: string
    }) => {
      try {
        const client = getClient()
        const signal = await client.post<Signal>('/api/align', {
          question,
          options: options.options,
          wait: options.wait ?? false,
          timeout_seconds: parseInt(options.timeout, 10),
          repo_path: options.repo,
          task_id: options.task,
        })

        if (signal.status === 'responded') {
          success(`Signal answered: ${signal.response}`)
        } else if (signal.status === 'expired') {
          warn('Signal timed out waiting for response')
        } else {
          success(`Signal created: ${shortId(signal.id)}`)
          info(`Question: ${signal.question}`)
          if (signal.options && signal.options.length > 0) {
            info(`Options: ${signal.options.join(', ')}`)
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to create signal: ${err.status} ${err.statusText}`)
          if (err.body && typeof err.body === 'object' && 'error' in err.body) {
            error(String((err.body as { error: string }).error))
          }
        } else {
          throw err
        }
      }
    })

  // mycel signals
  program
    .command('signals')
    .description('List alignment signals')
    .option('-p, --pending', 'Show only pending signals')
    .option('-l, --limit <n>', 'Limit results', '20')
    .action(async (options: { pending?: boolean; limit: string }) => {
      try {
        const client = getClient()
        const limit = options.limit

        let signals: Signal[]
        if (options.pending) {
          signals = await client.get<Signal[]>('/api/signals/pending', { limit })
        } else {
          signals = await client.get<Signal[]>('/api/signals', { limit })
        }

        if (signals.length === 0) {
          info('No signals found')
          return
        }

        const rows = signals.map(s => ({
          id: shortId(s.id),
          question: truncate(s.question, 40),
          status: s.status,
          response: s.response ? truncate(s.response, 20) : '-',
          created: relativeTime(s.created_at),
        }))

        table(rows)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to list signals: ${err.status} ${err.statusText}`)
        } else {
          throw err
        }
      }
    })

  // mycel check
  program
    .command('check')
    .description('Check for pending signals')
    .option('--once', 'Only list once, do not poll')
    .action(async (options: { once?: boolean }) => {
      try {
        const client = getClient()

        const listPending = async (): Promise<Signal[]> => {
          return client.get<Signal[]>('/api/signals/pending')
        }

        if (options.once) {
          // Just list pending signals once
          const signals = await listPending()
          if (signals.length === 0) {
            info('No pending signals')
          } else {
            info(`${signals.length} pending signal(s):`)
            const rows = signals.map(s => ({
              id: shortId(s.id),
              question: truncate(s.question, 40),
              options: s.options ? s.options.join(', ') : '-',
              created: relativeTime(s.created_at),
            }))
            table(rows)
          }
          return
        }

        // Poll every 5 seconds until interrupted
        info('Polling for pending signals (Ctrl+C to stop)...')
        let lastCount = -1

        while (true) {
          const signals = await listPending()

          if (signals.length !== lastCount) {
            lastCount = signals.length
            if (signals.length === 0) {
              info('No pending signals')
            } else {
              console.log('') // Blank line for separation
              info(`${signals.length} pending signal(s):`)
              const rows = signals.map(s => ({
                id: shortId(s.id),
                question: truncate(s.question, 40),
                options: s.options ? s.options.join(', ') : '-',
                created: relativeTime(s.created_at),
              }))
              table(rows)
            }
          }

          await sleep(5000)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to check signals: ${err.status} ${err.statusText}`)
        } else {
          throw err
        }
      }
    })

  // mycel notify <message>
  program
    .command('notify <message>')
    .description('Send notification')
    .action(async (message: string) => {
      try {
        const client = getClient()
        const response = await client.post<NotifyResponse>('/api/notify', {
          message,
        })

        if (response.success) {
          success('Notification sent')
          if (response.message_id) {
            info(`Message ID: ${response.message_id}`)
          }
        } else {
          error(`Failed to send notification: ${response.error ?? 'unknown error'}`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to send notification: ${err.status} ${err.statusText}`)
        } else {
          throw err
        }
      }
    })

  // mycel inbox
  program
    .command('inbox')
    .description('View user messages')
    .option('-l, --limit <n>', 'Limit results', '20')
    .action(async (options: { limit: string }) => {
      try {
        const client = getClient()
        const response = await client.get<InboxResponse>('/api/inbox', {
          limit: options.limit,
        })

        if (response.messages.length === 0) {
          info('No messages in inbox')
          return
        }

        const rows = response.messages.map(m => ({
          id: m.message_id,
          message: truncate(m.text, 50),
          file: m.has_file ? '[FILE]' : '-',
          time: relativeTime(m.timestamp),
        }))

        table(rows)

        if (response.has_more) {
          info(`Showing ${response.messages.length} of ${response.count} messages (use --limit for more)`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get inbox: ${err.status} ${err.statusText}`)
        } else {
          throw err
        }
      }
    })

  // mycel status
  program
    .command('status')
    .description('Check Telegram connection status')
    .action(async () => {
      try {
        const client = getClient()
        const status = await client.get<ConnectionStatus>('/api/status')

        if (status.connected) {
          success('Telegram connected')
          if (status.bot_username) {
            info(`Bot: @${status.bot_username}`)
          }
          if (status.chat_id) {
            info(`Chat ID: ${status.chat_id}`)
          }
        } else {
          warn('Telegram not connected')
          if (status.error) {
            info(`Reason: ${status.error}`)
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get status: ${err.status} ${err.statusText}`)
        } else {
          throw err
        }
      }
    })
}

/**
 * Session CLI commands.
 *
 * Implements:
 * - mycel sessions                      - List all sessions
 * - mycel session <id>                  - View session details
 * - mycel session <id> --tail N         - Show last N events
 * - mycel session <id> --search term    - Search within session
 * - mycel trace <task_id>               - Show context trace for task
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, error, info, table, warn } from '../output.ts'

/**
 * Session summary from API
 */
interface SessionSummary {
  task_id: string
  session_id: string
  agent: string
  model?: string
  started_at: string
  completed_at?: string
  event_count: number
}

/**
 * Session event from API
 */
interface SessionEvent {
  event_type: string
  timestamp: string
  content: string
  metadata?: Record<string, unknown>
}

/**
 * Full session from API
 */
interface Session {
  task_id: string
  session_id: string
  agent: string
  model?: string
  started_at: string
  completed_at?: string
  events: SessionEvent[]
}

/**
 * Context trace from API
 */
interface ContextTrace {
  session_id: string
  task_id: string
  agent: string
  model?: string
  layers: ContextLayer[]
  total_tokens?: number
  context_md_path?: string
}

interface ContextLayer {
  name: string
  source: string
  token_count?: number
  content_preview?: string
}

/**
 * Format a short task ID (first 8 characters).
 */
function shortId(id: string): string {
  return id.slice(0, 8)
}

/**
 * Format relative time from ISO timestamp.
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
 * Truncate a string to a maximum length.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

/**
 * Resolve a task ID (supports short IDs).
 */
async function resolveTaskId(idOrPrefix: string): Promise<string> {
  const client = getClient()

  // If it looks like a full UUID, use it directly
  if (idOrPrefix.length === 36 && idOrPrefix.includes('-')) {
    return idOrPrefix
  }

  // Otherwise, try to find a task by prefix
  interface TaskListResponse {
    tasks: { id: string }[]
    total: number
  }
  const response = await client.get<TaskListResponse>('/api/tasks', { limit: '100' })

  const matches = response.tasks.filter((t) => t.id.startsWith(idOrPrefix))

  if (matches.length === 0) {
    throw new Error(`No task found matching ID prefix: ${idOrPrefix}`)
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple tasks match prefix '${idOrPrefix}': ${matches.map((t) => shortId(t.id)).join(', ')}`
    )
  }

  const match = matches[0]
  if (!match) {
    throw new Error(`No task found matching ID prefix: ${idOrPrefix}`)
  }
  return match.id
}

/**
 * Register session-related commands on the program.
 */
export function registerSessionCommands(program: Command): void {
  // mycel sessions - list all sessions
  program
    .command('sessions')
    .description('List captured agent sessions')
    .option('-l, --limit <number>', 'Maximum number of sessions', '20')
    .option('--json', 'Output as JSON')
    .action(async (options: { limit: string; json?: boolean }) => {
      try {
        const client = getClient()

        const sessions = await client.get<SessionSummary[]>('/api/sessions', {
          limit: options.limit,
        })

        if (options.json) {
          json(sessions)
          return
        }

        if (sessions.length === 0) {
          info('No sessions found')
          return
        }

        const rows = sessions.map(s => ({
          task: shortId(s.task_id),
          agent: s.model ? `${s.agent}/${s.model}` : s.agent,
          events: s.event_count,
          started: relativeTime(s.started_at),
        }))

        table(rows)
        console.log(`\nShowing ${sessions.length} sessions`)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            warn('Sessions endpoint not available')
            info('Use task-level sessions: mycel task info <id>')
          } else {
            error(`Failed to list sessions: ${err.message}`)
          }
        } else {
          error(`Failed to list sessions: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel session <id> - view a specific session
  program
    .command('session <task_id>')
    .description('View session details for a task')
    .option('-t, --tail <number>', 'Show last N events')
    .option('-s, --search <term>', 'Search within session')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, options: {
      tail?: string
      search?: string
      json?: boolean
    }) => {
      try {
        const client = getClient()
        const fullTaskId = await resolveTaskId(taskId)

        // Get sessions for this task
        interface TaskSessionsResponse {
          task_id: string
          sessions: Session[]
          count: number
        }
        const response = await client.get<TaskSessionsResponse>(`/api/tasks/${fullTaskId}/sessions`)

        if (response.sessions.length === 0) {
          info(`No sessions found for task ${shortId(fullTaskId)}`)
          return
        }

        // Get the most recent session
        const session = response.sessions[0]
        if (!session) {
          info(`No sessions found for task ${shortId(fullTaskId)}`)
          return
        }

        let events = session.events

        // Apply search filter
        if (options.search) {
          const term = options.search.toLowerCase()
          events = events.filter(e =>
            e.content.toLowerCase().includes(term) ||
            e.event_type.toLowerCase().includes(term)
          )
          if (events.length === 0) {
            info(`No events matching "${options.search}"`)
            return
          }
        }

        // Apply tail limit
        if (options.tail) {
          const tailCount = parseInt(options.tail, 10)
          if (!isNaN(tailCount) && tailCount > 0) {
            events = events.slice(-tailCount)
          }
        }

        if (options.json) {
          json({ ...session, events })
          return
        }

        console.log('')
        console.log(`Session for Task ${shortId(fullTaskId)}`)
        console.log('='.repeat(50))
        console.log(`Agent:   ${session.agent}${session.model ? '/' + session.model : ''}`)
        console.log(`Started: ${session.started_at}`)
        if (session.completed_at) {
          console.log(`Ended:   ${session.completed_at}`)
        }
        console.log(`Events:  ${session.events.length}${options.tail ? ` (showing last ${events.length})` : ''}`)
        if (options.search) {
          console.log(`Filter:  "${options.search}"`)
        }
        console.log('')
        console.log('Events:')
        console.log('-'.repeat(50))

        for (const event of events) {
          const time = new Date(event.timestamp).toLocaleTimeString()
          console.log(`[${time}] ${event.event_type}`)
          // Truncate long content for display
          const content = event.content.replace(/\n/g, ' ').trim()
          if (content) {
            console.log(`         ${truncate(content, 70)}`)
          }
        }

        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get session: ${err.message}`)
        } else {
          error(`Failed to get session: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel trace <task_id> - show context trace
  program
    .command('trace <task_id>')
    .description('Show context trace for a task')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, options: { json?: boolean }) => {
      try {
        const client = getClient()
        const fullTaskId = await resolveTaskId(taskId)

        const context = await client.get<ContextTrace>(`/api/tasks/${fullTaskId}/context`)

        if (options.json) {
          json(context)
          return
        }

        console.log('')
        console.log(`Context Trace for Task ${shortId(fullTaskId)}`)
        console.log('='.repeat(50))

        if (context.session_id) {
          console.log(`Session: ${context.session_id}`)
        }
        console.log(`Agent:   ${context.agent}${context.model ? '/' + context.model : ''}`)
        if (context.total_tokens) {
          console.log(`Tokens:  ${context.total_tokens.toLocaleString()}`)
        }
        console.log('')

        console.log('Context Layers:')
        console.log('-'.repeat(50))

        for (const layer of context.layers) {
          const tokens = layer.token_count ? ` (${layer.token_count} tokens)` : ''
          console.log(`  ${layer.name}${tokens}`)
          console.log(`    Source: ${layer.source}`)
          if (layer.content_preview) {
            console.log(`    Preview: ${truncate(layer.content_preview, 60)}`)
          }
        }

        if (context.context_md_path) {
          console.log('')
          info(`Full context: ${context.context_md_path}`)
        }

        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get context trace: ${err.message}`)
        } else {
          error(`Failed to get context trace: ${err}`)
        }
        process.exit(1)
      }
    })
}

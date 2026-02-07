/**
 * Task logs and export CLI commands.
 *
 * Commands:
 * - mycel logs <task-id>          - Show task output logs
 * - mycel export tasks            - Export tasks as JSON or CSV
 * - mycel export stats            - Export comprehensive stats
 * - mycel export memory           - Export memory patterns and warnings
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, success, error, info } from '../output.ts'
import { writeFileSync } from 'fs'

interface LogEntry {
  chunk: string
  timestamp: string
  stream: string
}

interface LogsResponse {
  task_id: string
  entries: LogEntry[]
  started_at?: string
  completed_at?: string
  status: string
  from_result: boolean
}

/**
 * Resolve a task ID (supports short IDs).
 */
async function resolveTaskId(idOrPrefix: string): Promise<string> {
  const client = getClient()

  if (idOrPrefix.length === 36 && idOrPrefix.includes('-')) {
    return idOrPrefix
  }

  const response = await client.get<{ tasks: { id: string }[]; total: number }>('/api/tasks', { limit: '100' })
  const matches = response.tasks.filter((t) => t.id.startsWith(idOrPrefix))

  if (matches.length === 0) {
    throw new Error(`No task found matching ID prefix: ${idOrPrefix}`)
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple tasks match prefix '${idOrPrefix}': ${matches.map((t) => t.id.slice(0, 8)).join(', ')}`
    )
  }

  const match = matches[0]
  if (!match) {
    throw new Error(`No task found matching ID prefix: ${idOrPrefix}`)
  }
  return match.id
}

export function registerLogsCommands(program: Command): void {
  // ==========================================================================
  // mycel logs <task-id>
  // ==========================================================================
  program
    .command('logs <task-id>')
    .description('Show task output logs')
    .option('-t, --tail <n>', 'Show last N lines')
    .option('-f, --full', 'Show complete output')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, options) => {
      try {
        const client = getClient()
        const resolvedId = await resolveTaskId(taskId)

        const params: Record<string, string> = {}
        if (options.tail) {
          params.limit = options.tail
        }

        const response = await client.get<LogsResponse>(`/api/tasks/${resolvedId}/logs`, params)

        if (options.json) {
          json(response)
          return
        }

        if (!response.entries || response.entries.length === 0) {
          info(`No logs available for task ${taskId}`)
          if (response.status) {
            console.log(`  Status: ${response.status}`)
          }
          return
        }

        // Show header
        console.log(`Task ${taskId} logs (status: ${response.status})`)
        if (response.from_result) {
          console.log('(from stored result)')
        }
        console.log('-'.repeat(60))

        // Show log entries
        const entries = response.entries
        const defaultTail = 50
        const startIdx = !options.full && !options.tail
          ? Math.max(0, entries.length - defaultTail)
          : 0

        for (let i = startIdx; i < entries.length; i++) {
          const entry = entries[i]
          if (!entry) continue
          process.stdout.write(entry.chunk)
        }

        // Ensure newline at end
        const lastEntry = entries[entries.length - 1]
        if (lastEntry && !lastEntry.chunk.endsWith('\n')) {
          console.log('')
        }

        if (startIdx > 0) {
          console.log(`\n(showing last ${entries.length - startIdx} of ${entries.length} entries, use --full for all)`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to get logs: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to get logs: ${err}`)
        }
        process.exit(1)
      }
    })

  // ==========================================================================
  // mycel export <subcommand>
  // ==========================================================================
  const exportCmd = program.command('export').description('Export data')

  // mycel export tasks
  exportCmd
    .command('tasks')
    .description('Export tasks')
    .option('--format <format>', 'Output format (json or csv)', 'json')
    .option('-s, --status <status>', 'Filter by status')
    .option('-r, --repo <path>', 'Filter by repository')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .option('--json', 'Output as JSON (same as --format json)')
    .action(async (options) => {
      try {
        const client = getClient()

        const params: Record<string, string> = {}
        if (options.format) {
          params.format = options.format
        }
        if (options.status) {
          params.status = options.status
        }
        if (options.repo) {
          params.repo_path = options.repo
        }

        if (options.format === 'csv') {
          // For CSV, we need raw response
          const baseUrl = client.baseUrl
          const url = new URL('/api/export/tasks', baseUrl)
          for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v)
          }
          const resp = await fetch(url.toString())
          const text = await resp.text()

          if (options.output) {
            writeFileSync(options.output, text)
            success(`Exported to ${options.output}`)
          } else {
            console.log(text)
          }
        } else {
          const response = await client.get<{
            tasks: unknown[]
            count: number
            exported_at: string
          }>('/api/export/tasks', params)

          if (options.output) {
            writeFileSync(options.output, JSON.stringify(response, null, 2))
            success(`Exported ${response.count} tasks to ${options.output}`)
          } else {
            json(response)
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to export tasks: ${err.message}`)
        } else {
          error(`Failed to export tasks: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel export stats
  exportCmd
    .command('stats')
    .description('Export comprehensive stats')
    .option('--format <format>', 'Output format (json or csv)', 'json')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(async (options) => {
      try {
        const client = getClient()

        const params: Record<string, string> = {}
        if (options.format) {
          params.format = options.format
        }

        if (options.format === 'csv') {
          const baseUrl = client.baseUrl
          const url = new URL('/api/export/stats', baseUrl)
          for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v)
          }
          const resp = await fetch(url.toString())
          const text = await resp.text()

          if (options.output) {
            writeFileSync(options.output, text)
            success(`Exported to ${options.output}`)
          } else {
            console.log(text)
          }
        } else {
          const response = await client.get<Record<string, unknown>>('/api/export/stats', params)

          if (options.output) {
            writeFileSync(options.output, JSON.stringify(response, null, 2))
            success(`Exported stats to ${options.output}`)
          } else {
            json(response)
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to export stats: ${err.message}`)
        } else {
          error(`Failed to export stats: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel export memory
  exportCmd
    .command('memory')
    .description('Export memory patterns and warnings')
    .option('--format <format>', 'Output format (json or csv)', 'json')
    .option('-r, --repo <path>', 'Filter by repository')
    .option('--type <type>', 'Type: patterns, warnings, or all', 'all')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(async (options) => {
      try {
        const client = getClient()

        const params: Record<string, string> = {}
        if (options.format) {
          params.format = options.format
        }
        if (options.repo) {
          params.repo_path = options.repo
        }
        if (options.type) {
          params.type = options.type
        }

        if (options.format === 'csv') {
          const baseUrl = client.baseUrl
          const url = new URL('/api/export/memory', baseUrl)
          for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v)
          }
          const resp = await fetch(url.toString())
          const text = await resp.text()

          if (options.output) {
            writeFileSync(options.output, text)
            success(`Exported to ${options.output}`)
          } else {
            console.log(text)
          }
        } else {
          const response = await client.get<{
            patterns: unknown[]
            warnings: unknown[]
            counts: { patterns: number; warnings: number }
          }>('/api/export/memory', params)

          if (options.output) {
            writeFileSync(options.output, JSON.stringify(response, null, 2))
            success(`Exported memory (${response.counts.patterns} patterns, ${response.counts.warnings} warnings) to ${options.output}`)
          } else {
            json(response)
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to export memory: ${err.message}`)
        } else {
          error(`Failed to export memory: ${err}`)
        }
        process.exit(1)
      }
    })
}

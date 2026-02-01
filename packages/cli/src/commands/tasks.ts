/**
 * Task CLI commands.
 *
 * Implements all task-related commands for the mycel CLI:
 * - mycel stats
 * - mycel tasks [--status] [--repo] [--limit]
 * - mycel task create <title> [options]
 * - mycel task run <id>
 * - mycel task info <id>
 * - mycel task cancel <id>
 * - mycel task delete <id>
 * - mycel task update <id> [options]
 * - mycel task prune [--keep N] [--dry-run]
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { table, json, success, error, info, warn } from '../output.ts'
import type { Task, TaskStatus, AgentType } from '@mycelium/shared'

// Type for API responses
interface StatsResponse {
  total_tasks: number
  pending: number
  running: number
  done: number
  failed: number
  total_cost_usd: number
}

interface TaskListResponse {
  tasks: Task[]
  total: number
}

interface TaskResponse {
  task: Task
}

interface TaskRunResponse {
  message: string
  task: Task
}

interface TaskCancelResponse {
  message: string
  task: Task
}

/**
 * Shorten a UUID for display (first 8 characters).
 */
function shortId(id: string): string {
  return id.slice(0, 8)
}

/**
 * Shorten a path for display.
 */
function shortPath(path: string): string {
  // Show last 2 components
  const parts = path.split('/')
  if (parts.length <= 2) {
    return path
  }
  return '.../' + parts.slice(-2).join('/')
}

/**
 * Format a status for display with consistent width.
 */
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'pending',
    running: 'running',
    done: 'done',
    failed: 'failed',
    cancelled: 'cancelled',
  }
  return statusMap[status] ?? status
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
 * Register all task-related commands on the program.
 */
export function registerTaskCommands(program: Command): void {
  // ============================================================================
  // mycel stats
  // ============================================================================
  program
    .command('stats')
    .description('Show task statistics')
    .action(async () => {
      try {
        const client = getClient()
        const stats = await client.get<StatsResponse>('/api/stats')

        console.log('')
        console.log('Task Statistics')
        console.log('---------------')
        console.log(`Total:     ${stats.total_tasks}`)
        console.log(`Pending:   ${stats.pending}`)
        console.log(`Running:   ${stats.running}`)
        console.log(`Done:      ${stats.done}`)
        console.log(`Failed:    ${stats.failed}`)
        console.log(`Cost:      $${stats.total_cost_usd.toFixed(4)}`)
        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to fetch stats: ${err.message}`)
        } else {
          error(`Failed to fetch stats: ${err}`)
        }
        process.exit(1)
      }
    })

  // ============================================================================
  // mycel tasks [--status] [--repo] [--limit]
  // ============================================================================
  program
    .command('tasks')
    .description('List tasks')
    .option('-s, --status <status>', 'Filter by status (pending, running, done, failed, cancelled)')
    .option('-r, --repo <path>', 'Filter by repository path')
    .option('-l, --limit <number>', 'Maximum number of tasks', '20')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()

        const params: Record<string, string> = {}
        if (options.status) {
          params.status = options.status
        }
        if (options.repo) {
          params.repo_path = options.repo
        }
        if (options.limit) {
          params.limit = options.limit
        }

        const response = await client.get<TaskListResponse>('/api/tasks', params)

        if (options.json) {
          json(response.tasks)
          return
        }

        if (response.tasks.length === 0) {
          info('No tasks found.')
          return
        }

        const rows = response.tasks.map((t) => ({
          id: shortId(t.id),
          title: t.title.length > 40 ? t.title.slice(0, 37) + '...' : t.title,
          status: formatStatus(t.status),
          agent: t.agent ?? '-',
          repo: shortPath(t.repo_path),
        }))

        table(rows)
        console.log(`\nShowing ${response.tasks.length} of ${response.total} tasks`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to fetch tasks: ${err.message}`)
        } else {
          error(`Failed to fetch tasks: ${err}`)
        }
        process.exit(1)
      }
    })

  // ============================================================================
  // mycel task <subcommand>
  // ============================================================================
  const taskCmd = program.command('task').description('Task management commands')

  // --------------------------------------------------------------------------
  // mycel task create <title> [options]
  // --------------------------------------------------------------------------
  taskCmd
    .command('create <title>')
    .description('Create a new task')
    .requiredOption('-r, --repo <path>', 'Repository path')
    .option('-a, --agent <agent>', 'Agent to use (claude, codex, gemini, cline, cursor)')
    .option('-m, --model <model>', 'Model to use')
    .option('-p, --prompt <prompt>', 'Task prompt/specification')
    .option('-d, --depends-on <ids...>', 'Task IDs this task depends on')
    .option('--json', 'Output as JSON')
    .action(async (title: string, options) => {
      try {
        const client = getClient()

        // Resolve dependency IDs if provided
        let dependsOn: string[] = []
        if (options.dependsOn) {
          dependsOn = await Promise.all(
            options.dependsOn.map((id: string) => resolveTaskId(id))
          )
        }

        const body: Record<string, unknown> = {
          title,
          repo_path: options.repo,
        }

        if (options.agent) {
          body.agent = options.agent
        }
        if (options.model) {
          body.model = options.model
        }
        if (options.prompt) {
          body.prompt = options.prompt
        }
        if (dependsOn.length > 0) {
          body.depends_on = dependsOn
        }

        const response = await client.post<TaskResponse>('/api/tasks', body)

        if (options.json) {
          json(response.task)
          return
        }

        success(`Created task ${shortId(response.task.id)}`)
        console.log(`  Title: ${response.task.title}`)
        console.log(`  Repo:  ${response.task.repo_path}`)
        if (response.task.agent) {
          console.log(`  Agent: ${response.task.agent}`)
        }
        if (response.task.model) {
          console.log(`  Model: ${response.task.model}`)
        }
        if (response.task.depends_on.length > 0) {
          console.log(`  Deps:  ${response.task.depends_on.map(shortId).join(', ')}`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to create task: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to create task: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel task run <id>
  // --------------------------------------------------------------------------
  taskCmd
    .command('run <id>')
    .description('Run a pending task')
    .option('-a, --agent <agent>', 'Override agent')
    .option('-m, --model <model>', 'Override model')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      try {
        const client = getClient()
        const taskId = await resolveTaskId(id)

        const body: Record<string, unknown> = {}
        if (options.agent) {
          body.agent = options.agent
        }
        if (options.model) {
          body.model = options.model
        }

        const response = await client.post<TaskRunResponse>(
          `/api/tasks/${taskId}/run`,
          Object.keys(body).length > 0 ? body : undefined
        )

        if (options.json) {
          json(response)
          return
        }

        success(`Task ${shortId(taskId)} started`)
        console.log(`  Status: ${response.task.status}`)
        if (response.task.agent) {
          console.log(`  Agent:  ${response.task.agent}`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to run task: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to run task: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel task info <id>
  // --------------------------------------------------------------------------
  taskCmd
    .command('info <id>')
    .description('Show task details')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      try {
        const client = getClient()
        const taskId = await resolveTaskId(id)

        const response = await client.get<TaskResponse>(`/api/tasks/${taskId}`)
        const task = response.task

        if (options.json) {
          json(task)
          return
        }

        console.log('')
        console.log(`Task: ${shortId(task.id)}`)
        console.log('='.repeat(50))
        console.log(`Title:      ${task.title}`)
        console.log(`Status:     ${formatStatus(task.status)}`)
        console.log(`Repo:       ${task.repo_path}`)
        console.log(`Agent:      ${task.agent ?? '-'}`)
        console.log(`Model:      ${task.model ?? '-'}`)
        console.log(`Sequenced:  ${task.sequenced ? 'yes' : 'no'}`)
        console.log(`Created:    ${task.created_at}`)

        if (task.started_at) {
          console.log(`Started:    ${task.started_at}`)
        }
        if (task.completed_at) {
          console.log(`Completed:  ${task.completed_at}`)
        }
        if (task.duration_seconds !== undefined && task.duration_seconds !== null) {
          console.log(`Duration:   ${task.duration_seconds}s`)
        }
        if (task.cost_usd > 0) {
          console.log(`Cost:       $${task.cost_usd.toFixed(4)}`)
        }

        if (task.depends_on.length > 0) {
          console.log(`Depends on: ${task.depends_on.map(shortId).join(', ')}`)
        }

        if (task.prompt) {
          console.log('')
          console.log('Prompt:')
          console.log('-'.repeat(50))
          console.log(task.prompt)
        }

        if (task.result) {
          console.log('')
          console.log('Result:')
          console.log('-'.repeat(50))
          // Truncate very long results
          const maxLen = 2000
          if (task.result.length > maxLen) {
            console.log(task.result.slice(0, maxLen) + '\n... (truncated)')
          } else {
            console.log(task.result)
          }
        }

        if (task.error) {
          console.log('')
          console.log('Error:')
          console.log('-'.repeat(50))
          console.log(task.error)
        }

        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get task info: ${err.message}`)
        } else {
          error(`Failed to get task info: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel task cancel <id>
  // --------------------------------------------------------------------------
  taskCmd
    .command('cancel <id>')
    .description('Cancel a running task')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      try {
        const client = getClient()
        const taskId = await resolveTaskId(id)

        const response = await client.post<TaskCancelResponse>(`/api/tasks/${taskId}/cancel`)

        if (options.json) {
          json(response)
          return
        }

        success(`Task ${shortId(taskId)} cancelled`)
        console.log(`  Status: ${response.task.status}`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to cancel task: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to cancel task: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel task delete <id>
  // --------------------------------------------------------------------------
  taskCmd
    .command('delete <id>')
    .description('Delete a task')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id: string, options) => {
      try {
        const client = getClient()
        const taskId = await resolveTaskId(id)

        // Get task info first
        const infoResponse = await client.get<TaskResponse>(`/api/tasks/${taskId}`)
        const task = infoResponse.task

        if (!options.force) {
          warn(`About to delete task: ${shortId(taskId)} - "${task.title}"`)
          console.log('Use --force to skip this warning')
          // In a real CLI we'd prompt for confirmation, but for now just show warning
        }

        await client.delete(`/api/tasks/${taskId}`)
        success(`Deleted task ${shortId(taskId)}`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to delete task: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to delete task: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel task update <id> [options]
  // --------------------------------------------------------------------------
  taskCmd
    .command('update <id>')
    .description('Update a task')
    .option('-a, --agent <agent>', 'Set agent')
    .option('-m, --model <model>', 'Set model')
    .option('-s, --status <status>', 'Set status')
    .option('-d, --depends-on <ids...>', 'Set dependencies')
    .option('--clear-deps', 'Clear all dependencies')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      try {
        const client = getClient()
        const taskId = await resolveTaskId(id)

        const body: Record<string, unknown> = {}

        if (options.agent) {
          body.agent = options.agent
        }
        if (options.model) {
          body.model = options.model
        }
        if (options.status) {
          body.status = options.status
        }
        if (options.clearDeps) {
          body.clear_deps = true
        } else if (options.dependsOn) {
          // Resolve dependency IDs
          body.depends_on = await Promise.all(
            options.dependsOn.map((depId: string) => resolveTaskId(depId))
          )
        }

        if (Object.keys(body).length === 0) {
          error('No update options provided. Use --help to see available options.')
          process.exit(1)
        }

        const response = await client.patch<TaskResponse>(`/api/tasks/${taskId}`, body)

        if (options.json) {
          json(response.task)
          return
        }

        success(`Updated task ${shortId(taskId)}`)
        console.log(`  Status: ${response.task.status}`)
        if (response.task.agent) {
          console.log(`  Agent:  ${response.task.agent}`)
        }
        if (response.task.model) {
          console.log(`  Model:  ${response.task.model}`)
        }
        if (response.task.depends_on.length > 0) {
          console.log(`  Deps:   ${response.task.depends_on.map(shortId).join(', ')}`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to update task: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to update task: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel task prune [--keep N] [--dry-run]
  // --------------------------------------------------------------------------
  taskCmd
    .command('prune')
    .description('Delete old completed tasks')
    .option('-k, --keep <number>', 'Number of completed tasks to keep', '50')
    .option('-n, --dry-run', 'Show what would be deleted without deleting')
    .action(async (options) => {
      try {
        const client = getClient()
        const keepCount = parseInt(options.keep, 10)

        if (isNaN(keepCount) || keepCount < 0) {
          error('--keep must be a non-negative number')
          process.exit(1)
        }

        // Get all completed tasks, sorted by completion time (newest first)
        const response = await client.get<TaskListResponse>('/api/tasks', {
          status: 'done',
          limit: '1000',
        })

        const completedTasks = response.tasks

        // Sort by completed_at (newest first)
        completedTasks.sort((a, b) => {
          const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0
          const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0
          return bTime - aTime
        })

        // Tasks to delete (all after keepCount)
        const toDelete = completedTasks.slice(keepCount)

        if (toDelete.length === 0) {
          info(`No tasks to prune (keeping ${keepCount}, have ${completedTasks.length} completed)`)
          return
        }

        if (options.dryRun) {
          info(`Would delete ${toDelete.length} tasks:`)
          for (const task of toDelete) {
            console.log(`  ${shortId(task.id)} - ${task.title}`)
          }
          return
        }

        // Delete tasks
        let deleted = 0
        let errors = 0

        for (const task of toDelete) {
          try {
            await client.delete(`/api/tasks/${task.id}`)
            deleted++
          } catch {
            errors++
          }
        }

        success(`Pruned ${deleted} tasks`)
        if (errors > 0) {
          warn(`Failed to delete ${errors} tasks`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to prune tasks: ${err.message}`)
        } else {
          error(`Failed to prune tasks: ${err}`)
        }
        process.exit(1)
      }
    })
}

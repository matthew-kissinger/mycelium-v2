/**
 * Sequencer CLI commands.
 *
 * Implements:
 * - mycel sequence [repo_path] - Run sequencer to analyze task dependencies
 * - mycel sequence --dry-run   - Preview without applying
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, success, error, info, table } from '../output.ts'

/**
 * Sequencer run response from API
 */
interface SequencerRunResponse {
  status: string
  repo_path?: string
  tasks_analyzed: number
  dependencies_added: number
  dry_run: boolean
  results?: DependencyResult[]
}

interface DependencyResult {
  task_id: string
  task_title: string
  added_dependencies: string[]
  reason: string
}

/**
 * Sequencer status response from API
 */
interface SequencerStatusResponse {
  repo_path?: string
  last_run?: {
    timestamp: string
    tasks_analyzed: number
    dependencies_added: number
  }
  message: string
}

/**
 * Register sequencer-related commands on the program.
 */
export function registerSequenceCommands(program: Command): void {
  program
    .command('sequence [repo_path]')
    .description('Run Sequencer to analyze tasks and wire dependencies')
    .option('-n, --dry-run', 'Preview without applying changes')
    .option('--json', 'Output as JSON')
    .action(async (repoPath: string | undefined, options: { dryRun?: boolean; json?: boolean }) => {
      try {
        const client = getClient()

        // Build query params
        const params: Record<string, string> = {}
        if (repoPath) {
          params.repo_path = repoPath
        }
        if (options.dryRun) {
          params.dry_run = 'true'
        }

        // First check status
        const status = await client.get<SequencerStatusResponse>('/api/sequencer/status', params)

        if (options.json && !options.dryRun) {
          // If just checking status with --json, show status
          const response = await client.post<SequencerRunResponse>('/api/sequencer/run', {
            repo_path: repoPath,
            dry_run: options.dryRun ?? false,
          })
          json(response)
          return
        }

        // Run the sequencer
        info(`Running Sequencer${repoPath ? ` for ${repoPath}` : ''}...`)
        if (options.dryRun) {
          info('(dry run - no changes will be applied)')
        }

        const response = await client.post<SequencerRunResponse>('/api/sequencer/run', {
          repo_path: repoPath,
          dry_run: options.dryRun ?? false,
        })

        if (options.json) {
          json(response)
          return
        }

        console.log('')
        console.log(`Tasks analyzed:      ${response.tasks_analyzed}`)
        console.log(`Dependencies added:  ${response.dependencies_added}`)

        if (response.results && response.results.length > 0) {
          console.log('')
          info('Dependency changes:')
          const rows = response.results.map(r => ({
            task: r.task_title.length > 30 ? r.task_title.slice(0, 27) + '...' : r.task_title,
            added: r.added_dependencies.length,
            reason: r.reason.length > 40 ? r.reason.slice(0, 37) + '...' : r.reason,
          }))
          table(rows)
        }

        if (options.dryRun) {
          console.log('')
          info('No changes applied (dry run)')
        } else if (response.dependencies_added > 0) {
          console.log('')
          success('Dependencies wired successfully')
        } else {
          console.log('')
          info('No new dependencies needed')
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            error('Sequencer endpoint not available in API')
            info('Ensure backend is running with sequencer support')
          } else {
            error(`Sequencer failed: ${err.message}`)
          }
        } else {
          error(`Sequencer failed: ${err}`)
        }
        process.exit(1)
      }
    })
}

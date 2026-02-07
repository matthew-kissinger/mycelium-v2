/**
 * System agent trigger CLI commands.
 *
 * Commands:
 * - mycel trigger discovery    - Trigger discovery cycle
 * - mycel trigger shepherd     - Trigger shepherd evaluation
 * - mycel trigger digest       - Trigger digest cycle
 * - mycel trigger compaction   - Trigger compaction cycle
 * - mycel trigger armory       - Trigger armory scan
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, success, error, info } from '../output.ts'

export function registerTriggerCommands(program: Command): void {
  const trigger = program
    .command('trigger')
    .description('Trigger system agent cycles manually')

  // mycel trigger discovery
  trigger
    .command('discovery')
    .description('Trigger discovery cycle')
    .option('-r, --repo <path>', 'Specific repo to scan')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()

        const body: Record<string, unknown> = {}
        if (options.repo) {
          body.repo_path = options.repo
        }

        const response = await client.post<{
          message: string
          run: { id: string; repo_path: string }
        }>('/api/discovery/trigger', body)

        if (options.json) {
          json(response)
          return
        }

        success('Discovery triggered')
        console.log(`  Repo: ${response.run.repo_path}`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to trigger discovery: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to trigger discovery: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel trigger shepherd
  trigger
    .command('shepherd')
    .description('Trigger shepherd evaluation')
    .requiredOption('-r, --repo <path>', 'Repository to evaluate')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()

        const response = await client.post<{
          message: string
          repo_path: string
        }>('/api/shepherd/trigger', { repo_path: options.repo })

        if (options.json) {
          json(response)
          return
        }

        success('Shepherd triggered')
        console.log(`  Repo: ${response.repo_path}`)

        // Also show pending evaluation count
        try {
          const status = await client.get<{
            total_unevaluated: number
            repos: Record<string, { unevaluated: number }>
          }>('/api/shepherd/status')
          console.log(`  Pending evaluations: ${status.total_unevaluated}`)
        } catch {
          // Non-critical, ignore
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to trigger shepherd: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to trigger shepherd: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel trigger digest
  trigger
    .command('digest')
    .description('Trigger digest cycle')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()

        const response = await client.post<{ message: string }>('/api/digest/trigger')

        if (options.json) {
          json(response)
          return
        }

        success('Digest triggered')
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to trigger digest: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to trigger digest: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel trigger compaction
  trigger
    .command('compaction')
    .description('Trigger compaction cycle')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()

        const response = await client.post<{
          message: string
          config: Record<string, unknown>
        }>('/api/compaction/trigger')

        if (options.json) {
          json(response)
          return
        }

        success('Compaction triggered')
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to trigger compaction: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to trigger compaction: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel trigger armory
  trigger
    .command('armory')
    .description('Trigger armory scan')
    .option('--force', 'Force scan even if threshold not met')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()

        const path = options.force
          ? '/api/inventory/armory?force=true'
          : '/api/inventory/armory'

        const response = await client.post<{
          message: string
          force?: boolean
          threshold?: number
        }>(path)

        if (options.json) {
          json(response)
          return
        }

        success('Armory scan triggered')
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string; threshold?: number } | undefined
          if (err.status === 400 && body?.threshold) {
            info(`Not enough tasks for armory scan (threshold: ${body.threshold})`)
            info('Use --force to override')
          } else {
            error(`Failed to trigger armory: ${body?.error ?? err.message}`)
          }
        } else {
          error(`Failed to trigger armory: ${err}`)
        }
        process.exit(1)
      }
    })
}

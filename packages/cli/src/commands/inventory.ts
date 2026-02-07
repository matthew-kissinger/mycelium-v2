/**
 * Inventory CLI commands.
 *
 * Commands:
 * - mycel inventory           - Show inventory summary
 * - mycel inventory skills    - List installed skills
 * - mycel inventory mcps      - List MCP servers
 * - mycel inventory scan      - Trigger armory scan
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { table, json, success, error, info } from '../output.ts'

interface Skill {
  name: string
  description?: string
  source?: string
}

interface McpServer {
  name: string
  agents?: string[]
  command?: string
}

interface InventoryResponse {
  skills: Skill[]
  mcps: McpServer[]
  skills_count: number
  mcps_count: number
}

export function registerInventoryCommands(program: Command): void {
  const inventory = program
    .command('inventory')
    .description('Skill and MCP server inventory')

  // mycel inventory (default - summary)
  inventory
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const response = await client.get<InventoryResponse>('/api/inventory')

        if (options.json) {
          json(response)
          return
        }

        console.log('')
        console.log('Inventory Summary')
        console.log('=================')
        console.log(`Skills: ${response.skills_count}`)
        console.log(`MCP Servers: ${response.mcps_count}`)

        // Show armory status
        try {
          const armoryStatus = await client.get<{
            enabled: boolean
            batch_size: number
            ready_to_run: boolean
          }>('/api/inventory/armory/status')
          console.log('')
          console.log('Armory:')
          console.log(`  Enabled: ${armoryStatus.enabled ? 'yes' : 'no'}`)
          console.log(`  Batch size: ${armoryStatus.batch_size}`)
          console.log(`  Ready to scan: ${armoryStatus.ready_to_run ? 'yes' : 'no'}`)
        } catch {
          // Non-critical
        }
        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get inventory: ${err.message}`)
        } else {
          error(`Failed to get inventory: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel inventory skills
  inventory
    .command('skills')
    .description('List installed skills')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const response = await client.get<{ skills: Skill[]; count: number }>('/api/inventory/skills')

        if (options.json) {
          json(response)
          return
        }

        if (response.skills.length === 0) {
          info('No skills installed.')
          return
        }

        const rows = response.skills.map((s) => ({
          name: s.name,
          description: s.description
            ? (s.description.length > 50 ? s.description.slice(0, 47) + '...' : s.description)
            : '-',
          source: s.source ?? '-',
        }))

        table(rows)
        console.log(`\n${response.count} skills`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get skills: ${err.message}`)
        } else {
          error(`Failed to get skills: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel inventory mcps
  inventory
    .command('mcps')
    .description('List MCP servers')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const response = await client.get<{ mcps: McpServer[]; count: number }>('/api/inventory/mcps')

        if (options.json) {
          json(response)
          return
        }

        if (response.mcps.length === 0) {
          info('No MCP servers configured.')
          return
        }

        const rows = response.mcps.map((m) => ({
          name: m.name,
          agents: m.agents?.join(', ') ?? '-',
          command: m.command ?? '-',
        }))

        table(rows)
        console.log(`\n${response.count} MCP servers`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get MCP servers: ${err.message}`)
        } else {
          error(`Failed to get MCP servers: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel inventory scan
  inventory
    .command('scan')
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
            error(`Failed to trigger scan: ${body?.error ?? err.message}`)
          }
        } else {
          error(`Failed to trigger scan: ${err}`)
        }
        process.exit(1)
      }
    })
}

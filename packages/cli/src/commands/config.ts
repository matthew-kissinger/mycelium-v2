/**
 * Config management CLI commands.
 *
 * Commands:
 * - mycel config agents                        - List all agent configs
 * - mycel config agents <name>                 - Show specific agent config
 * - mycel config agents <name> set <key> <value> - Update agent config
 * - mycel config prompts                       - List all prompts
 * - mycel config prompts <id>                  - Show prompt content
 * - mycel config prompts <id> reset            - Reset prompt to default
 * - mycel config hooks                         - Show hooks config
 * - mycel config history                       - Show config change history
 *
 * Note: config show/set are already in runner.ts.
 * This file extends config with agents, prompts, hooks, and history subcommands.
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { table, json, success, error, info } from '../output.ts'

interface AgentConfig {
  enabled?: boolean
  timeout_seconds?: number
  max_turns?: number
  default_model?: string | null
  description?: string
  command?: string
  supports_streaming?: boolean
}

interface PromptEntry {
  id: string
  name?: string
  description?: string
  content?: string
}

interface HistoryEntry {
  key: string
  value: unknown
  updated_at: string
  previous_value?: unknown
}

/**
 * Register config management commands.
 * Called after registerRunnerCommands so we add subcommands to the existing 'config' command.
 */
export function registerConfigCommands(program: Command): void {
  // Find the existing 'config' command registered by runner.ts
  let config = program.commands.find((c) => c.name() === 'config')

  // If not found, create it (defensive)
  if (!config) {
    config = program.command('config').description('Configuration management')
  }

  // --------------------------------------------------------------------------
  // mycel config agents [name]
  // --------------------------------------------------------------------------
  const agentsCmd = config
    .command('agents [name]')
    .description('List or show agent configurations')
    .option('--json', 'Output as JSON')
    .action(async (name: string | undefined, options: { json?: boolean }) => {
      try {
        const client = getClient()

        if (name) {
          // Show specific agent
          const response = await client.get<{
            name: string
            config: AgentConfig
          }>(`/api/config/agents/${name}`)

          if (options.json) {
            json(response)
            return
          }

          console.log('')
          console.log(`Agent: ${response.name}`)
          console.log('='.repeat(40))
          const cfg = response.config
          for (const [key, value] of Object.entries(cfg)) {
            if (value !== undefined && value !== null) {
              console.log(`  ${key}: ${value}`)
            }
          }
          console.log('')
        } else {
          // List all agents
          const response = await client.get<{
            agents: Record<string, AgentConfig>
            enabled_count: number
            total_count: number
          }>('/api/config/agents')

          if (options.json) {
            json(response)
            return
          }

          const rows = Object.entries(response.agents).map(([agentName, cfg]) => ({
            name: agentName,
            enabled: cfg.enabled ?? true ? 'yes' : 'no',
            model: cfg.default_model ?? '-',
            timeout: cfg.timeout_seconds ? `${cfg.timeout_seconds}s` : '-',
          }))

          table(rows)
          console.log(`\n${response.enabled_count}/${response.total_count} agents enabled`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to get agent config: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to get agent config: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel config agents <name> set <key> <value>
  agentsCmd
    .command('set <key> <value>')
    .description('Update an agent config field')
    .action(async (key: string, value: string, _opts: unknown, cmd: Command) => {
      try {
        const client = getClient()

        // Get agent name from parent args
        const agentName = cmd.parent?.args?.[0]
        if (!agentName) {
          error('Agent name is required: mycel config agents <name> set <key> <value>')
          process.exit(1)
        }

        // Parse value
        let parsedValue: unknown = value
        if (value === 'true') parsedValue = true
        else if (value === 'false') parsedValue = false
        else if (value === 'null') parsedValue = null
        else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10)
        else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value)

        const payload = { [key]: parsedValue }

        const response = await client.patch<{
          message: string
          name: string
          config: AgentConfig
        }>(`/api/config/agents/${agentName}`, payload)

        success(`Agent ${agentName} config updated: ${key} = ${value}`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to update agent config: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to update agent config: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel config prompts [id]
  // --------------------------------------------------------------------------
  const promptsCmd = config
    .command('prompts [id]')
    .description('List or show prompt configurations')
    .option('--json', 'Output as JSON')
    .action(async (id: string | undefined, options: { json?: boolean }) => {
      try {
        const client = getClient()

        if (id) {
          // Show specific prompt
          const response = await client.get<PromptEntry>(`/api/prompts/${id}`)

          if (options.json) {
            json(response)
            return
          }

          console.log('')
          console.log(`Prompt: ${id}`)
          console.log('='.repeat(50))
          if (response.description) {
            console.log(`Description: ${response.description}`)
          }
          console.log('')
          if (response.content) {
            // Truncate very long prompts
            const maxLen = 3000
            if (response.content.length > maxLen) {
              console.log(response.content.slice(0, maxLen) + '\n... (truncated)')
            } else {
              console.log(response.content)
            }
          }
          console.log('')
        } else {
          // List all prompts
          const response = await client.get<{ prompts: PromptEntry[] }>('/api/prompts')

          if (options.json) {
            json(response)
            return
          }

          if (!response.prompts || response.prompts.length === 0) {
            info('No prompts found.')
            return
          }

          const rows = response.prompts.map((p) => ({
            id: p.id,
            name: p.name ?? '-',
            description: p.description
              ? (p.description.length > 50 ? p.description.slice(0, 47) + '...' : p.description)
              : '-',
          }))

          table(rows)
          console.log(`\n${response.prompts.length} prompts`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to get prompts: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to get prompts: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel config prompts <id> reset
  promptsCmd
    .command('reset')
    .description('Reset prompt to its default content')
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        const client = getClient()

        const promptId = cmd.parent?.args?.[0]
        if (!promptId) {
          error('Prompt ID is required: mycel config prompts <id> reset')
          process.exit(1)
        }

        await client.post<{ message: string }>(`/api/prompts/${promptId}/reset`)
        success(`Prompt '${promptId}' reset to default`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to reset prompt: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to reset prompt: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel config hooks
  // --------------------------------------------------------------------------
  config
    .command('hooks')
    .description('Show hooks configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const response = await client.get<{
          config: Record<string, unknown>
          hooks_summary: Record<string, number>
          total_hooks: number
        }>('/api/config/hooks')

        if (options.json) {
          json(response)
          return
        }

        console.log('')
        console.log('Hooks Configuration')
        console.log('===================')
        console.log(`Total hooks: ${response.total_hooks}`)
        console.log('')

        if (Object.keys(response.hooks_summary).length > 0) {
          console.log('By type:')
          for (const [type, count] of Object.entries(response.hooks_summary)) {
            console.log(`  ${type}: ${count} active`)
          }
        } else {
          info('No hooks configured.')
        }
        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get hooks config: ${err.message}`)
        } else {
          error(`Failed to get hooks config: ${err}`)
        }
        process.exit(1)
      }
    })

  // --------------------------------------------------------------------------
  // mycel config history
  // --------------------------------------------------------------------------
  config
    .command('history')
    .description('Show config change history')
    .option('-l, --limit <number>', 'Maximum entries', '20')
    .option('-k, --key <key>', 'Filter by config key')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()

        const params: Record<string, string> = {}
        if (options.limit) {
          params.limit = options.limit
        }
        if (options.key) {
          params.key = options.key
        }

        const response = await client.get<{
          history: HistoryEntry[]
          total: number
        }>('/api/config/history', params)

        if (options.json) {
          json(response)
          return
        }

        if (!response.history || response.history.length === 0) {
          info('No config changes recorded.')
          return
        }

        const rows = response.history.map((entry) => ({
          key: entry.key,
          value: typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value),
          updated_at: entry.updated_at,
        }))

        table(rows)
        console.log(`\nShowing ${response.history.length} of ${response.total} entries`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get config history: ${err.message}`)
        } else {
          error(`Failed to get config history: ${err}`)
        }
        process.exit(1)
      }
    })
}

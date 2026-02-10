/**
 * Registry CLI commands.
 *
 * Commands:
 * - mycel registry                           - Full matrix view
 * - mycel registry agents                    - List agents + status + version
 * - mycel registry providers                 - List providers + credits + status
 * - mycel registry models [--agent X] [--free] - List models
 * - mycel registry detect                    - Trigger CLI detection
 * - mycel registry refresh                   - Trigger full refresh
 * - mycel registry health                    - Health summary
 * - mycel registry fallback <agent> <model>  - Show fallback chain
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { table, json, success, error, info } from '../output.ts'

interface AgentRow {
  id: string
  command: string
  cli_version: string | null
  status: string | null
  enabled: boolean | null
  default_model: string | null
  default_provider: string | null
}

interface ProviderRow {
  id: string
  name: string
  billing: string
  status: string | null
  credits_info: string | null
  models_fetched_at: string | null
}

interface ModelRow {
  id: string
  model_id: string
  provider_id: string
  short_name: string | null
  context_window: number | null
  free: boolean | null
}

interface MatrixEntry {
  agent: string
  command: string
  enabled: boolean
  status: string
  default_model: string | null
  default_provider: string | null
  models: ModelRow[]
}

export function registerRegistryCommands(program: Command): void {
  const registry = program
    .command('registry')
    .description('Agent/provider/model registry')

  // mycel registry (default - matrix view)
  registry
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const matrix = await client.get<MatrixEntry[]>('/api/registry/matrix')

        if (options.json) {
          json(matrix)
          return
        }

        console.log('')
        console.log('Agent Registry Matrix')
        console.log('=====================')
        console.log('')

        const rows = matrix.map((a) => ({
          agent: a.agent,
          command: a.command,
          status: a.enabled ? (a.status ?? 'unknown') : 'disabled',
          model: a.default_model ?? '-',
          provider: a.default_provider ?? '-',
          models: a.models.length,
        }))
        table(rows)
        console.log(`\n${matrix.length} agents`)
      } catch (err) {
        handleError(err, 'registry matrix')
      }
    })

  // mycel registry agents
  registry
    .command('agents')
    .description('List agents with status and version')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const agents = await client.get<AgentRow[]>('/api/registry/agents')

        if (options.json) {
          json(agents)
          return
        }

        const rows = agents.map((a) => ({
          id: a.id,
          command: a.command,
          version: a.cli_version ?? '-',
          status: a.status ?? 'unknown',
          enabled: a.enabled ? 'yes' : 'no',
          model: a.default_model ?? '-',
        }))
        table(rows)
        console.log(`\n${agents.length} agents`)
      } catch (err) {
        handleError(err, 'agents')
      }
    })

  // mycel registry providers
  registry
    .command('providers')
    .description('List providers with status and credits')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const providers = await client.get<ProviderRow[]>('/api/registry/providers')

        if (options.json) {
          json(providers)
          return
        }

        const rows = providers.map((p) => {
          let credits = '-'
          if (p.credits_info) {
            try {
              const info = JSON.parse(p.credits_info)
              credits = info.balance ? `$${info.balance}` : JSON.stringify(info).slice(0, 30)
            } catch { /* ignore */ }
          }
          return {
            id: p.id,
            name: p.name,
            billing: p.billing,
            status: p.status ?? 'unknown',
            credits,
            fetched: p.models_fetched_at ? new Date(p.models_fetched_at).toLocaleDateString() : '-',
          }
        })
        table(rows)
        console.log(`\n${providers.length} providers`)
      } catch (err) {
        handleError(err, 'providers')
      }
    })

  // mycel registry models
  registry
    .command('models')
    .description('List models')
    .option('--agent <agent>', 'Filter by agent')
    .option('--provider <provider>', 'Filter by provider')
    .option('--free', 'Show only free models')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const params = new URLSearchParams()
        if (options.agent) params.set('agent', options.agent)
        if (options.provider) params.set('provider', options.provider)
        if (options.free) params.set('free', 'true')

        const qs = params.toString()
        const url = `/api/registry/models${qs ? `?${qs}` : ''}`
        const models = await client.get<ModelRow[]>(url)

        if (options.json) {
          json(models)
          return
        }

        if (models.length === 0) {
          info('No models found.')
          return
        }

        const rows = models.map((m) => ({
          id: m.model_id,
          provider: m.provider_id,
          name: m.short_name ?? '-',
          context: m.context_window ? `${(m.context_window / 1000).toFixed(0)}k` : '-',
          free: m.free ? 'yes' : 'no',
        }))
        table(rows)
        console.log(`\n${models.length} models`)
      } catch (err) {
        handleError(err, 'models')
      }
    })

  // mycel registry detect
  registry
    .command('detect')
    .description('Trigger CLI agent detection')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        info('Detecting agent CLIs...')
        const result = await client.post<any>('/api/registry/detect')

        if (options.json) {
          json(result)
          return
        }

        if (result.agents) {
          const rows = result.agents.map((a: any) => ({
            agent: a.id,
            status: a.status,
            version: a.version ?? '-',
          }))
          table(rows)
        }
        success(`Detected ${result.detected ?? 0} agents, ${result.unavailable ?? 0} unavailable`)
      } catch (err) {
        handleError(err, 'detection')
      }
    })

  // mycel registry refresh
  registry
    .command('refresh')
    .description('Trigger full registry refresh (detection + model fetch)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        info('Triggering registry refresh...')
        const result = await client.post<{ status: string; message: string }>('/api/registry/refresh')

        if (options.json) {
          json(result)
          return
        }

        success(result.message)
      } catch (err) {
        handleError(err, 'refresh')
      }
    })

  // mycel registry health
  registry
    .command('health')
    .description('Show health summary')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const health = await client.get<Record<string, {
          status: string
          errorCount: number
          successCount: number
          lastError?: string
          quotaResetAt?: string
        }>>('/api/registry/health')

        if (options.json) {
          json(health)
          return
        }

        const entries = Object.entries(health)
        if (entries.length === 0) {
          info('No health data available.')
          return
        }

        const rows = entries.map(([key, h]) => ({
          agent: key,
          status: h.status,
          success: h.successCount,
          errors: h.errorCount,
          'last error': h.lastError ? (h.lastError.length > 40 ? h.lastError.slice(0, 37) + '...' : h.lastError) : '-',
        }))
        table(rows)
      } catch (err) {
        handleError(err, 'health')
      }
    })

  // mycel registry fallback <agent> <model>
  registry
    .command('fallback <agent> <model>')
    .description('Show fallback chain for agent+model')
    .option('--json', 'Output as JSON')
    .action(async (agent, model, options) => {
      try {
        const client = getClient()
        const result = await client.get<{ agent: string; model: string; chain: string[] }>(
          `/api/registry/fallback/${agent}/${model}`
        )

        if (options.json) {
          json(result)
          return
        }

        if (result.chain.length === 0) {
          info(`No fallback chain for ${agent}/${model}`)
          return
        }

        console.log(`\nFallback chain for ${agent}/${model}:`)
        console.log(`  ${model} -> ${result.chain.join(' -> ')}`)
        console.log('')
      } catch (err) {
        handleError(err, 'fallback')
      }
    })
}

function handleError(err: unknown, context: string): void {
  if (err instanceof ApiError) {
    error(`Failed to get ${context}: ${err.message}`)
  } else {
    error(`Failed to get ${context}: ${err}`)
  }
  process.exit(1)
}

/**
 * Genesis CLI commands.
 *
 * Implements:
 * - mycel genesis              - Show genesis status/help
 * - mycel genesis create       - Create new repo from description
 * - mycel genesis auto         - Analyze network, propose new repos
 * - mycel genesis config       - Show genesis configuration
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, success, error, info, table, warn } from '../output.ts'

/**
 * Genesis create response from API
 */
interface GenesisCreateResponse {
  status: string
  repo_path: string
  repo_name: string
  description: string
  language: string
  github_url?: string
}

/**
 * Genesis auto response from API
 */
interface GenesisAutoResponse {
  status: string
  proposals: GenesisProposal[]
  created?: GenesisCreateResponse[]
}

interface GenesisProposal {
  name: string
  description: string
  language: string
  reason: string
}

/**
 * Genesis config from API
 */
interface GenesisConfig {
  enabled: boolean
  auto_create: boolean
  repos_dir: string
  default_language?: string
}

/**
 * Register genesis-related commands on the program.
 */
export function registerGenesisCommands(program: Command): void {
  const genesis = program
    .command('genesis')
    .description('Create new repositories with agent plumbing')

  // Default action (show status/help)
  genesis.action(async () => {
    console.log('')
    console.log('Genesis - Repository Creation')
    console.log('==============================')
    console.log('')
    console.log('Create new repositories with agent plumbing pre-configured.')
    console.log('')
    console.log('Commands:')
    console.log('  mycel genesis create "description"     Create repo from description')
    console.log('  mycel genesis create "desc" --private  Create private repo')
    console.log('  mycel genesis auto                     Analyze network, propose repos')
    console.log('  mycel genesis auto --create            Create proposals directly')
    console.log('  mycel genesis config                   Show genesis configuration')
    console.log('')

    try {
      const client = getClient()
      const config = await client.get<GenesisConfig>('/api/genesis/config')
      console.log('Current Configuration:')
      console.log(`  Enabled:     ${config.enabled ? 'yes' : 'no'}`)
      console.log(`  Auto-create: ${config.auto_create ? 'yes' : 'no'}`)
      console.log(`  Repos dir:   ${config.repos_dir}`)
      if (config.default_language) {
        console.log(`  Language:    ${config.default_language}`)
      }
      console.log('')
    } catch {
      // Config endpoint might not exist yet
      info('Configuration not available (API endpoint not found)')
      console.log('')
    }
  })

  // mycel genesis create "description"
  genesis
    .command('create <description>')
    .description('Create a new repository from description')
    .option('--private', 'Create as private repository')
    .option('-l, --language <lang>', 'Programming language (python, typescript, javascript, rust)')
    .option('-d, --dir <path>', 'Directory to create repo in')
    .option('--json', 'Output as JSON')
    .action(async (description: string, options: {
      private?: boolean
      language?: string
      dir?: string
      json?: boolean
    }) => {
      try {
        const client = getClient()

        info(`Creating repository: ${description.slice(0, 60)}...`)

        const response = await client.post<GenesisCreateResponse>('/api/genesis/create', {
          description,
          public: !options.private,
          language: options.language,
          repos_dir: options.dir,
        })

        if (options.json) {
          json(response)
          return
        }

        console.log('')
        success(`Repository created: ${response.repo_name}`)
        console.log(`  Path:        ${response.repo_path}`)
        console.log(`  Language:    ${response.language}`)
        console.log(`  Description: ${response.description}`)
        if (response.github_url) {
          console.log(`  GitHub:      ${response.github_url}`)
        }
        console.log('')
        info('Next steps:')
        console.log('  cd ' + response.repo_path)
        console.log('  mycel repos add ' + response.repo_path)
        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to create repository: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to create repository: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel genesis auto
  genesis
    .command('auto')
    .description('Analyze network and propose new repositories')
    .option('--create', 'Create proposals directly (no alignment)')
    .option('--json', 'Output as JSON')
    .action(async (options: { create?: boolean; json?: boolean }) => {
      try {
        const client = getClient()

        info('Analyzing network for potential new repositories...')

        const response = await client.post<GenesisAutoResponse>('/api/genesis/auto', {
          create: options.create ?? false,
        })

        if (options.json) {
          json(response)
          return
        }

        if (response.proposals.length === 0) {
          console.log('')
          info('No new repository proposals at this time.')
          return
        }

        console.log('')
        info(`Found ${response.proposals.length} potential repositories:`)
        console.log('')

        const rows = response.proposals.map(p => ({
          name: p.name,
          language: p.language,
          description: p.description.length > 40 ? p.description.slice(0, 37) + '...' : p.description,
        }))
        table(rows)

        if (options.create && response.created && response.created.length > 0) {
          console.log('')
          success(`Created ${response.created.length} repositories:`)
          for (const repo of response.created) {
            console.log(`  - ${repo.repo_name}: ${repo.repo_path}`)
          }
        } else if (!options.create) {
          console.log('')
          info('Use --create to create these repositories')
          info('Or wait for alignment approval via Telegram')
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to run auto-genesis: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to run auto-genesis: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel genesis config
  genesis
    .command('config')
    .description('Show genesis configuration')
    .option('--enabled <bool>', 'Enable/disable genesis in runner')
    .option('--auto-create <bool>', 'Enable/disable auto-creation')
    .option('--json', 'Output as JSON')
    .action(async (options: {
      enabled?: string
      autoCreate?: string
      json?: boolean
    }) => {
      try {
        const client = getClient()

        // Check if any updates requested
        const hasUpdates = options.enabled !== undefined || options.autoCreate !== undefined

        if (hasUpdates) {
          const updates: Record<string, boolean> = {}
          if (options.enabled !== undefined) {
            updates.enabled = options.enabled === 'true'
          }
          if (options.autoCreate !== undefined) {
            updates.auto_create = options.autoCreate === 'true'
          }

          await client.post('/api/genesis/config', updates)
          success('Genesis configuration updated')
          console.log('')
        }

        const config = await client.get<GenesisConfig>('/api/genesis/config')

        if (options.json) {
          json(config)
          return
        }

        console.log('')
        console.log('Genesis Configuration')
        console.log('=====================')
        console.log(`Enabled:       ${config.enabled ? 'yes' : 'no'}`)
        console.log(`Auto-create:   ${config.auto_create ? 'yes' : 'no'}`)
        console.log(`Repos dir:     ${config.repos_dir}`)
        if (config.default_language) {
          console.log(`Def. Language: ${config.default_language}`)
        }
        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            warn('Genesis config endpoint not available')
            info('Genesis may not be enabled in this backend version')
          } else {
            error(`Failed to get genesis config: ${err.message}`)
          }
        } else {
          error(`Failed to get genesis config: ${err}`)
        }
        process.exit(1)
      }
    })
}

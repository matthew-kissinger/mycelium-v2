/**
 * Network repository CLI commands.
 *
 * Implements:
 * - mycel repos                  - List repositories
 * - mycel repos add <path>       - Add repository
 * - mycel repos remove <path>    - Remove repository
 * - mycel repos health           - Show health summary
 * - mycel repos discover [path]  - Scan for repositories
 * - mycel repos describe <path>  - Update description
 * - mycel repos paths            - Show/manage scan paths
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client'
import { table, success, error, info } from '../output'
import type { Repo, RepoHealthResponse } from '@mycelium/shared'

// Types for API responses
interface DiscoveredRepo {
  path: string
  name: string
  language: string | null
  description: string | null
  already_registered: boolean
}

interface DiscoverResponse {
  discovered: DiscoveredRepo[]
  total: number
  new: number
}

interface SchedulerConfig {
  scan_paths?: string[]
  [key: string]: unknown
}

export function registerRepoCommands(program: Command): void {
  const repos = program
    .command('repos')
    .description('Network repository management')

  // Default action (list all repos)
  repos
    .action(async () => {
      try {
        const client = getClient()
        const repoList = await client.get<Repo[]>('/api/repos')

        if (repoList.length === 0) {
          info('No repositories in network')
          return
        }

        table(repoList.map((r) => ({
          name: r.name,
          path: r.path,
          mode: r.mode,
          language: r.language || '-',
          description: r.description?.slice(0, 40) || '-',
        })))
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to list repos: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // Add repository
  repos
    .command('add <path>')
    .description('Add repository to network')
    .option('-a, --auto-create', 'Enable auto task creation (auto mode)')
    .option('-d, --description <text>', 'Repository description')
    .action(async (path: string, options: { autoCreate?: boolean; description?: string }) => {
      try {
        const client = getClient()
        const repo = await client.post<Repo>('/api/repos', {
          path,
          mode: options.autoCreate ? 'auto' : 'align',
          description: options.description,
        })
        success(`Added ${repo.name} to network (${repo.mode} mode)`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string; repo?: Repo } | undefined
          if (err.status === 409 && body?.repo) {
            error(`Repository already registered: ${body.repo.name}`)
          } else if (err.status === 400) {
            error(body?.error || 'Invalid path')
          } else {
            error(`Failed to add repo: ${err.message}`)
          }
        } else {
          throw err
        }
      }
    })

  // Remove repository
  repos
    .command('remove <path>')
    .description('Remove repository from network')
    .action(async (path: string) => {
      try {
        const client = getClient()
        // First find the repo by path
        const repoList = await client.get<Repo[]>('/api/repos')
        const repo = repoList.find((r) => r.path === path)

        if (!repo) {
          error(`Repository not found: ${path}`)
          return
        }

        await client.delete(`/api/repos/${repo.id}`)
        success(`Removed ${repo.name} from network`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to remove repo: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // Health summary
  repos
    .command('health')
    .description('Show network health summary')
    .action(async () => {
      try {
        const client = getClient()
        const health = await client.get<RepoHealthResponse>('/api/repos/health')

        if (health.repos.length === 0) {
          info('No repositories in network')
          return
        }

        table(health.repos.map((r) => ({
          name: r.name,
          health: `${r.health_score}%`,
          pending: r.pending_tasks,
          running: r.running_tasks,
          completed: r.completed_tasks,
          failed: r.failed_tasks,
        })))

        info(`Overall network health: ${health.overall_health}%`)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get health: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // Discover repositories
  repos
    .command('discover [path]')
    .description('Scan directory for git repositories')
    .action(async (path?: string) => {
      try {
        const client = getClient()
        const paths: string[] = []

        if (path) {
          paths.push(path)
        } else {
          // Get default scan paths from scheduler config
          try {
            const config = await client.get<SchedulerConfig>('/api/scheduler/config')
            if (config.scan_paths && config.scan_paths.length > 0) {
              paths.push(...config.scan_paths)
            }
          } catch {
            // Config not available, continue without paths
          }
        }

        if (paths.length === 0) {
          error('No scan path provided. Use: mycel repos discover <path>')
          info('Or configure scan paths with: mycel repos paths add <path>')
          return
        }

        const result = await client.post<DiscoverResponse>('/api/repos/discover', { paths })

        if (result.discovered.length === 0) {
          info('No git repositories found')
          return
        }

        info(`Discovered ${result.total} repositories (${result.new} new):`)
        console.log()

        table(result.discovered.map((r) => ({
          name: r.name,
          path: r.path,
          language: r.language || '-',
          registered: r.already_registered ? 'yes' : 'no',
        })))

        if (result.new > 0) {
          console.log()
          info(`Add new repos with: mycel repos add <path>`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to discover repos: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // Describe repository
  repos
    .command('describe <path>')
    .description('Update or extract repository description')
    .option('-d, --description <text>', 'Set custom description')
    .action(async (path: string, options: { description?: string }) => {
      try {
        const client = getClient()

        // Find repo by path
        const repoList = await client.get<Repo[]>('/api/repos')
        const repo = repoList.find((r) => r.path === path)

        if (!repo) {
          error(`Repository not found: ${path}`)
          return
        }

        if (options.description) {
          // Set custom description
          const updated = await client.patch<Repo>(`/api/repos/${repo.id}`, {
            description: options.description,
          })
          success(`Updated description for ${updated.name}`)
          console.log(`  ${updated.description}`)
        } else {
          // Trigger auto-extraction by re-adding repo (or show current)
          if (repo.description) {
            info(`Current description for ${repo.name}:`)
            console.log(`  ${repo.description}`)
          } else {
            info(`No description found for ${repo.name}`)
            info('Set one with: mycel repos describe <path> --description "text"')
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to describe repo: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // Scan paths management
  const pathsCmd = repos
    .command('paths')
    .description('Manage scan paths for repository discovery')

  // List paths (default action)
  pathsCmd
    .action(async () => {
      try {
        const client = getClient()
        const config = await client.get<SchedulerConfig>('/api/scheduler/config')
        const paths = config.scan_paths || []

        if (paths.length === 0) {
          info('No scan paths configured')
          info('Add paths with: mycel repos paths add <path>')
          return
        }

        info('Configured scan paths:')
        for (const p of paths) {
          console.log(`  ${p}`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get scan paths: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // Add scan path
  pathsCmd
    .command('add <path>')
    .description('Add a scan path')
    .action(async (path: string) => {
      try {
        const client = getClient()

        // Get current config
        const config = await client.get<SchedulerConfig>('/api/scheduler/config')
        const paths = config.scan_paths || []

        if (paths.includes(path)) {
          info(`Path already configured: ${path}`)
          return
        }

        // Update config with new path
        await client.patch('/api/scheduler/config', {
          scan_paths: [...paths, path],
        })

        success(`Added scan path: ${path}`)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            error('Scheduler config not available. Scan paths not supported in this version.')
          } else {
            error(`Failed to add scan path: ${err.message}`)
          }
        } else {
          throw err
        }
      }
    })

  // Remove scan path
  pathsCmd
    .command('remove <path>')
    .description('Remove a scan path')
    .action(async (path: string) => {
      try {
        const client = getClient()

        // Get current config
        const config = await client.get<SchedulerConfig>('/api/scheduler/config')
        const paths = config.scan_paths || []

        const index = paths.indexOf(path)
        if (index === -1) {
          error(`Path not configured: ${path}`)
          return
        }

        // Update config without the path
        const newPaths = paths.filter((p) => p !== path)
        await client.patch('/api/scheduler/config', {
          scan_paths: newPaths,
        })

        success(`Removed scan path: ${path}`)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            error('Scheduler config not available. Scan paths not supported in this version.')
          } else {
            error(`Failed to remove scan path: ${err.message}`)
          }
        } else {
          throw err
        }
      }
    })
}

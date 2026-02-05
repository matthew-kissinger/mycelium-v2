/**
 * Runner and config CLI commands for Phase 3F.
 *
 * Commands:
 * - runner: Show runner status
 * - runner start: Start autonomous runner
 * - runner stop: Stop autonomous runner
 * - runner config: View or update runner configuration
 * - config show: Show full configuration
 * - config set: Set configuration value
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, success, error, info, warn } from '../output.ts'

/**
 * Cycle state from API response
 */
interface CycleState {
  name: string
  enabled: boolean
  running: boolean
  last_run?: string
  next_run?: string
  runs_completed: number
  errors: number
}

/**
 * Scheduler status from API response
 */
interface SchedulerStatus {
  running: boolean
  started_at?: string
  cycles: CycleState[]
  config?: SchedulerConfig
}

/**
 * Scheduler configuration
 */
interface SchedulerConfig {
  dispatcher_enabled?: boolean
  dispatcher_interval_sec?: number
  max_concurrent_tasks?: number
  min_concurrent_tasks?: number
  max_concurrent_ceiling?: number
  blocked_task_timeout_sec?: number
  blocked_check_enabled?: boolean
  orphan_cancel_timeout_sec?: number
  discovery_enabled?: boolean
  discovery_interval_sec?: number
  discovery_repos?: string[]
  discovery_auto_create?: string[]
  digest_enabled?: boolean
  digest_interval_sec?: number
  compaction_enabled?: boolean
  compaction_interval_sec?: number
  auto_prune_enabled?: boolean
  auto_prune_threshold?: number
  auto_prune_keep?: number
}

/**
 * Format relative time from ISO timestamp
 */
function relativeTime(isoString: string | undefined): string {
  if (!isoString) return '-'
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
 * Format seconds as human-readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

/**
 * Display runner status in a formatted way
 */
function displayRunnerStatus(status: SchedulerStatus): void {
  console.log('')
  console.log('Runner Status')
  console.log('=============')
  console.log(`Running: ${status.running ? 'Yes' : 'No'}`)
  if (status.started_at) {
    console.log(`Started: ${relativeTime(status.started_at)}`)
  }

  // Show config summary if available
  if (status.config) {
    console.log('')
    console.log('Configuration:')
    console.log(`  Max Concurrent: ${status.config.max_concurrent_tasks ?? 3}`)
    console.log(`  Discovery Interval: ${formatDuration(status.config.discovery_interval_sec ?? 600)}`)
    console.log(`  Dispatcher Interval: ${formatDuration(status.config.dispatcher_interval_sec ?? 900)}`)
  }

  // Show cycles
  if (status.cycles && status.cycles.length > 0) {
    console.log('')
    console.log('Cycles:')
    console.log(`  ${'Name'.padEnd(15)} ${'Enabled'.padEnd(8)} ${'Running'.padEnd(8)} ${'Last Run'.padEnd(12)} ${'Errors'.padEnd(8)}`)
    console.log('  ' + '-'.repeat(55))
    for (const cycle of status.cycles) {
      const enabled = cycle.enabled ? 'yes' : 'no'
      const running = cycle.running ? 'yes' : 'no'
      const lastRun = relativeTime(cycle.last_run)
      const errors = cycle.errors > 0 ? String(cycle.errors) : '-'
      console.log(`  ${cycle.name.padEnd(15)} ${enabled.padEnd(8)} ${running.padEnd(8)} ${lastRun.padEnd(12)} ${errors.padEnd(8)}`)
    }
  }
  console.log('')
}

/**
 * Display configuration in a formatted way
 */
function displayConfig(config: SchedulerConfig): void {
  console.log('')
  console.log('Scheduler Configuration')
  console.log('=======================')
  console.log('')

  // Dispatcher settings
  console.log('Dispatcher:')
  console.log(`  Enabled: ${config.dispatcher_enabled ?? true}`)
  console.log(`  Interval: ${formatDuration(config.dispatcher_interval_sec ?? 900)}`)
  console.log(`  Max Concurrent Tasks: ${config.max_concurrent_tasks ?? 3}`)
  console.log(`  Max Concurrent Ceiling: ${config.max_concurrent_ceiling ?? 10}`)
  console.log('')

  // Blocked task detection
  console.log('Blocked Task Detection:')
  console.log(`  Enabled: ${config.blocked_check_enabled ?? true}`)
  console.log(`  Timeout: ${formatDuration(config.blocked_task_timeout_sec ?? 10800)}`)
  console.log(`  Orphan Cancel: ${formatDuration(config.orphan_cancel_timeout_sec ?? 14400)}`)
  console.log('')

  // Discovery settings
  console.log('Discovery:')
  console.log(`  Enabled: ${config.discovery_enabled ?? true}`)
  console.log(`  Interval: ${formatDuration(config.discovery_interval_sec ?? 600)}`)
  if (config.discovery_repos && config.discovery_repos.length > 0) {
    console.log(`  Repos: ${config.discovery_repos.join(', ')}`)
  }
  if (config.discovery_auto_create && config.discovery_auto_create.length > 0) {
    console.log(`  Auto-Create: ${config.discovery_auto_create.join(', ')}`)
  }
  console.log('')

  // Digest settings
  console.log('Digest:')
  console.log(`  Enabled: ${config.digest_enabled ?? true}`)
  console.log(`  Interval: ${formatDuration(config.digest_interval_sec ?? 21600)}`)
  console.log('')

  // Compaction settings (Haiku agent)
  console.log('Compaction (Haiku Agent):')
  console.log(`  Enabled: ${config.compaction_enabled ?? true}`)
  console.log(`  Interval: ${formatDuration(config.compaction_interval_sec ?? 14400)}`)
  console.log('')

  // Auto-prune settings
  console.log('Auto-Prune:')
  console.log(`  Enabled: ${config.auto_prune_enabled ?? true}`)
  console.log(`  Threshold: ${config.auto_prune_threshold ?? 100} tasks`)
  console.log(`  Keep: ${config.auto_prune_keep ?? 30} tasks`)
  console.log('')
}

/**
 * Register all runner-related commands on the program
 */
export function registerRunnerCommands(program: Command): void {
  // mycel runner - parent command for runner operations
  const runner = program
    .command('runner')
    .description('Autonomous runner management')

  // mycel runner (default action - show status)
  runner
    .action(async () => {
      try {
        const client = getClient()
        const status = await client.get<SchedulerStatus>('/api/scheduler/status')
        displayRunnerStatus(status)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get runner status: ${err.status} ${err.statusText}`)
          if (err.body && typeof err.body === 'object' && 'error' in err.body) {
            error(String((err.body as { error: string }).error))
          }
        } else {
          throw err
        }
      }
    })

  // mycel runner start
  runner
    .command('start')
    .description('Start autonomous runner')
    .action(async () => {
      try {
        const client = getClient()
        await client.post<{ message: string }>('/api/scheduler/start', {})
        success('Runner started')
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            info('Runner start not yet implemented in API (Phase 5)')
          } else {
            error(`Failed to start runner: ${err.status} ${err.statusText}`)
            if (err.body && typeof err.body === 'object' && 'error' in err.body) {
              error(String((err.body as { error: string }).error))
            }
          }
        } else {
          throw err
        }
      }
    })

  // mycel runner stop
  runner
    .command('stop')
    .description('Stop autonomous runner')
    .action(async () => {
      try {
        const client = getClient()
        await client.post<{ message: string }>('/api/scheduler/stop', {})
        success('Runner stopped')
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            info('Runner stop not yet implemented in API (Phase 5)')
          } else {
            error(`Failed to stop runner: ${err.status} ${err.statusText}`)
            if (err.body && typeof err.body === 'object' && 'error' in err.body) {
              error(String((err.body as { error: string }).error))
            }
          }
        } else {
          throw err
        }
      }
    })

  // mycel runner config
  runner
    .command('config')
    .description('View or update runner configuration')
    .option('-i, --interval <seconds>', 'Discovery interval in seconds')
    .option('-m, --max-concurrent <n>', 'Max concurrent tasks')
    .option('-a, --allocate <args...>', 'Set repo weight: <repo> <weight>')
    .action(async (options: {
      interval?: string
      maxConcurrent?: string
      allocate?: string[]
    }) => {
      try {
        const client = getClient()

        // Check if any update options were provided
        const hasUpdates = options.interval || options.maxConcurrent || options.allocate

        if (!hasUpdates) {
          // Show current config
          const status = await client.get<SchedulerStatus>('/api/scheduler/status')
          if (status.config) {
            displayConfig(status.config)
          } else {
            json({})
          }
          return
        }

        // Build config update payload
        const updates: Record<string, unknown> = {}

        if (options.interval) {
          const interval = parseInt(options.interval, 10)
          if (isNaN(interval) || interval <= 0) {
            error('Invalid interval: must be a positive number')
            return
          }
          updates.discovery_interval_sec = interval
        }

        if (options.maxConcurrent) {
          const maxConcurrent = parseInt(options.maxConcurrent, 10)
          if (isNaN(maxConcurrent) || maxConcurrent <= 0) {
            error('Invalid max-concurrent: must be a positive number')
            return
          }
          updates.max_concurrent_tasks = maxConcurrent
        }

        if (options.allocate) {
          if (options.allocate.length < 2) {
            error('Invalid allocate: requires <repo> <weight>')
            return
          }
          const repo = options.allocate[0] as string
          const weightStr = options.allocate[1] as string
          const weight = parseInt(weightStr, 10)
          if (isNaN(weight) || weight < 0 || weight > 100) {
            error('Invalid weight: must be between 0 and 100')
            return
          }
          // Note: repo allocation may need a different endpoint
          info(`Allocation for ${repo} = ${weight}%`)
          warn('Repo allocation not yet implemented in API (Phase 5)')
          return
        }

        // Try to update config
        try {
          await client.post<{ message: string }>('/api/scheduler/config', updates)
          success('Configuration updated')
        } catch (postErr) {
          if (postErr instanceof ApiError && postErr.status === 404) {
            info('Config update not yet implemented in API (Phase 5)')
            info('Requested changes:')
            json(updates)
          } else {
            throw postErr
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get/update config: ${err.status} ${err.statusText}`)
        } else {
          throw err
        }
      }
    })

  // mycel config - parent command for config operations
  const config = program
    .command('config')
    .description('Configuration management')

  // mycel config show
  config
    .command('show')
    .description('Show full configuration')
    .action(async () => {
      try {
        const client = getClient()
        const status = await client.get<SchedulerStatus>('/api/scheduler/status')

        if (status.config) {
          displayConfig(status.config)
        } else {
          console.log('')
          console.log('Scheduler Configuration')
          console.log('=======================')
          info('No configuration available (scheduler not initialized)')
          console.log('')
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get configuration: ${err.status} ${err.statusText}`)
        } else {
          throw err
        }
      }
    })

  // mycel config set <key> <value>
  config
    .command('set <key> <value>')
    .description('Set configuration value')
    .action(async (key: string, value: string) => {
      try {
        const client = getClient()

        // Parse value to appropriate type
        let parsedValue: unknown = value
        if (value === 'true') parsedValue = true
        else if (value === 'false') parsedValue = false
        else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10)
        else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value)

        const payload = { [key]: parsedValue }

        try {
          await client.post<{ message: string }>('/api/scheduler/config', payload)
          success(`Configuration updated: ${key} = ${value}`)
        } catch (postErr) {
          if (postErr instanceof ApiError && postErr.status === 404) {
            info('Config set not yet implemented in API (Phase 5)')
            info(`Requested: ${key} = ${JSON.stringify(parsedValue)}`)
          } else {
            throw postErr
          }
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to set configuration: ${err.status} ${err.statusText}`)
          if (err.body && typeof err.body === 'object' && 'error' in err.body) {
            error(String((err.body as { error: string }).error))
          }
        } else {
          throw err
        }
      }
    })
}

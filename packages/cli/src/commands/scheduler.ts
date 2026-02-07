/**
 * Scheduler CLI commands.
 *
 * Commands:
 * - mycel scheduler          - Show scheduler status
 * - mycel scheduler start    - Start scheduler
 * - mycel scheduler stop     - Stop scheduler
 * - mycel scheduler config   - Show scheduler config
 * - mycel scheduler config set <key> <value> - Update config field
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client.ts'
import { json, success, error, info } from '../output.ts'

interface CycleState {
  name: string
  enabled: boolean
  running: boolean
  last_run?: string
  next_run?: string
  runs_completed: number
  errors: number
}

interface SchedulerStatus {
  running: boolean
  started_at?: string
  cycles: CycleState[]
  config?: Record<string, unknown>
}

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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function displayStatus(status: SchedulerStatus): void {
  console.log('')
  console.log('Scheduler Status')
  console.log('================')
  console.log(`Running: ${status.running ? 'Yes' : 'No'}`)
  if (status.started_at) {
    console.log(`Started: ${relativeTime(status.started_at)}`)
  }

  if (status.cycles && status.cycles.length > 0) {
    console.log('')
    console.log('Cycles:')
    console.log(`  ${'Name'.padEnd(15)} ${'Enabled'.padEnd(8)} ${'Running'.padEnd(8)} ${'Last Run'.padEnd(12)} ${'Runs'.padEnd(6)} ${'Errors'.padEnd(8)}`)
    console.log('  ' + '-'.repeat(61))
    for (const cycle of status.cycles) {
      const enabled = cycle.enabled ? 'yes' : 'no'
      const running = cycle.running ? 'yes' : 'no'
      const lastRun = relativeTime(cycle.last_run)
      const runs = String(cycle.runs_completed)
      const errors = cycle.errors > 0 ? String(cycle.errors) : '-'
      console.log(`  ${cycle.name.padEnd(15)} ${enabled.padEnd(8)} ${running.padEnd(8)} ${lastRun.padEnd(12)} ${runs.padEnd(6)} ${errors.padEnd(8)}`)
    }
  }
  console.log('')
}

export function registerSchedulerCommands(program: Command): void {
  const scheduler = program
    .command('scheduler')
    .description('Scheduler management')

  // mycel scheduler (default - show status)
  scheduler
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const status = await client.get<SchedulerStatus>('/api/scheduler/status')

        if (options.json) {
          json(status)
          return
        }

        displayStatus(status)
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get scheduler status: ${err.message}`)
        } else {
          error(`Failed to get scheduler status: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel scheduler start
  scheduler
    .command('start')
    .description('Start the scheduler')
    .action(async () => {
      try {
        const client = getClient()
        await client.post<{ message: string; status: SchedulerStatus }>('/api/scheduler/start')
        success('Scheduler started')
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to start scheduler: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to start scheduler: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel scheduler stop
  scheduler
    .command('stop')
    .description('Stop the scheduler')
    .action(async () => {
      try {
        const client = getClient()
        await client.post<{ message: string; status: SchedulerStatus }>('/api/scheduler/stop')
        success('Scheduler stopped')
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to stop scheduler: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to stop scheduler: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel scheduler config
  const configCmd = scheduler
    .command('config')
    .description('View or update scheduler configuration')

  configCmd
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getClient()
        const response = await client.get<{ config: Record<string, unknown> }>('/api/config/scheduler')

        if (options.json) {
          json(response.config)
          return
        }

        const config = response.config
        console.log('')
        console.log('Scheduler Configuration')
        console.log('=======================')
        for (const [key, value] of Object.entries(config)) {
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
          console.log(`  ${key}: ${displayValue}`)
        }
        console.log('')
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get scheduler config: ${err.message}`)
        } else {
          error(`Failed to get scheduler config: ${err}`)
        }
        process.exit(1)
      }
    })

  // mycel scheduler config set <key> <value>
  configCmd
    .command('set <key> <value>')
    .description('Update a scheduler config field')
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

        await client.patch<{ message: string }>('/api/config/scheduler', payload)
        success(`Scheduler config updated: ${key} = ${value}`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(`Failed to update config: ${body?.error ?? err.message}`)
        } else {
          error(`Failed to update config: ${err}`)
        }
        process.exit(1)
      }
    })
}

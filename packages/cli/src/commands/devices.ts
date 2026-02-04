/**
 * Device management CLI commands.
 *
 * Implements:
 * - mycel devices                    - List devices with status
 * - mycel device add <name> <host>   - Add device
 * - mycel device remove <name>       - Remove device
 * - mycel device status              - Show status summary
 * - mycel device ping <name>         - Health check single device
 * - mycel device <name> <command>    - Execute device command
 */

import { Command } from 'commander'
import { getClient, ApiError } from '../client'
import { table, success, error, info, json as jsonOutput } from '../output'
import type { Device, DeviceType, HealthCheckResult, DeviceCommandResult } from '@mycelium/shared'

// API response types
interface DeviceStatusSummary {
  total: number
  online: number
  offline: number
  degraded: number
  unknown: number
  devices: Array<{
    name: string
    type: string
    status: string
    last_seen: string | null
    response_time_ms: number | null
  }>
}

interface HealthCheckResponse {
  checked: number
  results: Array<{
    name: string
    status: string
    latency_ms?: number
  }>
}

interface CommandResponse {
  device: string
  command: string
  success: boolean
  output?: unknown
  error?: string
  duration_ms?: number
}

export function registerDeviceCommands(program: Command): void {
  // mycel devices - List all devices
  program
    .command('devices')
    .description('List all registered devices')
    .option('-t, --type <type>', 'Filter by device type')
    .option('-s, --status <status>', 'Filter by status')
    .option('--json', 'Output as JSON')
    .action(async (options: { type?: string; status?: string; json?: boolean }) => {
      try {
        const client = getClient()
        const params = new URLSearchParams()
        if (options.type) params.set('type', options.type)
        if (options.status) params.set('status', options.status)

        const url = `/api/devices${params.toString() ? '?' + params : ''}`
        const devices = await client.get<Device[]>(url)

        if (options.json) {
          jsonOutput(devices)
          return
        }

        if (devices.length === 0) {
          info('No devices registered')
          return
        }

        table(devices.map((d) => ({
          name: d.name,
          type: d.type,
          host: `${d.host}:${d.port || '-'}`,
          status: d.status,
          last_seen: d.last_seen ? new Date(d.last_seen).toLocaleString() : '-',
          latency: d.response_time_ms ? `${d.response_time_ms}ms` : '-',
        })))
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to list devices: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // mycel device - Device management subcommands
  const device = program
    .command('device')
    .description('Device management')

  // mycel device add <name> <host>
  device
    .command('add <name> <host>')
    .description('Add a device to the network')
    .requiredOption('-t, --type <type>', 'Device type (roku, yamaha, ssh, ollama, http)')
    .option('-p, --port <port>', 'Port number')
    .option('-d, --description <text>', 'Device description')
    .action(async (name: string, host: string, options: { type: string; port?: string; description?: string }) => {
      try {
        const client = getClient()
        const device = await client.post<Device>('/api/devices', {
          name,
          type: options.type,
          host,
          port: options.port ? parseInt(options.port) : undefined,
          description: options.description,
        })
        success(`Added device: ${device.name} (${device.type}) at ${device.host}:${device.port}`)
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          error(body?.error || err.message)
        } else {
          throw err
        }
      }
    })

  // mycel device remove <name>
  device
    .command('remove <name>')
    .alias('rm')
    .description('Remove a device from the network')
    .action(async (name: string) => {
      try {
        const client = getClient()
        await client.delete(`/api/devices/${encodeURIComponent(name)}`)
        success(`Removed device: ${name}`)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            error(`Device not found: ${name}`)
          } else {
            error(err.message)
          }
        } else {
          throw err
        }
      }
    })

  // mycel device status
  device
    .command('status')
    .description('Show device status summary')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const client = getClient()
        const status = await client.get<DeviceStatusSummary>('/api/devices/status')

        if (options.json) {
          jsonOutput(status)
          return
        }

        console.log(`\nDevice Status Summary`)
        console.log(`====================`)
        console.log(`Total:    ${status.total}`)
        console.log(`Online:   ${status.online}`)
        console.log(`Offline:  ${status.offline}`)
        console.log(`Degraded: ${status.degraded}`)
        console.log(`Unknown:  ${status.unknown}`)

        if (status.devices.length > 0) {
          console.log('')
          table(status.devices.map((d) => ({
            name: d.name,
            type: d.type,
            status: d.status,
            last_seen: d.last_seen ? new Date(d.last_seen).toLocaleString() : '-',
            latency: d.response_time_ms ? `${d.response_time_ms}ms` : '-',
          })))
        }
      } catch (err) {
        if (err instanceof ApiError) {
          error(`Failed to get status: ${err.message}`)
        } else {
          throw err
        }
      }
    })

  // mycel device ping [name]
  device
    .command('ping [name]')
    .description('Health check device(s)')
    .option('--json', 'Output as JSON')
    .action(async (name: string | undefined, options: { json?: boolean }) => {
      try {
        const client = getClient()

        if (name) {
          // Single device health check
          const result = await client.post<HealthCheckResult & { device: string }>(
            `/api/devices/${encodeURIComponent(name)}/health`,
            {}
          )

          if (options.json) {
            jsonOutput(result)
            return
          }

          if (result.online) {
            success(`${result.device}: online (${result.latency_ms}ms)`)
          } else {
            error(`${result.device}: ${result.status}${result.error ? ` - ${result.error}` : ''}`)
          }
        } else {
          // Health check all devices
          const result = await client.post<HealthCheckResponse>('/api/devices/health-check', {})

          if (options.json) {
            jsonOutput(result)
            return
          }

          if (result.results.length === 0) {
            info('No devices to check')
            return
          }

          table(result.results.map((r) => ({
            name: r.name,
            status: r.status,
            latency: r.latency_ms ? `${r.latency_ms}ms` : '-',
          })))

          const online = result.results.filter((r) => r.status === 'online').length
          console.log(`\n${online}/${result.checked} devices online`)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            error(`Device not found: ${name}`)
          } else {
            error(err.message)
          }
        } else {
          throw err
        }
      }
    })

  // mycel device <name> <command> [args...]
  device
    .command('cmd <name> <command> [args...]')
    .description('Execute command on device')
    .option('--json', 'Output as JSON')
    .action(async (name: string, command: string, args: string[], options: { json?: boolean }) => {
      try {
        const client = getClient()
        const result = await client.post<CommandResponse>(
          `/api/devices/${encodeURIComponent(name)}/command`,
          {
            command,
            args: args.length > 0 ? args : undefined,
          }
        )

        if (options.json) {
          jsonOutput(result)
          return
        }

        if (result.success) {
          if (typeof result.output === 'object') {
            jsonOutput(result.output)
          } else if (result.output !== undefined) {
            console.log(result.output)
          } else {
            success(`Command executed (${result.duration_ms}ms)`)
          }
        } else {
          error(result.error || 'Command failed')
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string; last_error?: string } | undefined
          if (err.status === 404) {
            error(`Device not found: ${name}`)
          } else if (err.status === 503) {
            error(`Device offline: ${body?.last_error || 'unreachable'}`)
          } else {
            error(body?.error || err.message)
          }
        } else {
          throw err
        }
      }
    })

  // Convenience commands for common operations

  // mycel tv <app|command>
  program
    .command('tv [action]')
    .description('Roku TV control (youtube, netflix, home, etc.)')
    .action(async (action: string = 'status') => {
      try {
        const client = getClient()

        // Map common actions to commands
        const appNames = ['youtube', 'netflix', 'disney', 'prime', 'hulu', 'plex', 'spotify']
        const keyNames = ['home', 'up', 'down', 'left', 'right', 'select', 'back', 'play', 'pause']

        let command: string
        let args: string[] | undefined

        if (appNames.includes(action.toLowerCase())) {
          command = 'launch'
          args = [action.toLowerCase()]
        } else if (keyNames.includes(action.toLowerCase())) {
          command = 'keypress'
          // Capitalize first letter for Roku API
          args = [action.charAt(0).toUpperCase() + action.slice(1)]
        } else if (action === 'status' || action === 'info') {
          command = 'info'
        } else if (action === 'apps') {
          command = 'apps'
        } else {
          // Try as app name/ID
          command = 'launch'
          args = [action]
        }

        const result = await client.post<CommandResponse>(
          '/api/devices/roku/command',
          { command, args }
        )

        if (result.success) {
          if (typeof result.output === 'object') {
            jsonOutput(result.output)
          } else if (result.output) {
            console.log(result.output)
          } else {
            success(`OK`)
          }
        } else {
          error(result.error || 'Command failed')
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          if (err.status === 404) {
            error('Roku device not registered. Add with: mycel device add roku <ip> -t roku')
          } else if (err.status === 503) {
            error('Roku TV is offline')
          } else {
            error(body?.error || err.message)
          }
        } else {
          throw err
        }
      }
    })

  // mycel vol [level|up|down|mute|status]
  program
    .command('vol [action]')
    .description('Yamaha soundbar volume control')
    .action(async (action: string = 'status') => {
      try {
        const client = getClient()

        let command: string
        let args: string[] | undefined

        if (action === 'up') {
          // Get current volume and increase by 5
          const status = await client.post<CommandResponse>(
            '/api/devices/yamaha/command',
            { command: 'status' }
          )
          const current = (status.output as { volume?: number })?.volume ?? 20
          command = 'volume'
          args = [String(Math.min(100, current + 5))]
        } else if (action === 'down') {
          const status = await client.post<CommandResponse>(
            '/api/devices/yamaha/command',
            { command: 'status' }
          )
          const current = (status.output as { volume?: number })?.volume ?? 20
          command = 'volume'
          args = [String(Math.max(0, current - 5))]
        } else if (action === 'mute') {
          // Toggle mute
          const status = await client.post<CommandResponse>(
            '/api/devices/yamaha/command',
            { command: 'mute' }
          )
          const muted = (status.output as { muted?: boolean })?.muted ?? false
          command = 'mute'
          args = [muted ? 'off' : 'on']
        } else if (action === 'status') {
          command = 'status'
        } else if (!isNaN(parseInt(action))) {
          command = 'volume'
          args = [action]
        } else {
          error(`Unknown action: ${action}`)
          return
        }

        const result = await client.post<CommandResponse>(
          '/api/devices/yamaha/command',
          { command, args }
        )

        if (result.success) {
          const output = result.output as { volume?: number; muted?: boolean } | string
          if (typeof output === 'object') {
            if ('volume' in output) {
              console.log(`Volume: ${output.volume}${output.muted ? ' (muted)' : ''}`)
            } else {
              jsonOutput(output)
            }
          } else if (output) {
            console.log(output)
          }
        } else {
          error(result.error || 'Command failed')
        }
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | undefined
          if (err.status === 404) {
            error('Yamaha device not registered. Add with: mycel device add yamaha <ip> -t yamaha')
          } else if (err.status === 503) {
            error('Yamaha soundbar is offline')
          } else {
            error(body?.error || err.message)
          }
        } else {
          throw err
        }
      }
    })
}

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import {
  DeviceCreate,
  DeviceUpdate,
  DeviceCommandRequest,
  DeviceType,
  DeviceStatus,
  DEFAULT_PORTS,
  DEFAULT_PROTOCOLS,
  ROKU_APPS,
  type HealthCheckResult,
  type DeviceCommandResult,
} from '@mycelium/shared'
import { broadcast } from '../sse'
import * as queries from '../db/queries'

const app = new Hono()

// ============================================================================
// Health Check Functions
// ============================================================================

async function checkRokuHealth(host: string, port: number): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    const response = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(3000),
    })
    const latency = Date.now() - start
    return {
      online: response.ok,
      status: response.ok ? 'online' : 'degraded',
      latency_ms: latency,
    }
  } catch (error) {
    return {
      online: false,
      status: 'offline',
      error: (error as Error).message,
      latency_ms: Date.now() - start,
    }
  }
}

async function checkYamahaHealth(host: string, port: number): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    // Try a simple UPnP GetVolume request
    const response = await fetch(`http://${host}:${port}/upnp/control/rendercontrol1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"urn:schemas-upnp-org:service:RenderingControl:1#GetVolume"',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">
      <InstanceID>0</InstanceID>
      <Channel>Master</Channel>
    </u:GetVolume>
  </s:Body>
</s:Envelope>`,
      signal: AbortSignal.timeout(3000),
    })
    const latency = Date.now() - start
    return {
      online: response.ok,
      status: response.ok ? 'online' : 'degraded',
      latency_ms: latency,
    }
  } catch (error) {
    return {
      online: false,
      status: 'offline',
      error: (error as Error).message,
      latency_ms: Date.now() - start,
    }
  }
}

async function checkSshHealth(host: string, port: number): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    // Use net module for TCP connection check (cross-platform)
    const net = require('net')
    const online = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(3000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
      socket.connect(port, host)
    })
    const latency = Date.now() - start
    if (online) {
      return {
        online: true,
        status: 'online',
        latency_ms: latency,
      }
    }
    return {
      online: false,
      status: 'offline',
      latency_ms: latency,
    }
  } catch (error) {
    return {
      online: false,
      status: 'offline',
      error: (error as Error).message,
      latency_ms: Date.now() - start,
    }
  }
}

async function checkOllamaHealth(host: string, port: number): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    const response = await fetch(`http://${host}:${port}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    const latency = Date.now() - start

    if (response.ok) {
      const data = await response.json() as { models?: unknown[] }
      return {
        online: true,
        status: 'online',
        latency_ms: latency,
        details: { models_count: data.models?.length ?? 0 },
      }
    }
    return {
      online: false,
      status: 'degraded',
      latency_ms: latency,
    }
  } catch (error) {
    return {
      online: false,
      status: 'offline',
      error: (error as Error).message,
      latency_ms: Date.now() - start,
    }
  }
}

async function checkHttpHealth(host: string, port: number): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    const response = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(3000),
    })
    const latency = Date.now() - start
    return {
      online: response.ok || response.status < 500,
      status: response.ok ? 'online' : 'degraded',
      latency_ms: latency,
    }
  } catch (error) {
    return {
      online: false,
      status: 'offline',
      error: (error as Error).message,
      latency_ms: Date.now() - start,
    }
  }
}

async function checkDeviceHealth(
  type: string,
  host: string,
  port: number
): Promise<HealthCheckResult> {
  switch (type) {
    case 'roku':
      return checkRokuHealth(host, port)
    case 'yamaha':
      return checkYamahaHealth(host, port)
    case 'ssh':
      return checkSshHealth(host, port)
    case 'ollama':
      return checkOllamaHealth(host, port)
    case 'http':
    default:
      return checkHttpHealth(host, port)
  }
}

// ============================================================================
// Device Command Execution
// ============================================================================

async function executeRokuCommand(
  host: string,
  port: number,
  command: string,
  args?: string[]
): Promise<DeviceCommandResult> {
  const baseUrl = `http://${host}:${port}`
  const start = Date.now()

  try {
    switch (command) {
      case 'launch': {
        const app = args?.[0]
        if (!app) {
          return { success: false, error: 'App name required' }
        }
        const appId = ROKU_APPS[app] ?? app
        await fetch(`${baseUrl}/launch/${appId}`, { method: 'POST' })
        return { success: true, output: `Launched ${app}`, duration_ms: Date.now() - start }
      }

      case 'keypress': {
        const key = args?.[0]
        if (!key) {
          return { success: false, error: 'Key name required' }
        }
        await fetch(`${baseUrl}/keypress/${key}`, { method: 'POST' })
        return { success: true, output: `Pressed ${key}`, duration_ms: Date.now() - start }
      }

      case 'info': {
        const response = await fetch(`${baseUrl}/query/device-info`)
        const text = await response.text()
        // Parse basic info from XML
        const modelMatch = text.match(/<model-name>([^<]+)</)
        const powerMatch = text.match(/<power-mode>([^<]+)</)
        return {
          success: true,
          output: {
            model: modelMatch?.[1],
            power: powerMatch?.[1],
          },
          duration_ms: Date.now() - start,
        }
      }

      case 'apps': {
        const response = await fetch(`${baseUrl}/query/apps`)
        const text = await response.text()
        const apps: Array<{ id: string; name: string }> = []
        const matches = text.matchAll(/id="(\d+)"[^>]*>([^<]+)</g)
        for (const match of matches) {
          apps.push({ id: match[1], name: match[2] })
        }
        return { success: true, output: apps, duration_ms: Date.now() - start }
      }

      default:
        return { success: false, error: `Unknown Roku command: ${command}` }
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      duration_ms: Date.now() - start,
    }
  }
}

async function executeYamahaCommand(
  host: string,
  port: number,
  command: string,
  args?: string[]
): Promise<DeviceCommandResult> {
  const controlUrl = `http://${host}:${port}/upnp/control/rendercontrol1`
  const start = Date.now()

  const soapRequest = async (action: string, body: string) => {
    return fetch(controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `"urn:schemas-upnp-org:service:RenderingControl:1#${action}"`,
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">
      <InstanceID>0</InstanceID>
      ${body}
    </u:${action}>
  </s:Body>
</s:Envelope>`,
    })
  }

  try {
    switch (command) {
      case 'volume': {
        const level = args?.[0]
        if (level === undefined) {
          // Get volume
          const response = await soapRequest('GetVolume', '<Channel>Master</Channel>')
          const text = await response.text()
          const match = text.match(/<CurrentVolume>(\d+)</)
          return {
            success: true,
            output: { volume: match ? parseInt(match[1]) : null },
            duration_ms: Date.now() - start,
          }
        } else {
          // Set volume
          await soapRequest('SetVolume', `<Channel>Master</Channel><DesiredVolume>${level}</DesiredVolume>`)
          return { success: true, output: `Volume set to ${level}`, duration_ms: Date.now() - start }
        }
      }

      case 'mute': {
        const state = args?.[0]
        if (state === undefined) {
          // Get mute
          const response = await soapRequest('GetMute', '<Channel>Master</Channel>')
          const text = await response.text()
          const match = text.match(/<CurrentMute>(\d)</)
          return {
            success: true,
            output: { muted: match?.[1] === '1' },
            duration_ms: Date.now() - start,
          }
        } else {
          // Set mute
          const desired = state === 'on' || state === '1' || state === 'true' ? 1 : 0
          await soapRequest('SetMute', `<Channel>Master</Channel><DesiredMute>${desired}</DesiredMute>`)
          return { success: true, output: `Mute ${desired ? 'on' : 'off'}`, duration_ms: Date.now() - start }
        }
      }

      case 'status': {
        const volResponse = await soapRequest('GetVolume', '<Channel>Master</Channel>')
        const volText = await volResponse.text()
        const volMatch = volText.match(/<CurrentVolume>(\d+)</)

        const muteResponse = await soapRequest('GetMute', '<Channel>Master</Channel>')
        const muteText = await muteResponse.text()
        const muteMatch = muteText.match(/<CurrentMute>(\d)</)

        return {
          success: true,
          output: {
            volume: volMatch ? parseInt(volMatch[1]) : null,
            muted: muteMatch?.[1] === '1',
          },
          duration_ms: Date.now() - start,
        }
      }

      default:
        return { success: false, error: `Unknown Yamaha command: ${command}` }
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      duration_ms: Date.now() - start,
    }
  }
}

async function executeDeviceCommand(
  device: typeof schema.devices.$inferSelect,
  command: string,
  args?: string[]
): Promise<DeviceCommandResult> {
  const port = device.port ?? DEFAULT_PORTS[device.type as DeviceType] ?? 80

  switch (device.type) {
    case 'roku':
      return executeRokuCommand(device.host, port, command, args)
    case 'yamaha':
      return executeYamahaCommand(device.host, port, command, args)
    default:
      return { success: false, error: `Commands not supported for device type: ${device.type}` }
  }
}

// ============================================================================
// Routes
// ============================================================================

// List all devices
app.get('/', async (c) => {
  const type = c.req.query('type')
  const status = c.req.query('status')

  const devices = await queries.getDevices({
    type: type || undefined,
    status: status || undefined,
  })

  return c.json(devices.map(queries.parseDevice))
})

// Get device status summary
app.get('/status', async (c) => {
  const devices = await queries.getDevices()

  const summary = {
    total: devices.length,
    online: devices.filter((d) => d.status === 'online').length,
    offline: devices.filter((d) => d.status === 'offline').length,
    degraded: devices.filter((d) => d.status === 'degraded').length,
    unknown: devices.filter((d) => d.status === 'unknown').length,
    devices: devices.map((d) => ({
      name: d.name,
      type: d.type,
      status: d.status,
      last_seen: d.last_seen,
      response_time_ms: d.response_time_ms,
    })),
  }

  return c.json(summary)
})

// Health check all devices
app.post('/health-check', async (c) => {
  const devices = await queries.getDevices()
  const results: Array<{ name: string; status: string; latency_ms?: number }> = []

  for (const device of devices) {
    const port = device.port ?? DEFAULT_PORTS[device.type as DeviceType] ?? 80
    const health = await checkDeviceHealth(device.type, device.host, port)

    // Update device status
    await queries.updateDevice(device.id, {
      status: health.status,
      last_seen: health.online ? new Date().toISOString() : device.last_seen ?? undefined,
      last_error: health.error,
      response_time_ms: health.latency_ms,
    })

    results.push({
      name: device.name,
      status: health.status,
      latency_ms: health.latency_ms,
    })

    // Broadcast status change
    if (health.status !== device.status) {
      broadcast('device:status', {
        type: 'device:status',
        device: device.name,
        status: health.status,
        previous: device.status,
        timestamp: new Date().toISOString(),
      })
    }
  }

  return c.json({ checked: results.length, results })
})

// Get single device
app.get('/:id', async (c) => {
  const id = c.req.param('id')

  // Try by ID first, then by name
  let device = await queries.getDevice(id)
  if (!device) {
    device = await queries.getDeviceByName(id)
  }

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  return c.json(queries.parseDevice(device))
})

// Add device
app.post('/', zValidator('json', DeviceCreate), async (c) => {
  const data = c.req.valid('json')

  // Check if name already exists
  const existing = await queries.getDeviceByName(data.name)
  if (existing) {
    return c.json({ error: 'Device with this name already exists' }, 409)
  }

  // Set defaults based on type
  const port = data.port ?? DEFAULT_PORTS[data.type] ?? undefined
  const protocol = data.protocol ?? DEFAULT_PROTOCOLS[data.type] ?? 'http'

  const device = await queries.createDevice({
    name: data.name,
    type: data.type,
    host: data.host,
    port,
    protocol,
    config: data.config,
    description: data.description,
  })

  broadcast('device:added', {
    type: 'device:added',
    device: queries.parseDevice(device as typeof schema.devices.$inferSelect),
    timestamp: new Date().toISOString(),
  })

  return c.json(queries.parseDevice(device as typeof schema.devices.$inferSelect), 201)
})

// Update device
app.patch('/:id', zValidator('json', DeviceUpdate), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  let device = await queries.getDevice(id)
  if (!device) {
    device = await queries.getDeviceByName(id)
  }

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  const updated = await queries.updateDevice(device.id, data)

  broadcast('device:updated', {
    type: 'device:updated',
    device: queries.parseDevice(updated!),
    timestamp: new Date().toISOString(),
  })

  return c.json(queries.parseDevice(updated!))
})

// Delete device
app.delete('/:id', async (c) => {
  const id = c.req.param('id')

  let device = await queries.getDevice(id)
  if (!device) {
    device = await queries.getDeviceByName(id)
  }

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  await queries.deleteDevice(device.id)

  broadcast('device:removed', {
    type: 'device:removed',
    device: device.name,
    timestamp: new Date().toISOString(),
  })

  return c.json({ message: 'Device removed', name: device.name })
})

// Health check single device
app.post('/:id/health', async (c) => {
  const id = c.req.param('id')

  let device = await queries.getDevice(id)
  if (!device) {
    device = await queries.getDeviceByName(id)
  }

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  const port = device.port ?? DEFAULT_PORTS[device.type as DeviceType] ?? 80
  const health = await checkDeviceHealth(device.type, device.host, port)

  // Update device status
  await queries.updateDevice(device.id, {
    status: health.status,
    last_seen: health.online ? new Date().toISOString() : device.last_seen ?? undefined,
    last_error: health.error,
    response_time_ms: health.latency_ms,
  })

  // Broadcast status change
  if (health.status !== device.status) {
    broadcast('device:status', {
      type: 'device:status',
      device: device.name,
      status: health.status,
      previous: device.status,
      timestamp: new Date().toISOString(),
    })
  }

  return c.json({
    device: device.name,
    ...health,
  })
})

// Execute command on device
app.post('/:id/command', zValidator('json', DeviceCommandRequest), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  let device = await queries.getDevice(id)
  if (!device) {
    device = await queries.getDeviceByName(id)
  }

  if (!device) {
    return c.json({ error: 'Device not found' }, 404)
  }

  // Check device is online first
  if (device.status === 'offline') {
    return c.json({
      error: 'Device is offline',
      last_seen: device.last_seen,
      last_error: device.last_error,
    }, 503)
  }

  const result = await executeDeviceCommand(device, data.command, data.args)

  return c.json({
    device: device.name,
    command: data.command,
    ...result,
  })
})

export default app

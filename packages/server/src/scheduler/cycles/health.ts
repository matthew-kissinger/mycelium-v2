/**
 * Health Check Cycle
 *
 * Periodically checks all registered devices for connectivity
 * and updates their status in the database.
 *
 * Interval: 60 seconds (configurable)
 */

import { SchedulerConfig } from '@mycelium/shared'
import { db, schema } from '../../db'
import { broadcast } from '../../sse'
import * as queries from '../../db/queries'
import { DEFAULT_PORTS, type DeviceType } from '@mycelium/shared'

// Health check functions by device type
async function checkRokuHealth(host: string, port: number): Promise<{ online: boolean; latency: number; error?: string }> {
  const start = Date.now()
  try {
    const response = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(3000),
    })
    return { online: response.ok, latency: Date.now() - start }
  } catch (error) {
    return { online: false, latency: Date.now() - start, error: (error as Error).message }
  }
}

async function checkYamahaHealth(host: string, port: number): Promise<{ online: boolean; latency: number; error?: string }> {
  const start = Date.now()
  try {
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
    return { online: response.ok, latency: Date.now() - start }
  } catch (error) {
    return { online: false, latency: Date.now() - start, error: (error as Error).message }
  }
}

async function checkSshHealth(host: string, port: number): Promise<{ online: boolean; latency: number; error?: string }> {
  const start = Date.now()
  try {
    // Use net module for TCP connection check (more reliable cross-platform)
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
    return { online, latency: Date.now() - start }
  } catch (error) {
    return { online: false, latency: Date.now() - start, error: (error as Error).message }
  }
}

async function checkOllamaHealth(host: string, port: number): Promise<{ online: boolean; latency: number; error?: string }> {
  const start = Date.now()
  try {
    const response = await fetch(`http://${host}:${port}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    return { online: response.ok, latency: Date.now() - start }
  } catch (error) {
    return { online: false, latency: Date.now() - start, error: (error as Error).message }
  }
}

async function checkHttpHealth(host: string, port: number): Promise<{ online: boolean; latency: number; error?: string }> {
  const start = Date.now()
  try {
    const response = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(3000),
    })
    return { online: response.ok || response.status < 500, latency: Date.now() - start }
  } catch (error) {
    return { online: false, latency: Date.now() - start, error: (error as Error).message }
  }
}

async function checkDeviceHealth(type: string, host: string, port: number) {
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

/**
 * Run the health check cycle.
 * Checks all devices and updates their status.
 */
export async function runHealthCheckCycle(config: SchedulerConfig): Promise<void> {
  const devices = await queries.getDevices()

  if (devices.length === 0) {
    console.log('[Health] No devices to check')
    return
  }

  console.log(`[Health] Checking ${devices.length} devices...`)

  let changed = 0

  for (const device of devices) {
    const port = device.port ?? DEFAULT_PORTS[device.type as DeviceType] ?? 80
    const health = await checkDeviceHealth(device.type, device.host, port)

    const newStatus = health.online ? 'online' : 'offline'
    const statusChanged = newStatus !== device.status

    // Update device
    await queries.updateDevice(device.id, {
      status: newStatus,
      last_seen: health.online ? new Date().toISOString() : device.last_seen ?? undefined,
      last_error: health.error,
      response_time_ms: health.latency,
    })

    if (statusChanged) {
      changed++
      console.log(`[Health] ${device.name}: ${device.status} -> ${newStatus}`)

      // Broadcast status change
      broadcast('device:status', {
        type: 'device:status',
        device: device.name,
        status: newStatus,
        previous: device.status,
        latency_ms: health.latency,
        timestamp: new Date().toISOString(),
      })
    }
  }

  console.log(`[Health] Checked ${devices.length} devices, ${changed} status changes`)
}

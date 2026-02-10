import { eq, sql } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'
import { parseJsonColumn, buildWhere } from '../serialize'

// ============================================================================
// Types
// ============================================================================

export interface DeviceCreateInput {
  name: string
  type: string
  host: string
  port?: number
  protocol?: string
  config?: Record<string, unknown>
  description?: string
}

export interface DeviceUpdateInput {
  name?: string
  host?: string
  port?: number
  protocol?: string
  config?: Record<string, unknown>
  description?: string
  status?: string
  last_seen?: string
  last_error?: string
  response_time_ms?: number
}

// ============================================================================
// CRUD
// ============================================================================

export async function getDevices(options?: { type?: string; status?: string }) {
  const { type, status } = options ?? {}

  const where = buildWhere(
    type ? eq(schema.devices.type, type) : undefined,
    status ? eq(schema.devices.status, status) : undefined,
  )

  if (where) {
    return db.select().from(schema.devices)
      .where(where)
      .orderBy(schema.devices.name)
  }

  return db.select().from(schema.devices).orderBy(schema.devices.name)
}

export async function getDevice(id: string) {
  const rows = await db.select().from(schema.devices).where(eq(schema.devices.id, id))
  return rows[0] ?? null
}

export async function getDeviceByName(name: string) {
  const rows = await db.select().from(schema.devices).where(eq(schema.devices.name, name))
  return rows[0] ?? null
}

export async function createDevice(input: DeviceCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const device = {
    id,
    name: input.name,
    type: input.type,
    host: input.host,
    port: input.port ?? null,
    protocol: input.protocol ?? 'http',
    config: input.config ? JSON.stringify(input.config) : null,
    description: input.description ?? null,
    status: 'unknown',
    created_at: now,
  }

  await db.insert(schema.devices).values(device)
  return device
}

export async function updateDevice(id: string, input: DeviceUpdateInput) {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.name !== undefined) updates.name = input.name
  if (input.host !== undefined) updates.host = input.host
  if (input.port !== undefined) updates.port = input.port
  if (input.protocol !== undefined) updates.protocol = input.protocol
  if (input.description !== undefined) updates.description = input.description
  if (input.status !== undefined) updates.status = input.status
  if (input.last_seen !== undefined) updates.last_seen = input.last_seen
  if (input.last_error !== undefined) updates.last_error = input.last_error
  if (input.response_time_ms !== undefined) updates.response_time_ms = input.response_time_ms
  if (input.config !== undefined) updates.config = JSON.stringify(input.config)

  await db.update(schema.devices).set(updates).where(eq(schema.devices.id, id))

  return getDevice(id)
}

export async function deleteDevice(id: string) {
  await db.delete(schema.devices).where(eq(schema.devices.id, id))
}

export function parseDevice(device: typeof schema.devices.$inferSelect) {
  return {
    ...device,
    config: parseJsonColumn<Record<string, unknown> | null>(device.config, null),
  }
}

export async function getDevicesForHealthCheck(maxAgeMs = 60000) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString()

  return db.select().from(schema.devices)
    .where(sql`${schema.devices.last_seen} IS NULL OR ${schema.devices.last_seen} < ${cutoff} OR ${schema.devices.status} = 'unknown'`)
    .orderBy(schema.devices.name)
}

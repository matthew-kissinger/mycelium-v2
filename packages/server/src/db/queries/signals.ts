import { eq, desc } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'
import { parseJsonColumn } from '../serialize'

// ============================================================================
// Types
// ============================================================================

export interface SignalCreateInput {
  question: string
  options?: string[]
  task_id?: string
  repo_path?: string
}

// ============================================================================
// CRUD
// ============================================================================

export async function getSignals(options?: { status?: string; limit?: number }) {
  const { status, limit = 50 } = options ?? {}

  if (status) {
    return db.select().from(schema.signals)
      .where(eq(schema.signals.status, status))
      .orderBy(desc(schema.signals.created_at))
      .limit(limit)
  }

  return db.select().from(schema.signals)
    .orderBy(desc(schema.signals.created_at))
    .limit(limit)
}

export async function getSignal(id: string) {
  const rows = await db.select().from(schema.signals).where(eq(schema.signals.id, id))
  return rows[0] ?? null
}

export async function createSignal(input: SignalCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const signal = {
    id,
    question: input.question,
    options: input.options ? JSON.stringify(input.options) : null,
    status: 'pending',
    task_id: input.task_id ?? null,
    repo_path: input.repo_path ?? null,
    created_at: now,
  }

  await db.insert(schema.signals).values(signal)
  return signal
}

export async function respondToSignal(id: string, response: string) {
  const now = new Date().toISOString()

  await db.update(schema.signals).set({
    status: 'responded',
    response,
    responded_at: now,
  }).where(eq(schema.signals.id, id))

  return getSignal(id)
}

export async function getPendingSignals(limit = 50) {
  return db.select().from(schema.signals)
    .where(eq(schema.signals.status, 'pending'))
    .orderBy(desc(schema.signals.created_at))
    .limit(limit)
}

export function parseSignal(signal: typeof schema.signals.$inferSelect) {
  return {
    ...signal,
    options: parseJsonColumn<string[] | null>(signal.options, null),
  }
}

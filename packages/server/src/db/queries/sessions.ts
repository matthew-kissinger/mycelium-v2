import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'

// ============================================================================
// Types
// ============================================================================

export interface FruitingSessionCreateInput {
  task_id: string
  repo_path: string
  agent?: string
  model?: string
  context_trace?: object
  full_prompt?: string
  session_log?: Array<{ chunk: string; stream: string; timestamp: string }>
}

// ============================================================================
// CRUD
// ============================================================================

export async function createFruitingSession(input: FruitingSessionCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const session = {
    id,
    task_id: input.task_id,
    repo_path: input.repo_path,
    agent: input.agent ?? null,
    model: input.model ?? null,
    context_trace: input.context_trace ? JSON.stringify(input.context_trace) : null,
    full_prompt: input.full_prompt ?? null,
    session_log: input.session_log ? JSON.stringify(input.session_log) : null,
    created_at: now,
  }

  await db.insert(schema.fruiting_sessions).values(session)
  return session
}

export async function getFruitingSessionsByTask(taskId: string) {
  return db.select().from(schema.fruiting_sessions)
    .where(eq(schema.fruiting_sessions.task_id, taskId))
    .orderBy(desc(schema.fruiting_sessions.created_at))
}

export async function cleanExpiredSessionLogs(ttlMs = 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - ttlMs).toISOString()

  const result = await db.update(schema.fruiting_sessions)
    .set({ session_log: null })
    .where(and(
      sql`${schema.fruiting_sessions.created_at} < ${cutoff}`,
      sql`${schema.fruiting_sessions.session_log} IS NOT NULL`
    ))

  return result
}

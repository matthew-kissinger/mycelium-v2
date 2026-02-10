import { eq, and, desc, lt } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'
import { parseJsonColumn, buildWhere } from '../serialize'

// ============================================================================
// Types
// ============================================================================

export type SystemAgentType = 'discovery' | 'shepherd' | 'armory' | 'genesis' | 'digest' | 'compaction'
export type SystemAgentStatus = 'running' | 'completed' | 'failed' | 'blocked'

export interface SystemAgentRunCreateInput {
  agent_type: SystemAgentType
  repo_path?: string
  context?: object
}

export interface SystemAgentRunUpdateInput {
  status?: SystemAgentStatus
  output?: string
  error?: string
  completed_at?: string
}

// ============================================================================
// CRUD
// ============================================================================

export async function getRuns(options?: { agent_type?: string; status?: string; limit?: number }) {
  const { agent_type, status, limit = 50 } = options ?? {}

  const where = buildWhere(
    agent_type ? eq(schema.system_agent_runs.agent_type, agent_type) : undefined,
    status ? eq(schema.system_agent_runs.status, status) : undefined,
  )

  if (where) {
    return db.select().from(schema.system_agent_runs)
      .where(where)
      .orderBy(desc(schema.system_agent_runs.started_at))
      .limit(limit)
  }

  return db.select().from(schema.system_agent_runs)
    .orderBy(desc(schema.system_agent_runs.started_at))
    .limit(limit)
}

export async function getRun(id: string) {
  const rows = await db.select().from(schema.system_agent_runs).where(eq(schema.system_agent_runs.id, id))
  return rows[0] ?? null
}

export async function createRun(input: SystemAgentRunCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const run = {
    id,
    agent_type: input.agent_type,
    status: 'running',
    repo_path: input.repo_path ?? null,
    context: input.context ? JSON.stringify(input.context) : null,
    started_at: now,
  }

  await db.insert(schema.system_agent_runs).values(run)
  return run
}

export async function updateRun(id: string, input: SystemAgentRunUpdateInput) {
  const updates: Record<string, unknown> = {}

  if (input.status !== undefined) updates.status = input.status
  if (input.output !== undefined) updates.output = input.output
  if (input.error !== undefined) updates.error = input.error
  if (input.completed_at !== undefined) updates.completed_at = input.completed_at

  await db.update(schema.system_agent_runs).set(updates).where(eq(schema.system_agent_runs.id, id))

  return getRun(id)
}

export async function completeRun(id: string, output?: string) {
  return updateRun(id, {
    status: 'completed',
    output,
    completed_at: new Date().toISOString(),
  })
}

export async function failRun(id: string, error: string) {
  return updateRun(id, {
    status: 'failed',
    error,
    completed_at: new Date().toISOString(),
  })
}

export async function cleanupOrphanedRuns(thresholdHours: number = 1): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()

  const orphaned = await db.select()
    .from(schema.system_agent_runs)
    .where(and(
      eq(schema.system_agent_runs.status, 'running'),
      lt(schema.system_agent_runs.started_at, cutoff)
    ))

  let cleaned = 0
  for (const run of orphaned) {
    const age = ((Date.now() - new Date(run.started_at).getTime()) / 3600000).toFixed(1)
    console.log(`[Cleanup] Marking orphaned ${run.agent_type} run ${run.id.slice(0, 8)} as failed (${age}h old)`)

    await updateRun(run.id, {
      status: 'failed',
      error: `Orphaned - server restart or process died after ${age}h`,
      completed_at: new Date().toISOString(),
    })
    cleaned++
  }

  return cleaned
}

export function parseRun(run: typeof schema.system_agent_runs.$inferSelect) {
  return {
    ...run,
    context: parseJsonColumn<object | null>(run.context, null),
  }
}

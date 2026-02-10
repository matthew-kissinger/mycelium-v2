import { eq } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'

// ============================================================================
// Types
// ============================================================================

export interface SchedulerCycleStats {
  cycle_name: string
  runs_completed: number
  errors: number
  last_run_at: string | null
  last_duration_ms: number | null
  last_error: string | null
  updated_at: string | null
}

// ============================================================================
// CRUD
// ============================================================================

export async function upsertSchedulerStats(
  cycleName: string,
  success: boolean,
  durationMs: number,
  error?: string
): Promise<void> {
  const now = new Date().toISOString()

  const existing = await db.select().from(schema.scheduler_stats)
    .where(eq(schema.scheduler_stats.cycle_name, cycleName))

  if (existing.length === 0) {
    await db.insert(schema.scheduler_stats).values({
      cycle_name: cycleName,
      runs_completed: success ? 1 : 0,
      errors: success ? 0 : 1,
      last_run_at: now,
      last_duration_ms: durationMs,
      last_error: error ?? null,
      updated_at: now,
    })
  } else {
    const current = existing[0]
    await db.update(schema.scheduler_stats)
      .set({
        runs_completed: (current.runs_completed ?? 0) + (success ? 1 : 0),
        errors: (current.errors ?? 0) + (success ? 0 : 1),
        last_run_at: now,
        last_duration_ms: durationMs,
        last_error: error ?? current.last_error,
        updated_at: now,
      })
      .where(eq(schema.scheduler_stats.cycle_name, cycleName))
  }
}

export async function getSchedulerStats(): Promise<SchedulerCycleStats[]> {
  const rows = await db.select().from(schema.scheduler_stats)
  return rows.map(r => ({
    ...r,
    runs_completed: r.runs_completed ?? 0,
    errors: r.errors ?? 0,
  }))
}

export async function getSchedulerStatsForCycle(cycleName: string): Promise<SchedulerCycleStats | null> {
  const rows = await db.select().from(schema.scheduler_stats)
    .where(eq(schema.scheduler_stats.cycle_name, cycleName))
  if (!rows[0]) return null
  return {
    ...rows[0],
    runs_completed: rows[0].runs_completed ?? 0,
    errors: rows[0].errors ?? 0,
  }
}

import { eq, and, desc, inArray, lt, sql } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'

export async function cleanExpiredSessionPrompts(retentionDays = 7) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

  return db.update(schema.fruiting_sessions)
    .set({ full_prompt: null })
    .where(and(
      sql`${schema.fruiting_sessions.created_at} < ${cutoff}`,
      sql`${schema.fruiting_sessions.full_prompt} IS NOT NULL`
    ))
}

export async function pruneConfigHistory(retentionDays = 90, maxEntries = 1000): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

  await db.delete(schema.config_history)
    .where(lt(schema.config_history.changed_at, cutoff))

  const allEntries = await db.select({ id: schema.config_history.id })
    .from(schema.config_history)
    .orderBy(desc(schema.config_history.changed_at))

  if (allEntries.length > maxEntries) {
    const toDelete = allEntries.slice(maxEntries).map(e => e.id)
    if (toDelete.length > 0) {
      await db.delete(schema.config_history)
        .where(inArray(schema.config_history.id, toDelete))
    }
    return toDelete.length
  }

  return 0
}

export async function pruneFailedAndCancelledTasks(retentionDays = 30, keepRecent = 50): Promise<number> {
  let pruned = 0

  for (const status of ['failed', 'cancelled'] as const) {
    const tasks = await db.select({ id: schema.tasks.id, completed_at: schema.tasks.completed_at, created_at: schema.tasks.created_at })
      .from(schema.tasks)
      .where(eq(schema.tasks.status, status))
      .orderBy(desc(schema.tasks.completed_at))

    if (tasks.length <= keepRecent) continue

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

    const candidates = tasks.slice(keepRecent)
    const toDelete = candidates.filter(t => {
      const time = t.completed_at ?? t.created_at
      return time < cutoff
    })

    if (toDelete.length > 0) {
      const ids = toDelete.map(t => t.id)
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids))
      pruned += ids.length
    }
  }

  return pruned
}

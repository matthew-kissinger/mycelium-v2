import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../db'

const app = new Hono()

// Get stats
app.get('/', async (c) => {
  const rows = await db.select().from(schema.tasks)

  const stats = {
    total_tasks: rows.length,
    pending: rows.filter((t) => t.status === 'pending').length,
    running: rows.filter((t) => t.status === 'running').length,
    done: rows.filter((t) => t.status === 'done').length,
    failed: rows.filter((t) => t.status === 'failed').length,
    total_cost_usd: rows.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0),
  }

  return c.json(stats)
})

export default app

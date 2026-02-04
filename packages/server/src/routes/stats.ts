import { Hono } from 'hono'
import { db, schema } from '../db'

const app = new Hono()

// Per-use agents (pay-per-token via OpenRouter)
const PER_USE_AGENTS = new Set(['cline'])

// Get stats
app.get('/', async (c) => {
  const rows = await db.select().from(schema.tasks)

  let perUseCost = 0
  let subscriptionTaskCount = 0

  for (const t of rows) {
    if (t.status === 'done' || t.status === 'failed') {
      if (PER_USE_AGENTS.has(t.agent || '')) {
        perUseCost += t.cost_usd ?? 0
      } else {
        subscriptionTaskCount++
      }
    }
  }

  // Pipeline sub-states for pending tasks
  const pendingRows = rows.filter((t) => t.status === 'pending')
  const unsequenced = pendingRows.filter((t) => !t.sequenced).length
  const sequencedPending = pendingRows.filter((t) => t.sequenced)

  const doneIds = new Set(rows.filter((t) => t.status === 'done').map((t) => t.id))
  const ready = sequencedPending.filter((t) => {
    const deps = JSON.parse((t.depends_on as string) || '[]') as string[]
    return deps.length === 0 || deps.every((d) => doneIds.has(d))
  }).length
  const waiting = sequencedPending.length - ready

  const stats = {
    total_tasks: rows.length,
    pending: pendingRows.length,
    running: rows.filter((t) => t.status === 'running').length,
    done: rows.filter((t) => t.status === 'done').length,
    failed: rows.filter((t) => t.status === 'failed').length,
    cancelled: rows.filter((t) => t.status === 'cancelled').length,
    total_cost_usd: rows.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0),
    per_use_cost_usd: perUseCost,
    subscription_task_count: subscriptionTaskCount,
    unsequenced,
    waiting,
    ready,
  }

  return c.json(stats)
})

export default app

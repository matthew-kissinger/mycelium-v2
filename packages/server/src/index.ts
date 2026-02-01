import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import tasksRoutes from './routes/tasks'
import reposRoutes from './routes/repos'
import statsRoutes from './routes/stats'
import { createSSEResponse, getClientCount } from './sse'
import { db, schema } from './db'
import { sql } from 'drizzle-orm'

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger())

// Health check
app.get('/api/health', (c) => {
  return c.json({
    backend: true,
    scheduler: false, // TODO: implement scheduler
    poller: false, // TODO: implement Telegram poller
    uptime_seconds: Math.floor(process.uptime()),
    sse_clients: getClientCount(),
  })
})

// SSE endpoint for real-time updates
app.get('/api/events', (c) => {
  return createSSEResponse()
})

// API routes
app.route('/api/tasks', tasksRoutes)
app.route('/api/repos', reposRoutes)
app.route('/api/stats', statsRoutes)

// Initialize database tables
async function initDb() {
  // Create tables if they don't exist
  const sqlite = (db as any).session.client

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      agent TEXT,
      model TEXT,
      repo_path TEXT NOT NULL,
      prompt TEXT,
      depends_on TEXT DEFAULT '[]',
      sequenced INTEGER DEFAULT 0,
      result TEXT,
      parsed_result TEXT,
      error TEXT,
      error_details TEXT,
      cost_usd REAL DEFAULT 0,
      duration_seconds REAL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      shepherd_evaluated_at TEXT,
      armory_reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      language TEXT,
      mode TEXT NOT NULL DEFAULT 'align',
      created_at TEXT NOT NULL,
      last_scanned_at TEXT
    );

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      options TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      response TEXT,
      task_id TEXT,
      repo_path TEXT,
      created_at TEXT NOT NULL,
      responded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_patterns (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      task_id TEXT,
      repo_path TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_warnings (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      task_id TEXT,
      repo_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_agent_runs (
      id TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      repo_path TEXT,
      context TEXT,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
  `)

  console.log('Database initialized')
}

// Start server
const port = parseInt(process.env.PORT ?? '8000')

initDb().then(() => {
  console.log(`Server running at http://localhost:${port}`)
})

export default {
  port,
  fetch: app.fetch,
}

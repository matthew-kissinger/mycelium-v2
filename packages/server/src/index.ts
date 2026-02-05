import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import tasksRoutes from './routes/tasks'
import reposRoutes from './routes/repos'
import statsRoutes from './routes/stats'
import memoryRoutes from './routes/memory'
import signalsRoutes from './routes/signals'
import notifyRoutes from './routes/notify'
import queueRoutes from './routes/queue'
import orchestrateRoutes from './routes/orchestrate'
import hooksRoutes from './routes/hooks'
import exportRoutes from './routes/export'
import configRoutes from './routes/config'
import promptsRoutes from './routes/prompts'
import inventoryRoutes from './routes/inventory'
import devicesRoutes from './routes/devices'
import {
  systemAgentsRoutes,
  discoveryRoutes,
  shepherdRoutes,
  schedulerRoutes,
  compactionRoutes,
  digestRoutes,
} from './routes/system-agents'
import { getSchedulerStatus } from './scheduler'
import { getRuns, parseRun, cleanupOrphanedRuns } from './db/queries'
import { createSSEResponse, getClientCount, getClientInfo, shutdown as shutdownSSE } from './sse'
import { shutdownRegistry, getRunningProcessCount, cleanupClineInstances, getHealthSummary, checkOpenRouterCredits, checkClineCredits, getClineProvider, getOpenRouterFreeModels } from './agents'
import { db, schema } from './db'
import { sql } from 'drizzle-orm'
import { initTelegramService, getTelegramService, shutdownTelegramService } from './telegram'
import { startPoller, stopPoller, isPollerRunning } from './telegram/poller'

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger())

// Health check
app.get('/api/health', async (c) => {
  const telegram = getTelegramService()
  const schedulerStatus = getSchedulerStatus()
  const runningSystemAgents = await getRuns({ status: 'running' })

  // Get agent health and quota info (async API calls in parallel)
  const [agentHealth, openrouterCredits, clineCredits, clineProvider, freeModels] = await Promise.all([
    Promise.resolve(getHealthSummary()),
    checkOpenRouterCredits(),
    checkClineCredits(),
    getClineProvider(),
    getOpenRouterFreeModels(),
  ])

  return c.json({
    backend: true,
    scheduler: schedulerStatus.running,
    scheduler_cycles: schedulerStatus.cycles.filter(cy => cy.running).map(cy => cy.name),
    running_system_agents: runningSystemAgents.map(r => ({
      id: r.id,
      agent_type: r.agent_type,
      repo_path: r.repo_path,
      started_at: r.started_at,
    })),
    poller: isPollerRunning(),
    telegram_connected: telegram?.isConnected() ?? false,
    uptime_seconds: Math.floor(process.uptime()),
    sse_clients: getClientCount(),
    running_agents: getRunningProcessCount(),
    agent_health: agentHealth,
    cline: {
      provider: clineProvider,
      openrouter_credits: openrouterCredits,
      cline_credits: clineCredits,
      free_models: freeModels,
    },
  })
})

// SSE endpoint for real-time updates
// Query param: topics - comma-separated list of topics to subscribe to
// Examples:
//   /api/events (subscribe to all)
//   /api/events?topics=task:* (all task events)
//   /api/events?topics=task:123,signal:* (specific task + all signals)
app.get('/api/events', (c) => {
  const topics = c.req.query('topics') ?? null
  return createSSEResponse(topics)
})

// SSE clients endpoint for debugging/monitoring
app.get('/api/events/clients', (c) => {
  return c.json({
    count: getClientCount(),
    clients: getClientInfo(),
  })
})

// API routes
app.route('/api/tasks', tasksRoutes)
app.route('/api/repos', reposRoutes)
app.route('/api/stats', statsRoutes)
app.route('/api/memory', memoryRoutes)
app.route('/api/signals', signalsRoutes)
app.route('/api', notifyRoutes)  // For /api/notify, /api/align, /api/inbox, /api/status

// System agent routes
app.route('/api/system-agents', systemAgentsRoutes)
app.route('/api/discovery', discoveryRoutes)
app.route('/api/shepherd', shepherdRoutes)
app.route('/api/scheduler', schedulerRoutes)
app.route('/api/compaction', compactionRoutes)
app.route('/api/digest', digestRoutes)

// New routes
app.route('/api/queue', queueRoutes)
app.route('/api/orchestrate', orchestrateRoutes)
app.route('/api/hooks', hooksRoutes)
app.route('/api/export', exportRoutes)
app.route('/api/config', configRoutes)
app.route('/api/prompts', promptsRoutes)
app.route('/api/inventory', inventoryRoutes)
app.route('/api/devices', devicesRoutes)

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
      weight INTEGER DEFAULT 50,
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
      telegram_message_id INTEGER,
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

    CREATE TABLE IF NOT EXISTS shepherd_evaluations (
      id TEXT PRIMARY KEY,
      repo_path TEXT NOT NULL,
      evaluated_at TEXT NOT NULL,
      tasks_evaluated TEXT NOT NULL,
      health TEXT NOT NULL,
      headline TEXT NOT NULL,
      concerns TEXT,
      wins TEXT,
      recommendation TEXT,
      global_patterns TEXT,
      global_warnings TEXT,
      branch_evaluations TEXT,
      raw_response TEXT
    );

    CREATE TABLE IF NOT EXISTS config_overrides (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT DEFAULT 'api'
    );

    CREATE TABLE IF NOT EXISTS prompt_overrides (
      prompt_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config_history (
      id TEXT PRIMARY KEY,
      config_key TEXT NOT NULL,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT NOT NULL,
      changed_by TEXT DEFAULT 'api'
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER,
      protocol TEXT DEFAULT 'http',
      status TEXT DEFAULT 'unknown',
      last_seen TEXT,
      last_error TEXT,
      response_time_ms INTEGER,
      config TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `)

  // Migrations for existing databases
  try {
    // Add weight column to repos if it doesn't exist
    sqlite.exec(`ALTER TABLE repos ADD COLUMN weight INTEGER DEFAULT 50;`)
  } catch {
    // Column already exists
  }

  try {
    // Add provider column to tasks for cline auth selection
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN provider TEXT;`)
  } catch {
    // Column already exists
  }

  console.log('Database initialized')
}

// Initialize Telegram service and start polling
async function initTelegram() {
  const telegram = await initTelegramService()
  if (telegram) {
    startPoller(telegram)
    console.log('Telegram poller started with continuation agent support')
  } else {
    console.log('Telegram not configured, skipping initialization')
  }
}

// Start server
// Use 8765 to avoid conflicts with agents starting dev servers on common ports (8000, 3000)
const port = parseInt(process.env.PORT ?? '8765')

initDb().then(async () => {
  console.log(`Server running at http://localhost:${port}`)

  // Clean up orphaned system agent runs from previous sessions
  const cleaned = await cleanupOrphanedRuns(1) // 1 hour threshold
  if (cleaned > 0) {
    console.log(`[Startup] Cleaned up ${cleaned} orphaned system agent runs`)
  }

  // Initialize Telegram after DB is ready
  await initTelegram()

  // Auto-start scheduler if configured via environment
  if (process.env.SCHEDULER_AUTO_START === 'true') {
    const { startScheduler } = await import('./scheduler')
    const status = startScheduler()
    console.log(`[Scheduler] Auto-started (${status.cycles.length} cycles)`)
  }
})

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n[SHUTDOWN] Received ${signal}, shutting down...`)

  // Kill all running agent processes and mark tasks as cancelled
  await shutdownRegistry()

  // Clean up cline instances
  await cleanupClineInstances()

  // Stop Telegram poller
  const telegram = getTelegramService()
  if (telegram) {
    stopPoller(telegram)
  }
  shutdownTelegramService()

  // Close SSE connections
  shutdownSSE()

  console.log('[SHUTDOWN] Complete')
  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

export default {
  port,
  hostname: '0.0.0.0',  // Bind to all interfaces for local network access
  fetch: app.fetch,
}

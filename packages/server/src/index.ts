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
import githubWebhookRoutes from './routes/github-webhook'
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
import { shutdownRegistry, getRunningProcessCount, cleanupClineInstances, cleanupAllWorkspaces, getHealthSummary, checkOpenRouterCredits, checkClineCredits, getClineProvider, getOpenRouterFreeModels, checkAllProviderStatus } from './agents'
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
  const [agentHealth, openrouterCredits, clineCredits, clineProvider, freeModels, providerStatus] = await Promise.all([
    Promise.resolve(getHealthSummary()),
    checkOpenRouterCredits(),
    checkClineCredits(),
    getClineProvider(),
    getOpenRouterFreeModels(),
    checkAllProviderStatus(),
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
    providers: providerStatus,
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
app.route('/api/github', githubWebhookRoutes)

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

  try {
    // Add worktree_path column for workspace isolation
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN worktree_path TEXT;`)
  } catch {
    // Column already exists
  }

  try {
    // Add branch_name column for worktree branch tracking
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN branch_name TEXT;`)
  } catch {
    // Column already exists
  }

  try {
    // Add skills column to tasks (JSON array of skill names)
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN skills TEXT DEFAULT '[]';`)
  } catch {
    // Column already exists
  }

  try {
    // Add skills column to repos (JSON array of detected skill names)
    sqlite.exec(`ALTER TABLE repos ADD COLUMN skills TEXT DEFAULT '[]';`)
  } catch {
    // Column already exists
  }

  try {
    // Add token usage tracking columns to tasks
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN input_tokens INTEGER;`)
  } catch {
    // Column already exists
  }

  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN output_tokens INTEGER;`)
  } catch {
    // Column already exists
  }

  // Add missing columns from schema.ts that were never migrated
  const taskMigrations = [
    `ALTER TABLE tasks ADD COLUMN timeout_seconds INTEGER;`,
    `ALTER TABLE tasks ADD COLUMN spec_context TEXT;`,
    `ALTER TABLE tasks ADD COLUMN retry_context TEXT;`,
    `ALTER TABLE tasks ADD COLUMN user_input TEXT;`,
    `ALTER TABLE tasks ADD COLUMN enrich_with_opus INTEGER DEFAULT 0;`,
    `ALTER TABLE tasks ADD COLUMN github_url TEXT;`,
    `ALTER TABLE tasks ADD COLUMN github_pr_number INTEGER;`,
    `ALTER TABLE tasks ADD COLUMN github_pr_url TEXT;`,
  ]
  for (const migration of taskMigrations) {
    try { sqlite.exec(migration) } catch { /* Column already exists */ }
  }

  // Add GitHub columns to repos table
  const repoMigrations = [
    `ALTER TABLE repos ADD COLUMN github_owner TEXT;`,
    `ALTER TABLE repos ADD COLUMN github_repo TEXT;`,
    `ALTER TABLE repos ADD COLUMN github_default_branch TEXT;`,
    `ALTER TABLE repos ADD COLUMN is_public INTEGER;`,
  ]
  for (const migration of repoMigrations) {
    try { sqlite.exec(migration) } catch { /* Column already exists */ }
  }

  // Create scheduler_stats table if it doesn't exist
  sqlite.exec(`CREATE TABLE IF NOT EXISTS scheduler_stats (
    cycle_name TEXT PRIMARY KEY,
    runs_completed INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    last_run_at TEXT,
    last_duration_ms INTEGER,
    last_error TEXT,
    updated_at TEXT
  );`)

  // Create fruiting_sessions table if it doesn't exist
  sqlite.exec(`CREATE TABLE IF NOT EXISTS fruiting_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    agent TEXT,
    model TEXT,
    context_trace TEXT,
    full_prompt TEXT,
    session_log TEXT,
    created_at TEXT NOT NULL
  );`)

  // Create agent_stats table if it doesn't exist
  sqlite.exec(`CREATE TABLE IF NOT EXISTS agent_stats (
    agent_id TEXT PRIMARY KEY,
    total_tasks INTEGER DEFAULT 0,
    successful INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    best_for TEXT,
    avoid_for TEXT,
    updated_at TEXT
  );`)

  // =========================================================================
  // Indexes for query performance
  // =========================================================================
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_repo_status ON tasks(repo_path, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_task ON fruiting_sessions(task_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON system_agent_runs(status, started_at);
    CREATE INDEX IF NOT EXISTS idx_patterns_repo ON memory_patterns(repo_path);
    CREATE INDEX IF NOT EXISTS idx_warnings_repo ON memory_warnings(repo_path);
    CREATE INDEX IF NOT EXISTS idx_history_key ON config_history(config_key, changed_at);
  `)

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

  // Clean up stale worktrees from previous sessions
  try {
    const worktreesCleaned = await cleanupAllWorkspaces()
    if (worktreesCleaned > 0) {
      console.log(`[Startup] Cleaned up ${worktreesCleaned} stale worktrees`)
    }
  } catch (error) {
    console.error('[Startup] Error cleaning worktrees:', error)
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

  // Clean up all worktrees
  try {
    await cleanupAllWorkspaces()
  } catch (error) {
    console.error('[SHUTDOWN] Error cleaning worktrees:', error)
  }

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

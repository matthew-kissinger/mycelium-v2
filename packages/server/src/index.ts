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
import registryRoutes from './routes/registry'
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
import { getRawSqlite } from './db'
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
  const runningSystemAgents = await getRuns({ status: 'running' }).catch(() => [])

  // Get agent health and quota info (async API calls in parallel, each with fallback)
  const [agentHealth, openrouterCredits, clineCredits, clineProvider, freeModels, providerStatus] = await Promise.all([
    Promise.resolve(getHealthSummary()),
    checkOpenRouterCredits().catch(() => null),
    checkClineCredits().catch(() => null),
    getClineProvider().catch(() => 'unknown'),
    getOpenRouterFreeModels().catch(() => []),
    checkAllProviderStatus().catch(() => ({ groq: 'unknown', cerebras: 'unknown', mistral: 'unknown' })),
  ])

  return c.json({
    backend: true,
    scheduler: schedulerStatus.running,
    scheduler_cycles: schedulerStatus.cycles.filter(cy => cy.running).map(cy => cy.name),
    running_system_agents: (runningSystemAgents as any[]).map(r => ({
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
app.route('/api/registry', registryRoutes)

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

// DB is already initialized via import (Drizzle migrations run at module load time).
// Post-DB startup: registry cache, health, credentials, cleanup, telegram, scheduler.
async function startup() {
  // Initialize registry cache BEFORE server starts accepting requests.
  // This is blocking - all cache reads assert initialization.
  const { initRegistryCache } = await import('./agents/registry-cache')
  await initRegistryCache()

  // Load persisted health state from DB
  try {
    const { initHealthFromDb } = await import('./agents/health')
    await initHealthFromDb()
  } catch (error) {
    console.error('[Health] DB init failed:', error)
  }

  // Load credentials (non-blocking)
  try {
    const { loadCredentials } = await import('./agents/credentials')
    const creds = loadCredentials()
    console.log(`[Credentials] Loaded ${Object.keys(creds).length} credentials`)
  } catch (error) {
    console.error('[Credentials] Load failed:', error)
  }

  // Background: detect agent CLIs and fetch provider models (non-blocking)
  import('./agents/detect').then(({ detectAllAgents }) =>
    detectAllAgents().catch(e => console.error('[Startup] Agent detection failed:', e))
  ).catch(() => {})
  import('./agents/fetch-models').then(async ({ fetchAllProviderModels, persistFetchedModels }) => {
    const results = await fetchAllProviderModels()
    const successful = results.filter(r => !r.error)
    if (successful.length > 0) {
      await persistFetchedModels(successful)
    }
  }).catch(e => console.error('[Startup] Model fetch failed:', e))

  console.log(`Server running at http://localhost:${port}`)

  // Clean up orphaned system agent runs from previous sessions
  const cleaned = await cleanupOrphanedRuns(1) // 1 hour threshold
  if (cleaned > 0) {
    console.log(`[Startup] Cleaned up ${cleaned} orphaned system agent runs`)
  }

  // Clean up tasks stuck in 'running' status from previous sessions
  // These tasks have no agent process listening - letting them stay burns tokens
  try {
    const now = new Date().toISOString()
    const sqlite = getRawSqlite()
    const result = sqlite.prepare(
      `UPDATE tasks SET status = 'failed', error = 'Server restarted - task orphaned', completed_at = ? WHERE status = 'running'`
    ).run(now)
    const orphanedTasks = result.changes
    if (orphanedTasks > 0) {
      console.log(`[Startup] Marked ${orphanedTasks} orphaned running tasks as failed`)
    }
  } catch (error) {
    console.error('[Startup] Error cleaning orphaned tasks:', error)
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
}

startup()

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

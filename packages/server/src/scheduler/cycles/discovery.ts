/**
 * Discovery Cycle - scan repos for work
 *
 * Responsibilities:
 * - For each registered repo, spawn Discovery agent
 * - Use prompts from src/prompts/discovery.ts
 * - Track runs in system_agent_runs table
 * - Handle auto vs align mode based on repo settings
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import {
  buildDiscoveryPrompt,
  DiscoveryContext,
  DISCOVERY_SENT_MARKER,
  DISCOVERY_AUTO_MARKER,
} from '../../prompts/discovery'
import {
  buildMycelContext,
  buildAgentsSection,
  buildSkillsSection,
  buildMcpSection,
} from '../../prompts/context'

/**
 * Build context for Discovery agent.
 */
async function buildContext(
  repo: Awaited<ReturnType<typeof queries.getRepo>>,
  isAuto: boolean
): Promise<DiscoveryContext | null> {
  if (!repo) return null

  // Get pending tasks for this repo
  const pendingTasks = await queries.getTasksByRepo(repo.path, { status: 'pending', limit: 20 })

  // Get recent completed/failed tasks
  const doneTasks = await queries.getTasksByRepo(repo.path, { status: 'done', limit: 10 })
  const failedTasks = await queries.getTasksByRepo(repo.path, { status: 'failed', limit: 5 })
  const recentTasks = [...doneTasks, ...failedTasks]
    .sort((a, b) => {
      const aTime = a.completed_at ?? a.created_at
      const bTime = b.completed_at ?? b.created_at
      return bTime.localeCompare(aTime)
    })
    .slice(0, 10)

  // Get memory patterns and warnings
  const patterns = await queries.getPatterns({ repo_path: repo.path, limit: 10 })
  const warnings = await queries.getWarnings({ repo_path: repo.path, limit: 10 })

  return {
    repoPath: repo.path,
    repoDescription: repo.description ?? undefined,
    pendingTasks: pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    })),
    recentTasks: recentTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      result: t.result?.slice(0, 200) ?? undefined,
    })),
    patterns: patterns.map((p) => p.content),
    warnings: warnings.map((w) => w.content),
    agentsAvailable: ['claude', 'codex', 'gemini', 'cursor', 'cline'],
    autonomous: isAuto,
  }
}

/**
 * Run Discovery for a single repo.
 */
async function runDiscoveryForRepo(
  repo: Awaited<ReturnType<typeof queries.getRepo>>,
  config: SchedulerConfig
): Promise<void> {
  if (!repo) return

  const repoPath = repo.path
  const isAuto = config.discovery_auto_create.includes(repoPath)

  console.log(`[Discovery] Starting for ${repo.name} (${isAuto ? 'auto' : 'align'} mode)`)

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'discovery',
    repo_path: repoPath,
    context: { mode: isAuto ? 'auto' : 'align' },
  })

  // Broadcast event
  broadcast('system:agent_started', {
    type: 'system:agent_started',
    run_id: run.id,
    agent_type: 'discovery',
    repo_path: repoPath,
    timestamp: new Date().toISOString(),
  })

  try {
    // Build context
    const context = await buildContext(repo, isAuto)
    if (!context) {
      await queries.failRun(run.id, 'Failed to build context')
      return
    }

    // Build dynamic context sections
    const mycelContext = buildMycelContext({
      role: 'discovery',
      agentId: 'discovery',
    })
    const agentsSection = buildAgentsSection()
    const skillsSection = buildSkillsSection([], repoPath)
    const mcpSection = buildMcpSection()

    // Build prompt with dynamic context
    const prompt = buildDiscoveryPrompt(context, mycelContext, agentsSection)
      + (skillsSection ? `\n\n${skillsSection}` : '')
      + (mcpSection ? `\n\n${mcpSection}` : '')

    // Dispatch to agent
    // Use claude/opus for auto mode (more autonomous), claude/sonnet for align mode
    const model = isAuto ? 'opus' : 'sonnet'

    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath,
      model,
      timeout: 1800, // 30 min timeout
      onOutput: (chunk) => {
        // Log progress (don't broadcast for system agents)
        if (chunk.includes('[DISCOVERY')) {
          console.log(`[Discovery] ${repo.name}: Sending report...`)
        }
      },
    })

    // Check for success markers
    const hasAlignMarker = result.output.includes(DISCOVERY_SENT_MARKER)
    const hasAutoMarker = result.output.includes(DISCOVERY_AUTO_MARKER)

    if (result.success && (hasAlignMarker || hasAutoMarker)) {
      await queries.completeRun(run.id, result.output)

      // Update repo last scanned time
      await queries.updateRepo(repo.id, {
        last_scanned_at: new Date().toISOString(),
      })

      console.log(`[Discovery] ${repo.name} completed successfully`)

      // Broadcast completion
      broadcast('agent:completed', {
        type: 'agent:completed',
        run_id: run.id,
        agent_type: 'discovery',
        duration_seconds: result.duration_seconds,
        timestamp: new Date().toISOString(),
      })
    } else {
      // Agent ran but didn't output expected marker
      const error = result.success
        ? 'Discovery completed but missing completion marker'
        : result.output.slice(0, 500)

      await queries.failRun(run.id, error)
      console.log(`[Discovery] ${repo.name} failed: ${error.slice(0, 100)}`)

      broadcast('agent:failed', {
        type: 'agent:failed',
        run_id: run.id,
        agent_type: 'discovery',
        error: error.slice(0, 200),
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error(`[Discovery] ${repo.name} error:`, error)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'discovery',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * Run the Discovery cycle.
 * Spawns Discovery agent for all registered repos.
 */
export async function runDiscoveryCycle(config: SchedulerConfig): Promise<void> {
  console.log('[Discovery] Starting cycle...')

  // Get all registered repos
  const repos = await queries.getRepos()

  if (repos.length === 0) {
    console.log('[Discovery] No repos registered')
    return
  }

  // Filter to repos that should be discovered
  // (if discovery_repos is empty, discover all)
  const targetRepos = config.discovery_repos.length > 0
    ? repos.filter((r) => config.discovery_repos.includes(r.path))
    : repos

  console.log(`[Discovery] Running for ${targetRepos.length} repos`)

  // Run discovery for each repo (in parallel, fire and forget)
  for (const repo of targetRepos) {
    // Don't await - run in background
    runDiscoveryForRepo(repo, config).catch((error) => {
      console.error(`[Discovery] Background error for ${repo.name}:`, error)
    })
  }
}

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
import { registerActiveRun, unregisterActiveRun } from '../active-runs'
import {
  buildDiscoveryPrompt,
  DiscoveryContext,
  DISCOVERY_SENT_MARKER,
  DISCOVERY_AUTO_MARKER,
  DISCOVERY_RESULT_REGEX,
} from '../../prompts/discovery'
import {
  buildMycelContext,
  buildAgentsSectionWithCredits,
  buildSkillsSection,
  buildMcpSection,
  detectAllSkillsForRepo,
  buildRepoSkillsList,
} from '../../prompts/context'
import { getCachedEnabledAgents } from '../../agents/registry-cache'
import { parseDiscoveryResult } from '../../agents/output-parser'

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

  // Get recent completed tasks
  const doneTasks = await queries.getTasksByRepo(repo.path, { status: 'done', limit: 10 })
  const recentTasks = doneTasks
    .sort((a, b) => {
      const aTime = a.completed_at ?? a.created_at
      const bTime = b.completed_at ?? b.created_at
      return bTime.localeCompare(aTime)
    })
    .slice(0, 10)

  // Get failed and cancelled tasks separately (for retry consideration)
  const failedRaw = await queries.getTasksByRepo(repo.path, { status: 'failed', limit: 10 })
  const cancelledRaw = await queries.getTasksByRepo(repo.path, { status: 'cancelled', limit: 10 })
  const failedTasks = [...failedRaw, ...cancelledRaw]
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
    failedTasks: failedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      agent: t.agent ?? undefined,
      model: t.model ?? undefined,
      error: t.error?.slice(0, 300) ?? undefined,
    })),
    patterns: patterns.map((p) => p.content),
    warnings: warnings.map((w) => w.content),
    agentsAvailable: getCachedEnabledAgents().map(a => a.id),
    autonomous: isAuto,
  }
}

/**
 * Run Discovery for a single repo.
 * Exported for manual triggering via API.
 */
export async function runDiscoveryForRepo(
  repo: Awaited<ReturnType<typeof queries.getRepo>>,
  config: SchedulerConfig
): Promise<void> {
  if (!repo) return

  const repoPath = repo.path
  // Use repo's mode field, fallback to config for backwards compatibility
  const isAuto = repo.mode === 'auto' || config.discovery_auto_create.includes(repoPath)

  console.log(`[Discovery] Starting for ${repo.name} (${isAuto ? 'auto' : 'align'} mode)`)

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'discovery',
    repo_path: repoPath,
    context: { mode: isAuto ? 'auto' : 'align' },
  })

  // Register active run
  registerActiveRun({
    run_id: run.id,
    agent_type: 'discovery',
    repo_path: repoPath,
    started_at: new Date().toISOString(),
  })

  // Broadcast event
  broadcast('agent:started', {
    type: 'agent:started',
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

    // Use claude/opus for auto mode (more autonomous), claude/sonnet for align mode
    const model = isAuto ? 'opus' : 'sonnet'

    // Refresh repo skills on each scan
    const repoSkills = detectAllSkillsForRepo(repoPath)
    await queries.updateRepo(repo.id, { skills: repoSkills })

    // Build dynamic context sections
    const mycelContext = buildMycelContext({
      role: 'discovery',
      agentId: 'discovery',
      model,
    })
    // Use async version to include live credits/quota info
    const agentsSection = await buildAgentsSectionWithCredits()
    // Pass top 3 repo skills so discovery gets domain knowledge
    const topSkills = repoSkills.slice(0, 3)
    const skillsSection = buildSkillsSection(topSkills, repoPath)
    const mcpSection = buildMcpSection('claude')
    const repoSkillsList = buildRepoSkillsList(repoPath, repoSkills)

    // Build prompt with dynamic context
    const prompt = buildDiscoveryPrompt(context, mycelContext, agentsSection)
      + (repoSkillsList ? `\n\n${repoSkillsList}` : '')
      + (skillsSection ? `\n\n${skillsSection}` : '')
      + (mcpSection ? `\n\n${mcpSection}` : '')

    // Collect session log entries
    const sessionLog: Array<{ chunk: string; stream: string; timestamp: string }> = []

    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath,
      model,
      timeout: 1800, // 30 min timeout
      extraEnv: isAuto ? {
        GIT_AUTHOR_NAME: `discovery/claude/${model} (mycelium)`,
        GIT_AUTHOR_EMAIL: `discovery+claude+${model}@mycelium.local`,
        GIT_COMMITTER_NAME: `discovery/claude/${model} (mycelium)`,
        GIT_COMMITTER_EMAIL: `discovery+claude+${model}@mycelium.local`,
      } : undefined,
      onOutput: (chunk, stream = 'stdout') => {
        sessionLog.push({ chunk, stream, timestamp: new Date().toISOString() })
        broadcast('agent:output', {
          type: 'agent:output',
          run_id: run.id,
          agent_type: 'discovery',
          chunk,
          stream,
          timestamp: new Date().toISOString(),
        })
        if (chunk.includes('[DISCOVERY')) {
          console.log(`[Discovery] ${repo.name}: Sending report...`)
        }
      },
    })

    // Record fruiting session for system agent run
    queries.createFruitingSession({
      task_id: run.id,
      repo_path: repoPath,
      agent: 'claude',
      model,
      context_trace: { agent_type: 'discovery', mode: isAuto ? 'auto' : 'align' },
      full_prompt: prompt,
      session_log: sessionLog,
    }).catch((e) => console.error('[Discovery] Failed to record fruiting session:', e))

    // Parse structured result (new XML format or old markers)
    const discoveryResult = parseDiscoveryResult(result.output)

    // Check for success: new structured XML or old-style markers
    const hasNewResult = DISCOVERY_RESULT_REGEX.test(result.output)
    const hasAlignMarker = result.output.includes(DISCOVERY_SENT_MARKER)
    const hasAutoMarker = result.output.includes(DISCOVERY_AUTO_MARKER)
    const hasSuccessMarker = hasNewResult || hasAlignMarker || hasAutoMarker

    if (result.success && hasSuccessMarker) {
      await queries.completeRun(run.id, result.output)

      // Store structured result in run context if parsed
      if (discoveryResult) {
        await queries.updateRun(run.id, {
          context: {
            mode: isAuto ? 'auto' : 'align',
            result: discoveryResult,
          },
        })
      }

      // Update repo last scanned time
      await queries.updateRepo(repo.id, {
        last_scanned_at: new Date().toISOString(),
      })

      const headline = discoveryResult?.headline ?? 'completed'
      const taskCount = discoveryResult?.tasks.length ?? 0
      console.log(`[Discovery] ${repo.name} completed: ${headline} (${taskCount} tasks)`)

      // Broadcast completion with structured data
      broadcast('agent:completed', {
        type: 'agent:completed',
        run_id: run.id,
        agent_type: 'discovery',
        duration_seconds: result.duration_seconds,
        discovery_result: discoveryResult ?? undefined,
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
  } finally {
    unregisterActiveRun(run.id)
  }
}

/**
 * Select a repo using weighted random selection.
 * Higher weight = more likely to be selected.
 * @param repos Array of repos with weights
 * @returns Selected repo or null if none available
 */
function selectWeightedRepo(repos: Awaited<ReturnType<typeof queries.getRepos>>): Awaited<ReturnType<typeof queries.getRepos>>[0] | null {
  if (repos.length === 0) return null

  // Calculate total weight
  let totalWeight = 0
  for (const repo of repos) {
    const weight = repo.weight ?? 50
    totalWeight += weight
  }

  if (totalWeight === 0) {
    // All repos have zero weight, select randomly
    return repos[Math.floor(Math.random() * repos.length)]
  }

  // Select random value in range [0, totalWeight)
  const randomValue = Math.random() * totalWeight

  // Find the repo corresponding to this random value
  let cumulative = 0
  for (const repo of repos) {
    cumulative += repo.weight ?? 50
    if (randomValue < cumulative) {
      return repo
    }
  }

  // Fallback (shouldn't happen)
  return repos[repos.length - 1]
}

/**
 * Run the Discovery cycle.
 * Selects one repo using weighted random selection and runs Discovery agent.
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

  if (targetRepos.length === 0) {
    console.log('[Discovery] No target repos after filtering')
    return
  }

  // Select one repo using weighted random selection
  const selectedRepo = selectWeightedRepo(targetRepos)

  if (!selectedRepo) {
    console.log('[Discovery] No repo selected')
    return
  }

  console.log(`[Discovery] Selected repo: ${selectedRepo.name} (weight: ${selectedRepo.weight ?? 50})`)

  // Run discovery for the selected repo
  try {
    await runDiscoveryForRepo(selectedRepo, config)
  } catch (error) {
    console.error(`[Discovery] Error for ${selectedRepo.name}:`, error)
  }
}

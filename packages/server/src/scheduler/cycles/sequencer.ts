/**
 * Sequencer Cycle - wire task dependencies
 *
 * Responsibilities:
 * - Get unsequenced pending tasks
 * - Spawn Sequencer agent to analyze and wire dependencies
 * - Parse YAML output and update task dependencies
 * - Mark tasks as sequenced
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import {
  buildSequencerPrompt,
  parseSequencerResponse,
  type SequencerTaskContext,
  type RunningTaskContext,
  type ShepherdEvalContext,
} from '../../prompts/sequencer'

/**
 * Run the Sequencer cycle.
 * Analyzes unsequenced tasks and wires dependencies.
 */
export async function runSequencerCycle(config: SchedulerConfig): Promise<void> {
  console.log('[Sequencer] Starting cycle...')

  // Get unsequenced pending tasks
  const unsequencedTasks = await queries.getUnsequencedTasks(50)

  if (unsequencedTasks.length === 0) {
    console.log('[Sequencer] No unsequenced tasks')
    return
  }

  console.log(`[Sequencer] Found ${unsequencedTasks.length} unsequenced tasks`)

  // Group tasks by repo for context
  const tasksByRepo = new Map<string, typeof unsequencedTasks>()
  for (const task of unsequencedTasks) {
    const existing = tasksByRepo.get(task.repo_path) ?? []
    existing.push(task)
    tasksByRepo.set(task.repo_path, existing)
  }

  // Process each repo's tasks
  for (const [repoPath, tasks] of tasksByRepo) {
    await runSequencerForRepo(repoPath, tasks)
  }
}

/**
 * Run Sequencer for a specific repo's tasks.
 */
async function runSequencerForRepo(
  repoPath: string,
  tasks: Awaited<ReturnType<typeof queries.getUnsequencedTasks>>
): Promise<void> {
  const repoName = repoPath.split('/').pop() ?? 'unknown'
  console.log(`[Sequencer] Analyzing ${tasks.length} tasks for ${repoName}`)

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'sequencer',
    repo_path: repoPath,
    context: { task_count: tasks.length },
  })

  // Broadcast event
  broadcast('system:agent_started', {
    type: 'system:agent_started',
    run_id: run.id,
    agent_type: 'sequencer',
    repo_path: repoPath,
    timestamp: new Date().toISOString(),
  })

  try {
    // Build task context for prompt
    const pendingTasks: SequencerTaskContext[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      prompt: t.prompt ?? undefined,
      repo_path: t.repo_path,
      depends_on: JSON.parse(t.depends_on ?? '[]') as string[],
    }))

    // Get running tasks for context
    const runningTasks = await queries.getTasks({ status: 'running', limit: 10 })
    const runningTaskContext: RunningTaskContext[] = runningTasks.map((t) => ({
      id: t.id,
      title: t.title,
      repo_path: t.repo_path,
    }))

    // Get memory context
    const patterns = await queries.getPatterns({ repo_path: repoPath, limit: 5 })
    const warnings = await queries.getWarnings({ repo_path: repoPath, limit: 5 })

    // Get recent Shepherd evaluations
    const evaluations = await queries.getShepherdEvaluations({ repo_path: repoPath, limit: 3 })
    const evalContext: ShepherdEvalContext[] = evaluations.map((e) => ({
      repo_name: repoName,
      health: e.health,
      headline: e.headline,
    }))

    // Build prompt (using the new context structure)
    const prompt = buildSequencerPrompt({
      pendingTasks,
      runningTasks: runningTaskContext,
      repoPath,
      shepherdEvals: evalContext,
    })

    // Dispatch to agent
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: repoPath,
      model: 'sonnet',
      timeout: 300, // 5 min timeout
    })

    if (!result.success) {
      await queries.failRun(run.id, result.output.slice(0, 500))
      console.log(`[Sequencer] ${repoName} agent failed: ${result.output.slice(0, 100)}`)

      broadcast('agent:failed', {
        type: 'agent:failed',
        run_id: run.id,
        agent_type: 'sequencer',
        error: result.output.slice(0, 200),
        timestamp: new Date().toISOString(),
      })

      // Mark tasks as sequenced anyway (with no deps) to avoid infinite loop
      await markTasksSequenced(tasks)
      return
    }

    // Parse YAML response
    const parsed = parseSequencerResponse(result.output)

    if (parsed && parsed.dependencyUpdates.length > 0) {
      console.log(`[Sequencer] Parsed ${parsed.dependencyUpdates.length} dependency updates`)

      // Apply dependency updates
      for (const update of parsed.dependencyUpdates) {
        const taskId = resolveTaskId(update.taskId, tasks)
        if (!taskId) {
          console.log(`[Sequencer] Task not found: ${update.taskId}`)
          continue
        }

        // Resolve dependency IDs
        const resolvedDeps = update.dependsOn
          .map((dep: string) => resolveTaskId(dep, tasks))
          .filter((id: string | null): id is string => id !== null)

        if (resolvedDeps.length > 0) {
          await queries.updateTask(taskId, {
            depends_on: resolvedDeps,
          })
          console.log(`[Sequencer] Updated deps for ${taskId.slice(0, 8)}: ${resolvedDeps.map((d: string) => d.slice(0, 8)).join(', ')}`)
        }
      }
    } else {
      console.log('[Sequencer] No dependency updates parsed (tasks may be independent)')
    }

    // Mark all tasks as sequenced
    await markTasksSequenced(tasks)

    await queries.completeRun(run.id, result.output)
    console.log(`[Sequencer] ${repoName} completed`)

    broadcast('agent:completed', {
      type: 'agent:completed',
      run_id: run.id,
      agent_type: 'sequencer',
      duration_seconds: result.duration_seconds,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error(`[Sequencer] ${repoName} error:`, error)

    // Mark tasks as sequenced anyway
    await markTasksSequenced(tasks)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'sequencer',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * Mark tasks as sequenced.
 */
async function markTasksSequenced(
  tasks: Awaited<ReturnType<typeof queries.getUnsequencedTasks>>
): Promise<void> {
  for (const task of tasks) {
    await queries.updateTask(task.id, { sequenced: true })
  }
  console.log(`[Sequencer] Marked ${tasks.length} tasks as sequenced`)
}

/**
 * Resolve a task ID (short or full) to full UUID.
 */
function resolveTaskId(
  shortId: string,
  tasks: Awaited<ReturnType<typeof queries.getUnsequencedTasks>>
): string | null {
  // Try exact match first
  const exact = tasks.find((t) => t.id === shortId)
  if (exact) return exact.id

  // Try prefix match
  const prefix = tasks.find((t) => t.id.startsWith(shortId))
  if (prefix) return prefix.id

  return null
}

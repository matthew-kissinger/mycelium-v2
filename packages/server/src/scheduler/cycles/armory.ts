/**
 * Armory Cycle - analyze completed tasks and install missing skills/MCPs
 *
 * Responsibilities:
 * - Triggered after N completed tasks network-wide (configurable)
 * - Gets current inventory of skills and MCPs
 * - Dispatches Armory agent to analyze gaps and install tools
 * - Marks tasks as armory-reviewed
 */

import { SchedulerConfig } from '@mycelium/shared'
import * as queries from '../../db/queries'
import { dispatch } from '../../agents/dispatch'
import { broadcast } from '../../sse'
import { buildMycelContext } from '../../prompts/context'
import { registerActiveRun, unregisterActiveRun } from '../active-runs'
import { buildArmoryPrompt, parseArmoryOutput, ArmorySkill, ArmoryMcpServer } from '../../prompts/armory'
import { getInstalledSkills, getMcpServers } from '../../config/inventory'
import { syncToAllAgents } from '../../config/mcp-sync'
import { homedir } from 'os'

/**
 * Check if armory cycle should run based on unreviewed task count.
 */
export async function shouldRunArmory(config: SchedulerConfig): Promise<boolean> {
  if (!config.armory_enabled) {
    return false
  }

  const batchSize = config.armory_batch_size ?? 10
  const unreviewedTasks = await queries.getUnreviewedTasks(batchSize + 1)

  return unreviewedTasks.length >= batchSize
}

/**
 * Run the Armory cycle.
 * Analyzes completed tasks and installs missing skills/MCPs.
 */
export async function runArmoryCycle(config: SchedulerConfig): Promise<void> {
  console.log('[Armory] Starting cycle...')

  if (!config.armory_enabled) {
    console.log('[Armory] Cycle disabled')
    return
  }

  const batchSize = config.armory_batch_size ?? 10

  // Get unreviewed tasks
  const unreviewedTasks = await queries.getUnreviewedTasks(batchSize * 2)

  if (unreviewedTasks.length < batchSize) {
    console.log(`[Armory] Not enough tasks (${unreviewedTasks.length}/${batchSize}), skipping`)
    return
  }

  // Create system agent run record
  const run = await queries.createRun({
    agent_type: 'armory',
    context: { tasks_count: unreviewedTasks.length },
  })

  // Register active run
  registerActiveRun({
    run_id: run.id,
    agent_type: 'armory',
    started_at: new Date().toISOString(),
  })

  // Broadcast event
  broadcast('agent:started', {
    type: 'agent:started',
    run_id: run.id,
    agent_type: 'armory',
    timestamp: new Date().toISOString(),
  })

  try {
    // Get current inventory
    const skills = getInstalledSkills()
    const mcps = getMcpServers()

    // Convert to armory context format
    const existingSkills: ArmorySkill[] = skills.map(s => ({
      name: s.name,
      description: s.description,
    }))

    const existingMcpServers: ArmoryMcpServer[] = mcps.map(m => ({
      name: m.name,
      command: m.args ? `${m.command} ${m.args.join(' ')}` : m.command,
    }))

    console.log(`[Armory] Current inventory: ${skills.length} skills, ${mcps.length} MCPs`)
    console.log(`[Armory] Analyzing ${unreviewedTasks.length} tasks`)

    // Build prompt with mycel context
    const mycelContext = buildMycelContext({
      role: 'armory',
      agentId: 'armory',
    })
    const prompt = buildArmoryPrompt({
      tasksAnalyzed: unreviewedTasks.length,
      existingSkills,
      existingMcpServers,
    }, mycelContext)

    // Collect session log entries
    const sessionLog: Array<{ chunk: string; stream: string; timestamp: string }> = []

    // Dispatch to agent (run in home directory for skill installation)
    const result = await dispatch({
      agent: 'claude',
      prompt,
      cwd: homedir(),
      model: 'sonnet',
      timeout: 1800, // 30 min timeout
      onOutput: (chunk, stream = 'stdout') => {
        sessionLog.push({ chunk, stream, timestamp: new Date().toISOString() })
        broadcast('agent:output', {
          type: 'agent:output',
          run_id: run.id,
          agent_type: 'armory',
          chunk,
          stream,
          timestamp: new Date().toISOString(),
        })
        if (chunk.includes('armory_result')) {
          console.log('[Armory] Agent outputting manifest...')
        }
      },
    })

    // Record fruiting session for system agent run
    queries.createFruitingSession({
      task_id: run.id,
      repo_path: homedir(),
      agent: 'claude',
      model: 'sonnet',
      context_trace: { agent_type: 'armory', tasks_count: unreviewedTasks.length },
      full_prompt: prompt,
      session_log: sessionLog,
    }).catch((e) => console.error('[Armory] Failed to record fruiting session:', e))

    if (result.success) {
      // Parse XML output
      const armoryOutput = parseArmoryOutput(result.output)

      await queries.completeRun(run.id, result.output)

      // Mark tasks as reviewed
      const now = new Date().toISOString()
      for (const task of unreviewedTasks) {
        await queries.updateTask(task.id, {
          armory_reviewed_at: now,
        })
      }

      if (armoryOutput) {
        console.log(`[Armory] ${armoryOutput.health}: ${armoryOutput.headline}`)
        if (armoryOutput.skills_added.length > 0) {
          console.log(`[Armory] Skills added: ${armoryOutput.skills_added.map(s => s.name).join(', ')}`)
        }
        if (armoryOutput.mcps_installed.length > 0) {
          console.log(`[Armory] MCPs installed: ${armoryOutput.mcps_installed.map(m => m.name).join(', ')}`)
          // Sync canonical MCP config to all agent config files
          try {
            syncToAllAgents()
            console.log('[Armory] MCP config synced to all agents after installation')
          } catch (e) {
            console.error('[Armory] MCP sync failed after installation:', e)
          }
        }
        if (armoryOutput.suggested_mappings.length > 0) {
          console.log(`[Armory] Suggested skill mappings: ${armoryOutput.suggested_mappings.map(m => `${m.dep} -> ${m.skills.join(',')}`).join('; ')}`)
        }
        if (armoryOutput.gaps_remaining.length > 0) {
          console.log(`[Armory] Gaps remaining: ${armoryOutput.gaps_remaining.length}`)
        }
      } else {
        console.log(`[Armory] Completed successfully (could not parse output), marked ${unreviewedTasks.length} tasks as reviewed`)
      }

      // Broadcast completion with parsed fields
      broadcast('agent:completed', {
        type: 'agent:completed',
        run_id: run.id,
        agent_type: 'armory',
        duration_seconds: result.duration_seconds,
        health: armoryOutput?.health,
        headline: armoryOutput?.headline,
        skills_added: armoryOutput?.skills_added.length ?? 0,
        mcps_installed: armoryOutput?.mcps_installed.length ?? 0,
        gaps_remaining: armoryOutput?.gaps_remaining.length ?? 0,
        suggested_mappings: armoryOutput?.suggested_mappings.length ?? 0,
        timestamp: new Date().toISOString(),
      })
    } else {
      const error = result.output.slice(0, 500)
      await queries.failRun(run.id, error)
      console.log(`[Armory] Failed: ${error.slice(0, 100)}`)

      broadcast('agent:failed', {
        type: 'agent:failed',
        run_id: run.id,
        agent_type: 'armory',
        error: error.slice(0, 200),
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await queries.failRun(run.id, errorMsg)
    console.error('[Armory] Error:', error)

    broadcast('agent:failed', {
      type: 'agent:failed',
      run_id: run.id,
      agent_type: 'armory',
      error: errorMsg,
      timestamp: new Date().toISOString(),
    })
  } finally {
    unregisterActiveRun(run.id)
  }
}

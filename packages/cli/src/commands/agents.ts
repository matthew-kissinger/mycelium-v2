/**
 * Offline agent/model reference command.
 *
 * Works without the API server running. Reads directly from the
 * AGENT_MATRIX in @mycelium/shared.
 *
 * Commands:
 * - mycel agents                           - List all agents with default models
 * - mycel agents models <agent>            - List valid models for an agent
 * - mycel agents validate <agent> <model>  - Check if a model is valid for an agent
 */

import { Command } from 'commander'
import { AGENT_MATRIX, getModelsForAgent, type AgentType } from '@mycelium/shared'

export function registerAgentsCommands(program: Command): void {
  const agents = program
    .command('agents')
    .description('List valid agents and models (offline, no API needed)')

  // mycel agents (default - list all agents)
  agents
    .option('--json', 'Output as JSON')
    .action((options) => {
      const data = AGENT_MATRIX.map(a => {
        const defaultModel = a.providers[0]?.models[0]?.id ?? '-'
        const modelCount = a.providers.reduce((sum, p) => sum + p.models.length, 0)
        const billing = a.providers.map(p => p.billing).join('/')
        return {
          agent: a.agent,
          command: a.command,
          default_model: defaultModel,
          models: modelCount,
          billing,
        }
      })

      if (options.json) {
        console.log(JSON.stringify(data, null, 2))
        return
      }

      // Simple table
      console.log('')
      console.log('Agent          Command      Default Model            Models  Billing')
      console.log('-------------- ------------ ------------------------ ------- -----------')
      for (const row of data) {
        console.log(
          `${row.agent.padEnd(14)} ${row.command.padEnd(12)} ${row.default_model.padEnd(24)} ${String(row.models).padStart(5)}  ${row.billing}`
        )
      }
      console.log(`\n${data.length} agents`)
    })

  // mycel agents models <agent>
  agents
    .command('models <agent>')
    .description('List valid models for an agent')
    .option('--json', 'Output as JSON')
    .action((agent: string, options) => {
      const agentCap = AGENT_MATRIX.find(a => a.agent === agent)
      if (!agentCap) {
        const valid = AGENT_MATRIX.map(a => a.agent).join(', ')
        console.error(`Unknown agent "${agent}". Valid agents: ${valid}`)
        process.exit(1)
      }

      const models = getModelsForAgent(agent as AgentType)

      if (options.json) {
        console.log(JSON.stringify(models, null, 2))
        return
      }

      console.log(`\nValid models for ${agent} (${agentCap.command}):`)
      console.log('')
      for (const provider of agentCap.providers) {
        console.log(`  Provider: ${provider.provider} (${provider.billing})`)
        for (const m of provider.models) {
          const shortInfo = m.short ? ` (short: ${m.short})` : ''
          const freeTag = m.free ? ' [FREE]' : ''
          console.log(`    - ${m.id}${shortInfo}${freeTag}`)
        }
        console.log('')
      }
      console.log(`${models.length} models total`)
    })

  // mycel agents validate <agent> <model>
  agents
    .command('validate <agent> <model>')
    .description('Check if a model is valid for an agent')
    .action((agent: string, model: string) => {
      const agentCap = AGENT_MATRIX.find(a => a.agent === agent)
      if (!agentCap) {
        const valid = AGENT_MATRIX.map(a => a.agent).join(', ')
        console.error(`Invalid agent "${agent}". Valid agents: ${valid}`)
        process.exit(1)
      }

      const models = getModelsForAgent(agent as AgentType)
      const validIds = new Set<string>()
      for (const m of models) {
        validIds.add(m.id)
        if (m.short) validIds.add(m.short)
      }

      if (validIds.has(model)) {
        console.log(`OK: "${model}" is valid for ${agent}`)
      } else {
        const list = Array.from(validIds).slice(0, 10).join(', ')
        console.error(`Invalid: "${model}" is not valid for ${agent}. Valid models: ${list}${validIds.size > 10 ? '...' : ''}`)
        process.exit(1)
      }
    })
}

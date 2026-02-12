import type { AgentAdapter, AdapterOptions } from './types'

export const cursorAdapter: AgentAdapter = {
  id: 'cursor',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, maxTurns, mcpServers } = options
    // agent --print --output-format json --force [--model <model>] [--max-turns N] "prompt"
    // --force: auto-approve tool use (allows commands unless explicitly denied)
    // --approve-mcps: auto-approve MCP server connections (pre-synced via mcp-sync)
    return [
      '--print',
      '--output-format', 'json',
      '--force',
      ...(model ? ['--model', model] : []),
      ...(maxTurns ? ['--max-turns', String(maxTurns)] : []),
      ...(mcpServers && mcpServers.length > 0 ? ['--approve-mcps'] : []),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

import type { AgentAdapter, AdapterOptions } from './types'

export const cursorAdapter: AgentAdapter = {
  id: 'cursor',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, mcpServers } = options
    // agent --print --output-format json --force [--model <model>] "prompt"
    // --force: auto-approve tool use (allows commands unless explicitly denied)
    // --approve-mcps: auto-approve MCP server connections (pre-synced via mcp-sync)
    // NOTE: Cursor CLI does NOT support --max-turns (only Claude does)
    return [
      '--print',
      '--output-format', 'json',
      '--force',
      ...(model ? ['--model', model] : []),
      ...(mcpServers && mcpServers.length > 0 ? ['--approve-mcps'] : []),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

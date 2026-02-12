import type { AgentAdapter, AdapterOptions, ParsedUsage } from './types'

export const claudeAdapter: AgentAdapter = {
  id: 'claude',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, sessionId, maxTurns, mcpConfigPath } = options
    // claude -p "prompt" --model sonnet --output-format json --dangerously-skip-permissions
    // --resume <sessionId> continues a previous session (for retries)
    // --output-format json wraps output in a JSON envelope with usage/cost data
    // --mcp-config <file> loads additional MCP servers for this invocation
    return [
      ...(sessionId ? ['--resume', sessionId] : ['-p', prompt]),
      ...(model ? ['--model', model] : []),
      ...(maxTurns ? ['--max-turns', String(maxTurns)] : []),
      ...(mcpConfigPath ? ['--mcp-config', mcpConfigPath] : []),
      '--output-format', 'json',
      '--dangerously-skip-permissions',
    ]
  },

  buildEnv(options: AdapterOptions): Record<string, string> {
    // If provider is explicitly set (e.g. task created with provider: "anthropic"),
    // keep ANTHROPIC_API_KEY so the CLI uses API key auth (pay-per-token).
    // Otherwise strip it so the CLI falls back to subscription auth (Max plan).
    // The key stays in process.env for model fetching and other non-CLI uses.
    if (options.provider) {
      return {}
    }
    return { ANTHROPIC_API_KEY: '' }
  },

  postProcessOutput(output: string): string {
    // With --output-format json, stdout is a JSON envelope.
    // Extract the result field as the actual response text.
    try {
      const parsed = JSON.parse(output)
      if (parsed && typeof parsed.result === 'string') {
        return parsed.result
      }
    } catch {
      // Not valid JSON - return raw output (e.g. if flag wasn't active)
    }
    return output
  },

  parseUsage(rawOutput: string): ParsedUsage | undefined {
    try {
      const parsed = JSON.parse(rawOutput)
      if (!parsed || parsed.type !== 'result') return undefined

      const usage: ParsedUsage = {}
      if (parsed.usage) {
        if (typeof parsed.usage.input_tokens === 'number') usage.input_tokens = parsed.usage.input_tokens
        if (typeof parsed.usage.output_tokens === 'number') usage.output_tokens = parsed.usage.output_tokens
        if (typeof parsed.usage.cache_read_input_tokens === 'number') usage.cache_read_tokens = parsed.usage.cache_read_input_tokens
        if (typeof parsed.usage.cache_creation_input_tokens === 'number') usage.cache_write_tokens = parsed.usage.cache_creation_input_tokens
      }
      if (typeof parsed.cost_usd === 'number') usage.cost_usd = parsed.cost_usd
      if (typeof parsed.session_id === 'string') usage.session_id = parsed.session_id
      if (typeof parsed.num_turns === 'number') usage.num_turns = parsed.num_turns
      if (typeof parsed.duration_api_ms === 'number') usage.api_duration_ms = parsed.duration_api_ms

      // Return undefined if we parsed nothing useful
      if (Object.keys(usage).length === 0) return undefined
      return usage
    } catch {
      return undefined
    }
  },
}

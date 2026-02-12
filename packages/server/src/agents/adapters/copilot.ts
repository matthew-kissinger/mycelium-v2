import type { AgentAdapter, AdapterOptions, ParsedUsage } from './types'

export const copilotAdapter: AgentAdapter = {
  id: 'copilot',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, mcpConfigPath } = options
    // copilot -p "prompt" [--model <model>] --allow-all-tools --no-ask-user
    // Without --model, falls back to ~/.copilot/config.json default (gemini-3-pro-preview)
    // --additional-mcp-config @<file> loads MCP servers for this invocation
    return [
      '-p', prompt,
      ...(model ? ['--model', model] : []),
      '--allow-all-tools',
      '--no-ask-user',
      '--allow-all-paths',
      '--no-auto-update',
      '--no-custom-instructions',
      ...(mcpConfigPath ? ['--additional-mcp-config', `@${mcpConfigPath}`] : []),
    ]
  },

  buildEnv(): Record<string, string> {
    // Strip GITHUB_TOKEN and GH_TOKEN to prevent fine-grained PAT from
    // overriding Copilot's stored OAuth credentials (causes 401 on model listing).
    // Copilot falls back to its own stored OAuth from `copilot login`.
    return { GITHUB_TOKEN: '', GH_TOKEN: '' }
  },

  parseUsage(_rawOutput: string, stderr?: string): ParsedUsage | undefined {
    if (!stderr?.trim()) return undefined
    try {
      const result: ParsedUsage = {}

      // Extract premium requests from "Total usage est: N Premium requests"
      const premiumMatch = stderr.match(/(\d+)\s*Premium requests/)
      if (premiumMatch) result.premium_requests = parseInt(premiumMatch[1], 10)

      // Extract API time from "API time spent: Ns"
      const apiTimeMatch = stderr.match(/API time spent:\s*(\d+)s/)
      if (apiTimeMatch) result.api_duration_ms = parseInt(apiTimeMatch[1], 10) * 1000

      // Parse per-model token lines: "model-name   12.5k in, 3200 out, 8.1k cached (...)"
      const tokenLineRe = /([\d.]+)(k?)\s*in,\s*([\d.]+)(k?)\s*out(?:,\s*([\d.]+)(k?)\s*cached)?/g
      let inputTokens = 0
      let outputTokens = 0
      let cacheReadTokens = 0
      let tokenMatch: RegExpExecArray | null
      let hasTokenLines = false

      while ((tokenMatch = tokenLineRe.exec(stderr)) !== null) {
        hasTokenLines = true
        const inVal = parseFloat(tokenMatch[1]) * (tokenMatch[2] === 'k' ? 1000 : 1)
        const outVal = parseFloat(tokenMatch[3]) * (tokenMatch[4] === 'k' ? 1000 : 1)
        inputTokens += Math.round(inVal)
        outputTokens += Math.round(outVal)
        if (tokenMatch[5]) {
          const cachedVal = parseFloat(tokenMatch[5]) * (tokenMatch[6] === 'k' ? 1000 : 1)
          cacheReadTokens += Math.round(cachedVal)
        }
      }

      if (hasTokenLines) {
        result.input_tokens = inputTokens
        result.output_tokens = outputTokens
        if (cacheReadTokens > 0) result.cache_read_tokens = cacheReadTokens
      }

      // Return undefined if nothing was parsed
      if (Object.keys(result).length === 0) return undefined
      return result
    } catch {
      return undefined
    }
  },
}

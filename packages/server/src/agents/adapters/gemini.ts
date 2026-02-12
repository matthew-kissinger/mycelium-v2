import type { AgentAdapter, AdapterOptions, ParsedUsage } from './types'

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, sessionId } = options
    // gemini -p "prompt" --model gemini-3-pro-preview --yolo -o json
    // CRITICAL: -p is required for non-interactive (headless) mode.
    // Without it, gemini enters interactive TUI and hangs until timeout.
    return [
      ...(sessionId ? ['--resume', sessionId, '-p', prompt] : ['-p', prompt]),
      ...(model ? ['--model', model] : []),
      '--yolo',
      '-o', 'json',
    ]
  },

  buildEnv(): Record<string, string> {
    // No env var stripping needed. The Gemini CLI respects settings.json
    // selectedType (oauth-personal) and ignores GOOGLE_API_KEY/GEMINI_API_KEY
    // when OAuth is active.
    return {}
  },

  postProcessOutput(output: string): string {
    // With -o json, output is a JSON object with response + stats.
    // Extract just the response text for downstream consumers.
    try {
      const data = JSON.parse(output)
      return data.response ?? output
    } catch {
      return output
    }
  },

  parseUsage(rawOutput: string): ParsedUsage | undefined {
    if (!rawOutput.trim()) return undefined
    try {
      const data = JSON.parse(rawOutput)
      const models = data.stats?.models
      if (!models) return undefined

      const modelName = Object.keys(models)[0]
      if (!modelName) return undefined

      const entry = models[modelName]
      const tokens = entry.tokens
      if (!tokens) return undefined

      const usage: ParsedUsage = {
        input_tokens: tokens.input ?? 0,
        output_tokens: tokens.candidates ?? 0,
      }
      if (tokens.cached > 0) usage.cache_read_tokens = tokens.cached
      if (tokens.thoughts > 0) usage.thinking_tokens = tokens.thoughts
      if (tokens.tool > 0) usage.tool_tokens = tokens.tool
      if (entry.api?.totalLatencyMs) usage.api_duration_ms = entry.api.totalLatencyMs
      if (data.session_id) usage.session_id = data.session_id
      usage.model_used = modelName
      return usage
    } catch {
      return undefined
    }
  },
}

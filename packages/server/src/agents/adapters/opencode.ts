import type { AgentAdapter, AdapterOptions, ParsedUsage } from './types'

export const opencodeAdapter: AgentAdapter = {
  id: 'opencode',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    return [
      'run',
      '--format', 'json',
      ...(model ? ['-m', model] : ['-m', 'opencode/kimi-k2.5-free']),
      prompt,
    ]
  },

  buildEnv(options: AdapterOptions): Record<string, string> {
    const model = options.model ?? 'opencode/kimi-k2.5-free'
    // Strip paid-provider API keys when using free Zen models
    // to prevent accidental credit burn from env var inheritance
    if (model.startsWith('opencode/')) {
      return {
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
        OPENROUTER_API_KEY: '',
      }
    }
    return {}
  },

  postProcessOutput(output: string): string {
    if (!output.trim()) return output

    // --format json outputs NDJSON events: step_start, text, step_finish
    const lines = output.trim().split('\n')
    const textParts: string[] = []

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'text' && event.part?.text) {
          textParts.push(event.part.text)
        }
      } catch {
        // Non-JSON line, include as raw text
        textParts.push(line)
      }
    }

    if (textParts.length > 0) return textParts.join('').trim()
    return output
  },

  parseUsage(rawOutput: string): ParsedUsage | undefined {
    if (!rawOutput.trim()) return undefined
    try {
      const lines = rawOutput.trim().split('\n')
      let inputTokens = 0
      let outputTokens = 0
      let reasoningTokens = 0
      let cacheRead = 0
      let cacheWrite = 0
      let costUsd = 0
      let sessionId: string | undefined
      let found = false

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (!sessionId && event.sessionID) sessionId = event.sessionID
          if (event.type === 'step_finish' && event.part) {
            found = true
            const t = event.part.tokens
            if (t) {
              inputTokens += t.input ?? 0
              outputTokens += t.output ?? 0
              reasoningTokens += t.reasoning ?? 0
              cacheRead += t.cache?.read ?? 0
              cacheWrite += t.cache?.write ?? 0
            }
            costUsd += event.part.cost ?? 0
          }
        } catch {
          // skip non-JSON lines
        }
      }

      if (!found) return undefined

      const usage: ParsedUsage = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
      }
      if (cacheRead > 0) usage.cache_read_tokens = cacheRead
      if (cacheWrite > 0) usage.cache_write_tokens = cacheWrite
      if (reasoningTokens > 0) usage.thinking_tokens = reasoningTokens
      if (sessionId) usage.session_id = sessionId
      return usage
    } catch {
      return undefined
    }
  },
}

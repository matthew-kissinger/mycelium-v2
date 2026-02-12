import type { AgentAdapter, AdapterOptions, ParsedUsage } from './types'

export const codexAdapter: AgentAdapter = {
  id: 'codex',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    // codex exec "prompt" --model gpt-5.2-codex --full-auto --json
    return [
      'exec',
      prompt,
      ...(model ? ['--model', model] : []),
      '--full-auto',
      '--json',
      '--color', 'never',
    ]
  },

  buildEnv(): Record<string, string> {
    // No env var stripping needed. Codex prioritizes ChatGPT OAuth
    // from ~/.codex/auth.json over OPENAI_API_KEY in env.
    return {}
  },

  postProcessOutput(output: string): string {
    // With --json, output is JSONL. Extract the final agent_message text.
    const lines = output.trim().split('\n')
    let lastMessage = ''
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
          lastMessage = event.item.text ?? ''
        }
      } catch {
        // Non-JSON line, skip
      }
    }
    return lastMessage || output
  },

  parseUsage(rawOutput: string): ParsedUsage | undefined {
    if (!rawOutput.trim()) return undefined
    try {
      const lines = rawOutput.trim().split('\n')
      let inputTokens = 0
      let outputTokens = 0
      let cacheReadTokens = 0
      let sessionId: string | undefined
      let found = false

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === 'thread.started' && event.thread_id) {
            sessionId = event.thread_id
          }
          if (event.type === 'turn.completed' && event.usage) {
            inputTokens += event.usage.input_tokens ?? 0
            outputTokens += event.usage.output_tokens ?? 0
            cacheReadTokens += event.usage.cached_input_tokens ?? 0
            found = true
          }
        } catch {
          // Non-JSON line, skip
        }
      }

      if (!found) return undefined
      const result: ParsedUsage = { input_tokens: inputTokens, output_tokens: outputTokens }
      if (cacheReadTokens > 0) result.cache_read_tokens = cacheReadTokens
      if (sessionId) result.session_id = sessionId
      return result
    } catch {
      return undefined
    }
  },
}

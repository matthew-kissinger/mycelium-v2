import type { AgentAdapter, AdapterOptions } from './types'

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
}

import type { AgentAdapter, AdapterOptions } from './types'

export const cursorAdapter: AgentAdapter = {
  id: 'cursor',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, maxTurns } = options
    // agent --print --output-format json [--model <model>] [--max-turns N] "prompt"
    return [
      '--print',
      '--output-format', 'json',
      ...(model ? ['--model', model] : []),
      ...(maxTurns ? ['--max-turns', String(maxTurns)] : []),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

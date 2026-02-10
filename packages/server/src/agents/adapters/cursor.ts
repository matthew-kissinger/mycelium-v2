import type { AgentAdapter, AdapterOptions } from './types'

export const cursorAdapter: AgentAdapter = {
  id: 'cursor',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    // agent --print --output-format json [--model <model>] "prompt"
    return [
      '--print',
      '--output-format', 'json',
      ...(model ? ['--model', model] : []),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

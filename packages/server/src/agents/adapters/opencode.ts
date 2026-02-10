import type { AgentAdapter, AdapterOptions } from './types'

export const opencodeAdapter: AgentAdapter = {
  id: 'opencode',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    // opencode run "prompt" [-m model]
    return [
      'run',
      ...(model ? ['-m', model] : ['-m', 'opencode/kimi-k2.5-free']),
      prompt,
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

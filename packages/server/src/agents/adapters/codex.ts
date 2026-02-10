import type { AgentAdapter, AdapterOptions } from './types'

export const codexAdapter: AgentAdapter = {
  id: 'codex',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    // codex exec "prompt" --model gpt-5.2-codex --full-auto
    return [
      'exec',
      prompt,
      ...(model ? ['--model', model] : []),
      '--full-auto',
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

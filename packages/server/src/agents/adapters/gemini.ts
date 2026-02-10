import type { AgentAdapter, AdapterOptions } from './types'

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    // gemini "prompt" --model gemini-2.5-flash --yolo
    return [
      prompt,
      ...(model ? ['--model', model] : []),
      '--yolo',
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

import type { AgentAdapter, AdapterOptions } from './types'

export const claudeAdapter: AgentAdapter = {
  id: 'claude',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, sessionId } = options
    // claude -p "prompt" --model sonnet --dangerously-skip-permissions
    // --resume <sessionId> continues a previous session (for retries)
    return [
      ...(sessionId ? ['--resume', sessionId] : ['-p', prompt]),
      ...(model ? ['--model', model] : []),
      '--dangerously-skip-permissions',
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },
}

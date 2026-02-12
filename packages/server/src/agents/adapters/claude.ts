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

  buildEnv(options: AdapterOptions): Record<string, string> {
    // If provider is explicitly set (e.g. task created with provider: "anthropic"),
    // keep ANTHROPIC_API_KEY so the CLI uses API key auth (pay-per-token).
    // Otherwise strip it so the CLI falls back to subscription auth (Max plan).
    // The key stays in process.env for model fetching and other non-CLI uses.
    if (options.provider) {
      return {}
    }
    return { ANTHROPIC_API_KEY: '' }
  },
}

import type { AgentAdapter, AdapterOptions } from './types'

export const copilotAdapter: AgentAdapter = {
  id: 'copilot',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    // copilot -p "prompt" [--model <model>] --allow-all-tools --no-ask-user
    // Without --model, falls back to ~/.copilot/config.json default (gemini-3-pro-preview)
    return [
      '-p', prompt,
      ...(model ? ['--model', model] : []),
      '--allow-all-tools',
      '--no-ask-user',
      '--allow-all-paths',
      '--no-auto-update',
      '--no-custom-instructions',
      '--disable-builtin-mcps',
    ]
  },

  buildEnv(): Record<string, string> {
    // Strip GITHUB_TOKEN and GH_TOKEN to prevent fine-grained PAT from
    // overriding Copilot's stored OAuth credentials (causes 401 on model listing).
    // Copilot falls back to its own stored OAuth from `copilot login`.
    return { GITHUB_TOKEN: '', GH_TOKEN: '' }
  },
}

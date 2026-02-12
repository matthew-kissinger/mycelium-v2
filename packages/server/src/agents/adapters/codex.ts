import type { AgentAdapter, AdapterOptions } from './types'

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
}

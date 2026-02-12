import { getCredential } from '../credentials'
import type { AgentAdapter, AdapterOptions } from './types'

export const vibeAdapter: AgentAdapter = {
  id: 'vibe',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt } = options
    return [
      '-p', prompt,
      '--output', 'json',
    ]
  },

  buildEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    const key = getCredential('MISTRAL_API_KEY')
    if (key) env.MISTRAL_API_KEY = key
    return env
  },

  postProcessOutput(output: string): string {
    if (!output.trim()) return output

    // --output json returns a JSON array of messages
    try {
      const messages = JSON.parse(output.trim())
      if (Array.isArray(messages)) {
        // Find the last assistant message
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && messages[i].content) {
            return messages[i].content
          }
        }
      }
    } catch {
      // Not valid JSON, return as-is
    }
    return output
  },
}

import type { ProviderType } from '@mycelium/shared'
import { getCredential } from '../credentials'
import type { AgentAdapter, AdapterOptions } from './types'

function mapProviderToPi(provider: ProviderType): string {
  switch (provider) {
    case 'openrouter': return 'openrouter'
    case 'groq': return 'groq'
    case 'cerebras': return 'cerebras'
    case 'mistral': return 'mistral'
    case 'google': return 'google'
    case 'anthropic': return 'anthropic'
    case 'openai': return 'openai'
    default: return 'openrouter'
  }
}

export const piAdapter: AgentAdapter = {
  id: 'pi',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, provider } = options
    return [
      '-p', prompt,
      '--mode', 'json',
      ...(provider ? ['--provider', mapProviderToPi(provider)] : ['--provider', 'openrouter']),
      ...(model ? ['--model', model] : []),
    ]
  },

  buildEnv(options: AdapterOptions): Record<string, string> {
    const env: Record<string, string> = {}
    const p = options.provider ?? 'openrouter'

    if (p === 'openrouter') {
      const key = getCredential('OPENROUTER_API_KEY')
      if (key) env.OPENROUTER_API_KEY = key
    } else if (p === 'mistral') {
      const key = getCredential('MISTRAL_API_KEY')
      if (key) env.MISTRAL_API_KEY = key
    } else if (p === 'groq') {
      const key = getCredential('GROQ_API_KEY')
      if (key) env.GROQ_API_KEY = key
    } else if (p === 'cerebras') {
      const key = getCredential('CEREBRAS_API_KEY')
      if (key) env.CEREBRAS_API_KEY = key
    }

    return env
  },

  postProcessOutput(output: string): string {
    if (!output.trim()) return output

    // --mode json outputs NDJSON events
    // Extract text from message_update events and agent_end
    const lines = output.trim().split('\n')
    const textParts: string[] = []

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        // agent_end contains the final messages array
        if (event.type === 'agent_end' && Array.isArray(event.messages)) {
          for (const msg of event.messages) {
            if (msg.role === 'assistant' && typeof msg.content === 'string') {
              return msg.content
            }
          }
        }
        // Fallback: collect text deltas from message_update
        if (event.type === 'message_update' && event.delta?.type === 'text' && event.delta?.text) {
          textParts.push(event.delta.text)
        }
      } catch {
        // Non-JSON line, include as raw text
        textParts.push(line)
      }
    }

    if (textParts.length > 0) return textParts.join('').trim()
    return output
  },

  tracksOpenRouterUsage(options: AdapterOptions): boolean {
    return options.provider === 'openrouter' || !options.provider
  },
}

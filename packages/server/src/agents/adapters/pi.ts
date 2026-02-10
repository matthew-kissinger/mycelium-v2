import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ProviderType } from '@mycelium/shared'
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

function getGroqApiKey(): string | null {
  const configPath = join(homedir(), '.groq', 'config.json')
  if (!existsSync(configPath)) return null
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.apiKey ?? null
  } catch {
    return null
  }
}

export const piAdapter: AgentAdapter = {
  id: 'pi',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, provider } = options
    // pi -p "prompt" --provider <provider> --model <model>
    return [
      '-p', prompt,
      ...(provider ? ['--provider', mapProviderToPi(provider)] : ['--provider', 'openrouter']),
      ...(model ? ['--model', model] : []),
    ]
  },

  buildEnv(options: AdapterOptions): Record<string, string> {
    const env: Record<string, string> = {}
    const configDir = join(homedir(), '.config', 'mk-agent')
    const p = options.provider ?? 'openrouter'

    if (p === 'openrouter') {
      const keyPath = join(configDir, 'OPENROUTER_API_KEY')
      if (existsSync(keyPath)) {
        const content = readFileSync(keyPath, 'utf-8')
        const match = content.match(/OPENROUTER_API_KEY=(.+)/)
        if (match) env.OPENROUTER_API_KEY = match[1].trim()
      }
    } else if (p === 'mistral') {
      const keyPath = join(configDir, 'MISTRAL_API_KEY')
      if (existsSync(keyPath)) {
        const content = readFileSync(keyPath, 'utf-8')
        const match = content.match(/MISTRAL_API_KEY=(.+)/)
        if (match) env.MISTRAL_API_KEY = match[1].trim()
      }
    } else if (p === 'groq') {
      const apiKey = getGroqApiKey()
      if (apiKey) env.GROQ_API_KEY = apiKey
    } else if (p === 'cerebras') {
      const keyPath = join(configDir, 'CEREBRAS_API_KEY')
      if (existsSync(keyPath)) {
        const content = readFileSync(keyPath, 'utf-8').trim()
        env.CEREBRAS_API_KEY = content
      }
    }

    return env
  },

  tracksOpenRouterUsage(options: AdapterOptions): boolean {
    return options.provider === 'openrouter' || !options.provider
  },
}

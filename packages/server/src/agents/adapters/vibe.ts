import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { AgentAdapter, AdapterOptions } from './types'

export const vibeAdapter: AgentAdapter = {
  id: 'vibe',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt } = options
    // vibe -p "prompt" --output text
    return [
      '-p', prompt,
      '--output', 'text',
    ]
  },

  buildEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    const keyPath = join(homedir(), '.config', 'mk-agent', 'MISTRAL_API_KEY')
    if (existsSync(keyPath)) {
      const content = readFileSync(keyPath, 'utf-8')
      const match = content.match(/MISTRAL_API_KEY=(.+)/)
      if (match) env.MISTRAL_API_KEY = match[1].trim()
    }
    return env
  },
}

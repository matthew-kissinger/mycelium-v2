import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { AgentAdapter, AdapterOptions } from './types'

function getCopilotToken(): string | null {
  const tokenPath = join(homedir(), '.config', 'mk-agent', 'COPILOT_TOKEN')
  if (!existsSync(tokenPath)) return null
  try {
    return readFileSync(tokenPath, 'utf-8').trim()
  } catch {
    return null
  }
}

export const copilotAdapter: AgentAdapter = {
  id: 'copilot',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model } = options
    // copilot -p "prompt" [--model <model>] --allow-all-tools --no-ask-user
    return [
      '-p', prompt,
      ...(model ? ['--model', model] : ['--model', 'claude-sonnet-4.5']),
      '--allow-all-tools',
      '--no-ask-user',
    ]
  },

  buildEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    const token = getCopilotToken()
    if (token) {
      env.GH_TOKEN = token
    }
    return env
  },
}

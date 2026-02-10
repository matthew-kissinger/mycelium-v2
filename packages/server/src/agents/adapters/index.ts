import type { AgentType } from '@mycelium/shared'
import type { AgentAdapter } from './types'

import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { geminiAdapter } from './gemini'
import { clineAdapter } from './cline'
import { cursorAdapter } from './cursor'
import { kiroAdapter } from './kiro'
import { vibeAdapter } from './vibe'
import { piAdapter } from './pi'
import { opencodeAdapter } from './opencode'
import { copilotAdapter } from './copilot'

const adapters = new Map<string, AgentAdapter>()

// Register all built-in adapters
for (const adapter of [
  claudeAdapter,
  codexAdapter,
  geminiAdapter,
  clineAdapter,
  cursorAdapter,
  kiroAdapter,
  vibeAdapter,
  piAdapter,
  opencodeAdapter,
  copilotAdapter,
]) {
  adapters.set(adapter.id, adapter)
}

export function getAdapter(agentId: AgentType | string): AgentAdapter | undefined {
  return adapters.get(agentId)
}

export function registerAdapter(adapter: AgentAdapter): void {
  adapters.set(adapter.id, adapter)
}

export function getAllAdapters(): AgentAdapter[] {
  return Array.from(adapters.values())
}

// Re-exports
export type { AgentAdapter, AdapterOptions } from './types'
export { getClineConfig } from './cline'
export { acquireClineAddress, releaseClineAddress } from './cline'

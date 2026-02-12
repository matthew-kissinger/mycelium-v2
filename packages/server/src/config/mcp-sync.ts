/**
 * MCP Config Sync - Canonical MCP server registry + agent config sync.
 *
 * Reads canonical MCP config from ~/.cursor/mcp.json (standard format)
 * and syncs to all agent config files that support MCP.
 *
 * Called at: server startup + when MCP inventory changes via API.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

// =============================================================================
// Types
// =============================================================================

export interface CanonicalMcpServer {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

// =============================================================================
// Canonical Source
// =============================================================================

const CANONICAL_SOURCE = join(homedir(), '.cursor', 'mcp.json')

/**
 * Read canonical MCP servers from ~/.cursor/mcp.json.
 * This file is the single source of truth for all MCP server configs.
 */
export function getCanonicalMcpServers(): CanonicalMcpServer[] {
  if (!existsSync(CANONICAL_SOURCE)) {
    console.warn('[MCP Sync] Canonical source not found:', CANONICAL_SOURCE)
    return []
  }

  try {
    const content = readFileSync(CANONICAL_SOURCE, 'utf-8')
    const config = JSON.parse(content)
    const mcpServers = config.mcpServers ?? {}

    const servers: CanonicalMcpServer[] = []
    for (const [name, server] of Object.entries(mcpServers)) {
      const s = server as { command?: string; args?: string[]; env?: Record<string, string> }
      if (!s.command) continue
      servers.push({
        name,
        command: s.command,
        args: s.args ?? [],
        env: s.env,
      })
    }

    return servers
  } catch (error) {
    console.error('[MCP Sync] Error reading canonical source:', error)
    return []
  }
}

// =============================================================================
// Per-Agent Config Writers
// =============================================================================

function ensureDir(filePath: string): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function readJsonSafe(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeJsonSafe(filePath: string, data: unknown): boolean {
  try {
    ensureDir(filePath)
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
    return true
  } catch (error) {
    console.error(`[MCP Sync] Error writing ${filePath}:`, error)
    return false
  }
}

/**
 * Sync to Cursor (~/.cursor/mcp.json).
 * This IS the canonical source, so we skip writing (it's already correct).
 */
function syncToCursor(): boolean {
  return true // Already the canonical source
}

/**
 * Sync to Cline (~/.cline/data/settings/cline_mcp_settings.json).
 * Format: { mcpServers: { name: { command, args, disabled: false } } }
 */
function syncToCline(servers: CanonicalMcpServer[]): boolean {
  const filePath = join(homedir(), '.cline', 'data', 'settings', 'cline_mcp_settings.json')
  const existing = readJsonSafe(filePath)
  const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>

  for (const server of servers) {
    mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      ...(server.env ? { env: server.env } : {}),
      disabled: false,
    }
  }

  return writeJsonSafe(filePath, { mcpServers })
}

/**
 * Sync to Codex (~/.codex/config.toml).
 * Format: [mcp_servers.name] command = "..." args = [...]
 * IMPORTANT: Merge with existing config, don't overwrite.
 *
 * Strategy: Parse line-by-line, keep everything that's NOT an mcp_servers
 * section or orphaned bracket line, then append fresh mcp_servers sections.
 */
function syncToCodex(servers: CanonicalMcpServer[]): boolean {
  const filePath = join(homedir(), '.codex', 'config.toml')

  try {
    let content = ''
    if (existsSync(filePath)) {
      content = readFileSync(filePath, 'utf-8')
    }

    // Line-by-line filter: keep only non-MCP lines.
    // This avoids the regex issue where orphaned bracket lines
    // (e.g. ["-y", "pkg"]) weren't caught by the old pattern.
    const lines = content.split('\n')
    const kept: string[] = []
    let inMcpSection = false

    for (const line of lines) {
      const trimmed = line.trim()

      // Entering an [mcp_servers.*] section - skip it and its body
      if (/^\[mcp_servers\.[^\]]+\]$/.test(trimmed)) {
        inMcpSection = true
        continue
      }

      // Any line starting with [ is a new section header
      if (trimmed.startsWith('[')) {
        // Check if this is a valid TOML table (not an orphaned array value)
        // Valid tables: [projects."/path"], [mcp_servers.x], etc.
        // Invalid (orphaned): ["-y", "pkg"], ["@playwright/mcp@latest"]
        const isValidTable = /^\[[a-zA-Z_]/.test(trimmed)
        if (isValidTable) {
          inMcpSection = false
          kept.push(line)
        }
        // else: orphaned bracket line from bad sync - skip it
        continue
      }

      // Skip body lines of mcp_servers sections
      if (inMcpSection) continue

      kept.push(line)
    }

    content = kept.join('\n').trimEnd()

    // Append fresh MCP server sections
    const mcpSections: string[] = []
    for (const server of servers) {
      const argsStr = server.args.map(a => `"${a}"`).join(', ')
      const sectionLines = [
        `[mcp_servers.${server.name}]`,
        `command = "${server.command}"`,
        `args = [${argsStr}]`,
      ]
      if (server.env) {
        for (const [key, value] of Object.entries(server.env)) {
          sectionLines.push(`env.${key} = "${value}"`)
        }
      }
      mcpSections.push(sectionLines.join('\n'))
    }

    if (mcpSections.length > 0) {
      content += '\n\n' + mcpSections.join('\n\n') + '\n'
    }

    writeFileSync(filePath, content)
    return true
  } catch (error) {
    console.error('[MCP Sync] Error syncing to Codex:', error)
    return false
  }
}

/**
 * Sync to Gemini (~/.gemini/settings.json).
 * Format: { ..., mcpServers: { name: { command, args } } }
 */
function syncToGemini(servers: CanonicalMcpServer[]): boolean {
  const filePath = join(homedir(), '.gemini', 'settings.json')
  const existing = readJsonSafe(filePath)

  const mcpServers: Record<string, unknown> = {}
  for (const server of servers) {
    mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      ...(server.env ? { env: server.env } : {}),
    }
  }

  existing.mcpServers = mcpServers
  return writeJsonSafe(filePath, existing)
}

/**
 * Sync to Copilot (~/.copilot/mcp-config.json).
 * Format: { mcpServers: { name: { command, args } } }
 */
function syncToCopilot(servers: CanonicalMcpServer[]): boolean {
  const filePath = join(homedir(), '.copilot', 'mcp-config.json')

  const mcpServers: Record<string, unknown> = {}
  for (const server of servers) {
    mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      ...(server.env ? { env: server.env } : {}),
    }
  }

  return writeJsonSafe(filePath, { mcpServers })
}

/**
 * Sync to Kiro (~/.kiro/settings/mcp.json).
 * Format: { mcpServers: { name: { command, args } } }
 */
function syncToKiro(servers: CanonicalMcpServer[]): boolean {
  const filePath = join(homedir(), '.kiro', 'settings', 'mcp.json')

  const mcpServers: Record<string, unknown> = {}
  for (const server of servers) {
    mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      ...(server.env ? { env: server.env } : {}),
    }
  }

  return writeJsonSafe(filePath, { mcpServers })
}

/**
 * Sync to Vibe (~/.vibe/config.toml).
 * Format: [[mcp_servers]] name = "..." command = "..." args = [...]
 * IMPORTANT: Preserve existing config entries (api_key, etc.), only update MCP.
 */
function syncToVibe(servers: CanonicalMcpServer[]): boolean {
  const filePath = join(homedir(), '.vibe', 'config.toml')

  try {
    let content = ''
    if (existsSync(filePath)) {
      content = readFileSync(filePath, 'utf-8')
    }

    // Remove existing [[mcp_servers]] blocks
    content = content.replace(/\[\[mcp_servers\]\]\n(?:(?!\[\[)[^\n]*\n?)*/g, '')
    content = content.trimEnd()

    // Append MCP server blocks
    const mcpBlocks: string[] = []
    for (const server of servers) {
      const argsStr = server.args.map(a => `"${a}"`).join(', ')
      const lines = [
        `[[mcp_servers]]`,
        `name = "${server.name}"`,
        `command = "${server.command}"`,
        `args = [${argsStr}]`,
      ]
      mcpBlocks.push(lines.join('\n'))
    }

    if (mcpBlocks.length > 0) {
      content += '\n\n' + mcpBlocks.join('\n\n') + '\n'
    }

    writeFileSync(filePath, content)
    return true
  } catch (error) {
    console.error('[MCP Sync] Error syncing to Vibe:', error)
    return false
  }
}

/**
 * Sync to OpenCode (~/.config/opencode/opencode.json).
 * Format: { mcp: { name: { type: "local", command: ["cmd", ...args] } } }
 */
function syncToOpenCode(servers: CanonicalMcpServer[]): boolean {
  const filePath = join(homedir(), '.config', 'opencode', 'opencode.json')
  const existing = readJsonSafe(filePath)

  const mcp: Record<string, unknown> = {}
  for (const server of servers) {
    mcp[server.name] = {
      type: 'local',
      command: [server.command, ...server.args],
      ...(server.env ? { env: server.env } : {}),
    }
  }

  existing.mcp = mcp
  return writeJsonSafe(filePath, existing)
}

// =============================================================================
// Public API
// =============================================================================

const AGENT_SYNC_MAP: Record<string, (servers: CanonicalMcpServer[]) => boolean> = {
  cursor: syncToCursor,
  cline: syncToCline,
  codex: syncToCodex,
  gemini: syncToGemini,
  copilot: syncToCopilot,
  kiro: syncToKiro,
  vibe: syncToVibe,
  opencode: syncToOpenCode,
}

/**
 * Sync canonical MCP config to a specific agent.
 */
export function syncToAgent(agent: string): boolean {
  const servers = getCanonicalMcpServers()
  if (servers.length === 0) {
    console.warn('[MCP Sync] No canonical servers found, skipping sync')
    return false
  }

  const syncFn = AGENT_SYNC_MAP[agent]
  if (!syncFn) {
    console.warn(`[MCP Sync] No sync handler for agent: ${agent}`)
    return false
  }

  const result = syncFn(servers)
  if (result) {
    console.log(`[MCP Sync] Synced ${servers.length} servers to ${agent}`)
  }
  return result
}

/**
 * Sync canonical MCP config to all agents.
 * Called at server startup.
 */
export function syncToAllAgents(): { synced: string[]; failed: string[] } {
  const servers = getCanonicalMcpServers()
  if (servers.length === 0) {
    console.warn('[MCP Sync] No canonical servers found, skipping sync')
    return { synced: [], failed: [] }
  }

  console.log(`[MCP Sync] Syncing ${servers.length} canonical MCP servers to all agents...`)

  const synced: string[] = []
  const failed: string[] = []

  for (const [agent, syncFn] of Object.entries(AGENT_SYNC_MAP)) {
    try {
      if (syncFn(servers)) {
        synced.push(agent)
      } else {
        failed.push(agent)
      }
    } catch (error) {
      console.error(`[MCP Sync] Error syncing to ${agent}:`, error)
      failed.push(agent)
    }
  }

  console.log(`[MCP Sync] Done. Synced: ${synced.join(', ')}. Failed: ${failed.join(', ') || 'none'}`)
  return { synced, failed }
}

/**
 * Write a temporary MCP config file for per-invocation use.
 * Returns the path to the temp file.
 * Used by adapters that support runtime MCP config (claude --mcp-config).
 */
export function writeTempMcpConfig(serverNames: string[]): string | null {
  const allServers = getCanonicalMcpServers()
  const selected = allServers.filter(s => serverNames.includes(s.name))

  if (selected.length === 0) return null

  const config: Record<string, unknown> = {}
  for (const server of selected) {
    config[server.name] = {
      command: server.command,
      args: server.args,
      ...(server.env ? { env: server.env } : {}),
    }
  }

  const tempDir = join(homedir(), '.mycelium', 'tmp')
  ensureDir(join(tempDir, 'x'))
  const tempPath = join(tempDir, `mcp-${Date.now()}.json`)
  writeFileSync(tempPath, JSON.stringify({ mcpServers: config }, null, 2))

  return tempPath
}

/**
 * Get canonical server names for listing/validation.
 */
export function getCanonicalServerNames(): string[] {
  return getCanonicalMcpServers().map(s => s.name)
}

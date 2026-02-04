/**
 * Inventory helpers - read installed skills and MCP servers
 *
 * MCPs are queried from multiple sources:
 * - Claude: `claude mcp list` CLI
 * - Codex: `codex mcp list` CLI
 * - Cursor: ~/.cursor/mcp.json
 * - Cline: ~/.cline/data/settings/cline_mcp_settings.json
 * - Gemini: `gemini mcp list` CLI
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from 'fs'
import { execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'

// Types for inventory items
export interface Skill {
  name: string
  description: string
  path: string
}

export interface McpServer {
  name: string
  command: string
  args?: string[]
  source?: string // Which agent config this came from
}

// Paths
const SKILLS_DIR = join(homedir(), '.claude', 'skills')
const CURSOR_MCP_CONFIG = join(homedir(), '.cursor', 'mcp.json')
const CLINE_MCP_CONFIG = join(homedir(), '.cline', 'data', 'settings', 'cline_mcp_settings.json')

/**
 * Parse SKILL.md frontmatter to extract description.
 * Format:
 * ---
 * description: "..."
 * ---
 */
function parseSkillDescription(content: string): string {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) {
    // Try to get first paragraph after title
    const lines = content.split('\n')
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
        return line.trim().slice(0, 200)
      }
    }
    return 'No description'
  }

  const frontmatter = frontmatterMatch[1]
  const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/)
  if (descMatch) {
    return descMatch[1].trim()
  }

  return 'No description'
}

/**
 * Get all installed skills from ~/.claude/skills/
 * Handles both direct skills and nested skills in parent repos.
 */
export function getInstalledSkills(): Skill[] {
  const skills: Skill[] = []

  if (!existsSync(SKILLS_DIR)) {
    return skills
  }

  // Track seen skill names to avoid duplicates
  const seen = new Set<string>()

  /**
   * Add a skill if it has a valid SKILL.md and isn't a duplicate
   */
  function addSkill(name: string, skillPath: string): boolean {
    const skillMdPath = join(skillPath, 'SKILL.md')
    if (!existsSync(skillMdPath)) return false
    if (seen.has(name)) return true // Already have this skill

    seen.add(name)
    try {
      const content = readFileSync(skillMdPath, 'utf-8')
      const description = parseSkillDescription(content)
      skills.push({ name, description, path: skillPath })
      return true
    } catch {
      skills.push({ name, description: 'Unable to read skill file', path: skillPath })
      return true
    }
  }

  try {
    const entries = readdirSync(SKILLS_DIR, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.')) continue

      let skillPath = join(SKILLS_DIR, entry.name)

      // Resolve symlinks
      if (entry.isSymbolicLink()) {
        try {
          skillPath = realpathSync(skillPath)
        } catch {
          continue
        }
      }

      // Try direct skill first
      if (addSkill(entry.name, skillPath)) {
        continue
      }

      // Check for nested skills in skills/ subdirectory
      const nestedSkillsPath = join(skillPath, 'skills')
      if (existsSync(nestedSkillsPath)) {
        try {
          const nestedEntries = readdirSync(nestedSkillsPath, { withFileTypes: true })
          for (const nested of nestedEntries) {
            if (!nested.isDirectory()) continue
            if (nested.name.startsWith('.')) continue
            addSkill(nested.name, join(nestedSkillsPath, nested.name))
          }
        } catch {
          // Skip if can't read nested directory
        }
      }
    }
  } catch (error) {
    console.error('[Inventory] Error reading skills:', error)
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Query MCP servers from a CLI command (claude, codex, gemini).
 * Parses output like: "playwright: npx @playwright/mcp@latest - ✓ Connected"
 */
function queryMcpFromCli(command: string, source: string): McpServer[] {
  const servers: McpServer[] = []

  try {
    const output = execSync(`${command} mcp list 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000,
    })

    for (const line of output.split('\n')) {
      const trimmed = line.trim()
      // Skip header lines and empty lines
      if (!trimmed || trimmed.startsWith('Checking') || trimmed.startsWith('Name')) continue

      // Parse "name: command args - status" or table format
      // Handle Claude's "plugin:context7:context7: npx..." format
      if (trimmed.includes(':')) {
        // Find the last colon that precedes "npx" or a command
        const npxIdx = trimmed.indexOf('npx')
        if (npxIdx > 0) {
          // Find the colon just before the command
          const colonIdx = trimmed.lastIndexOf(':', npxIdx)
          if (colonIdx > 0) {
            const name = trimmed.slice(0, colonIdx).trim()
            let cmd = trimmed.slice(colonIdx + 1).trim()
            // Extract command before status indicator " - "
            if (cmd.includes(' - ')) {
              cmd = cmd.split(' - ')[0].trim()
            }
            servers.push({ name, command: cmd, source })
            continue
          }
        }
        // Fallback: simple split on first colon
        const [name, rest] = trimmed.split(':', 2)
        if (name && rest) {
          let cmd = rest.trim()
          if (cmd.includes(' - ')) {
            cmd = cmd.split(' - ')[0].trim()
          }
          servers.push({ name: name.trim(), command: cmd, source })
        }
      } else if (trimmed.includes('npx')) {
        // Table format: "name    npx    args..."
        const parts = trimmed.split(/\s{2,}/)
        if (parts.length >= 2) {
          const name = parts[0].trim()
          const cmd = parts.slice(1, 3).join(' ').trim()
          if (name && cmd) {
            servers.push({ name, command: cmd, source })
          }
        }
      }
    }
  } catch {
    // CLI not available or failed - silently skip
  }

  return servers
}

/**
 * Read MCP servers from a JSON config file.
 * Format: { mcpServers: { name: { command, args } } }
 */
function readMcpFromFile(filePath: string, source: string): McpServer[] {
  const servers: McpServer[] = []

  if (!existsSync(filePath)) {
    return servers
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const config = JSON.parse(content)
    const mcpServers = config.mcpServers ?? config.servers ?? {}

    for (const [name, server] of Object.entries(mcpServers)) {
      if (typeof server === 'object' && server !== null) {
        const s = server as { command?: string; args?: string[]; disabled?: boolean }
        // Skip disabled servers
        if (s.disabled) continue

        const args = s.args?.join(' ') || ''
        servers.push({
          name,
          command: s.command ? `${s.command} ${args}`.trim() : 'unknown',
          args: s.args,
          source,
        })
      }
    }
  } catch (error) {
    console.error(`[Inventory] Error reading MCP config from ${filePath}:`, error)
  }

  return servers
}

/**
 * Get all installed MCP servers from all agent configs.
 * Queries CLI for claude/codex/gemini, reads files for cursor/cline.
 * Dedupes by name, preferring connected/enabled sources.
 */
export function getMcpServers(): McpServer[] {
  const allServers: McpServer[] = []

  // Query CLI-based agents
  allServers.push(...queryMcpFromCli('claude', 'claude'))
  allServers.push(...queryMcpFromCli('codex', 'codex'))
  allServers.push(...queryMcpFromCli('gemini', 'gemini'))

  // Read file-based configs
  allServers.push(...readMcpFromFile(CURSOR_MCP_CONFIG, 'cursor'))
  allServers.push(...readMcpFromFile(CLINE_MCP_CONFIG, 'cline'))

  // Dedupe by name, keeping first occurrence (CLI sources come first)
  // Also normalize names - strip "plugin:" prefix (Claude-specific naming)
  const seen = new Map<string, McpServer>()
  for (const server of allServers) {
    let name = server.name
    // Skip plugin-prefixed entries (Claude's internal naming for the same MCPs)
    if (name.startsWith('plugin:')) continue

    if (!seen.has(name)) {
      seen.set(name, { ...server, name })
    }
  }

  const servers = Array.from(seen.values())
  console.log(`[Inventory] Found ${servers.length} MCP servers from ${allServers.length} total entries`)

  return servers.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get full inventory (skills + MCPs)
 */
export function getInventory(): { skills: Skill[]; mcps: McpServer[] } {
  return {
    skills: getInstalledSkills(),
    mcps: getMcpServers(),
  }
}

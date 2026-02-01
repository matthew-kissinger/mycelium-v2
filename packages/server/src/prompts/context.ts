/**
 * Context injection for agent prompts.
 *
 * This module builds the dynamic sections that get injected into prompts:
 * - MYCEL_CONTEXT: CLI instructions for human communication
 * - AGENTS_SECTION: Available agents and models
 * - Skills: Domain-specific knowledge from ~/.claude/skills/
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { DEFAULT_AGENT_CONFIGS } from '@mycelium/shared'

// =============================================================================
// MYCEL_CONTEXT - CLI instructions for agents
// =============================================================================

interface MycelContextOptions {
  agentId?: string
  model?: string
  taskId?: string
  taskTitle?: string
  role?: string  // e.g., "task_agent", "shepherd", "discovery"
}

/**
 * Build the MYCEL_CONTEXT instruction block for agent prompts.
 * This teaches agents how to communicate with humans via mycel CLI.
 */
export function buildMycelContext(options: MycelContextOptions = {}): string {
  const { agentId, model, taskId, taskTitle, role } = options

  // Build agent identifier prefix
  const prefixParts: string[] = []
  if (role) prefixParts.push(`[${role.toUpperCase()}]`)
  if (agentId) {
    prefixParts.push(model ? `${agentId}/${model}` : agentId)
  }
  if (taskId) prefixParts.push(`#${taskId.slice(0, 8)}`)

  const agentPrefix = prefixParts.length > 0 ? prefixParts.join(' ') : '[AGENT]'

  // Build identity summary
  let identitySummary = ''
  if (taskTitle) identitySummary += `\n\n**Your current work:** ${taskTitle}`
  if (agentId) identitySummary += `\n**You are:** ${agentId}`

  return `## Human Communication

You have access to the \`mycel\` CLI for communicating with the human operator via Telegram.
${identitySummary}

**Message format:** Always prefix messages with your identity: \`${agentPrefix}\`

### Check User Inbox (HIGH SIGNAL)
\`\`\`bash
# See recent messages from human - check this for context/feedback
mycel inbox --limit 5
\`\`\`
- Unprompted messages (not replies) are especially important - the human reached out proactively.
- Messages with \`[PHOTO]\` have attached files - download with \`mycel download <msg_id>\`

### Alignment Philosophy

**Async-first.** Most work proceeds without blocking. You check inbox, gather context, make informed decisions.

**Async (default)** - Send question, continue working:
\`\`\`bash
mycel align "${agentPrefix}: Your question here - explain context clearly so human can reply naturally"
# Human swipe-replies when they can. Daemon handles the reply.
\`\`\`

**For TASK agents and SHEPHERD** (agents running individual tasks or evaluating merges):
Blocking is RARE (~1 in 20). Only block when:
- **Destructive**: deleting data, force pushing, dropping tables, removing files
- **Major decision**: architecture changes, API breaking changes, security-sensitive code
- **Critical merge**: merge that significantly affects production behavior

\`\`\`bash
mycel align "${agentPrefix}: BLOCKING - About to [describe action]. This will [explain consequences]. Reply 'proceed' to continue or 'abort' to stop." --wait --timeout 10800
\`\`\`

**For other SYSTEM agents (Discovery, Genesis, Digest, Sequencer, Compaction):**
Use async align only. These agents propose work and exit - continuation handles responses.

### Notifications
\`\`\`bash
# Plain text (auto HTML-escaped)
mycel notify "${agentPrefix}: Status update"
\`\`\`

### When to check inbox
- Start of task (any recent user feedback?)
- Before major decisions (did user send guidance?)
- When stuck (user may have sent hints)

### When to ask for alignment
- Ambiguous requirements
- Multiple valid approaches
- Destructive operations
- Decisions outside your knowledge

## Output Requirements (CRITICAL)

**You must ALWAYS land on an output. Never just stop or skip.**

### If Task Completes Successfully
1. Commit your changes with descriptive message
2. Provide summary of what was done
3. Notify: \`mycel notify "${agentPrefix}: Completed - [summary]"\`

### If You're Blocked or Need Human Input
1. Send alignment question with full context
2. Continue with safe work if possible
3. If fully blocked, notify and exit cleanly`
}

// =============================================================================
// AGENTS_SECTION - Dynamic agent/model availability
// =============================================================================

interface AgentInfo {
  command: string
  available: boolean
  models: string[]
  defaultModel: string
  strengths: Record<string, string>
}

/**
 * Get information about available agents.
 * Checks which agents are installed and their configurations.
 */
export function getAvailableAgents(): Record<string, AgentInfo> {
  const agents: Record<string, AgentInfo> = {}

  // Claude
  agents.claude = {
    command: 'claude',
    available: true,  // Assume available, real check would use `which`
    models: ['opus', 'sonnet', 'haiku'],
    defaultModel: 'sonnet',
    strengths: {
      opus: 'Architecture, complex debugging, nuanced decisions',
      sonnet: 'Balanced - good for most tasks',
      haiku: 'Simple fixes, docs, quick iterations',
    },
  }

  // Codex
  agents.codex = {
    command: 'codex',
    available: true,
    models: ['gpt-5.2-codex', 'gpt-4o'],
    defaultModel: 'gpt-5.2-codex',
    strengths: {
      'gpt-5.2-codex': 'Code generation, pattern-based work',
      'gpt-4o': 'Multimodal, general purpose',
    },
  }

  // Gemini
  agents.gemini = {
    command: 'gemini',
    available: true,
    models: ['gemini-3-flash-preview', 'gemini-3-pro'],
    defaultModel: 'gemini-3-flash-preview',
    strengths: {
      'gemini-3-flash-preview': 'Fast iteration, most tasks',
      'gemini-3-pro': 'Deep research (limited credits)',
    },
  }

  // Cline
  agents.cline = {
    command: 'cline',
    available: true,
    models: ['kimi-k2', 'glm-4.7', 'claude-sonnet'],
    defaultModel: 'kimi-k2',
    strengths: {
      'kimi-k2': 'Strong reasoning, code generation',
      'glm-4.7': 'General tasks, Chinese support',
      'claude-sonnet': 'Fallback to Claude via Cline',
    },
  }

  // Cursor
  agents.cursor = {
    command: 'agent',
    available: true,
    models: ['composer-1', 'gpt-4o', 'claude-sonnet'],
    defaultModel: 'composer-1',
    strengths: {
      'composer-1': 'Multi-file composition, large refactors',
      'gpt-4o': 'General purpose with vision',
      'claude-sonnet': 'Balanced, reliable',
    },
  }

  return agents
}

/**
 * Build the AGENTS_SECTION for prompts.
 * Lists available agents and their models with selection guidance.
 */
export function buildAgentsSection(): string {
  const agents = getAvailableAgents()

  const lines: string[] = [
    '## Available Agents and Models',
    '',
    'You MUST select an agent/model combination from this list:',
    '',
  ]

  for (const [name, info] of Object.entries(agents)) {
    if (!info.available) continue

    lines.push(`### ${name}`)
    lines.push(`Models: ${info.models.join(', ')} (default: ${info.defaultModel})`)

    for (const [model, strength] of Object.entries(info.strengths)) {
      lines.push(`  - **${model}**: ${strength}`)
    }

    lines.push('')
  }

  lines.push('**Choose based on task complexity:**')
  lines.push('- Simple fixes, docs, single-file: use haiku/flash/mini models')
  lines.push('- Feature work, multi-file: use sonnet/standard models')
  lines.push('- Architecture, complex reasoning: use opus/pro models')

  return lines.join('\n')
}

// =============================================================================
// SKILLS - Domain-specific knowledge loading
// =============================================================================

interface SkillContent {
  name: string
  description: string
  content: string
  source: 'explicit' | 'auto-detected'
  truncated: boolean
}

const SKILLS_DIR = join(homedir(), '.claude', 'skills')
const MAX_SKILLS_PER_TASK = 3
const MAX_CHARS_PER_SKILL = 8000

// Tech stack to skills mapping
const TECH_SKILL_MAPPING: Record<string, string[]> = {
  // Three.js
  three: ['threejs-fundamentals', 'threejs-materials', 'threejs-lighting'],
  '@types/three': ['threejs-fundamentals'],

  // React
  react: ['react-patterns', 'react-hooks'],
  next: ['nextjs-patterns', 'react-patterns'],

  // Python
  fastapi: ['fastapi-patterns', 'python-async'],
  aiosqlite: ['sqlite-patterns', 'python-async'],

  // Build tools
  vite: ['vite-patterns'],
}

/**
 * List installed skills from ~/.claude/skills/
 */
export function listInstalledSkills(): string[] {
  if (!existsSync(SKILLS_DIR)) return []

  const skills: string[] = []

  for (const item of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!item.isDirectory()) continue

    const skillPath = join(SKILLS_DIR, item.name)

    // Check for nested skills (like threejs-skills/skills/threejs-materials)
    const nestedSkillsPath = join(skillPath, 'skills')
    if (existsSync(nestedSkillsPath)) {
      for (const nested of readdirSync(nestedSkillsPath, { withFileTypes: true })) {
        if (nested.isDirectory() && existsSync(join(nestedSkillsPath, nested.name, 'SKILL.md'))) {
          skills.push(nested.name)
        }
      }
    }

    // Check for direct skill
    if (existsSync(join(skillPath, 'SKILL.md'))) {
      skills.push(item.name)
    }
  }

  return skills
}

/**
 * Find the path to a skill's SKILL.md file.
 */
function findSkillPath(skillName: string): string | null {
  if (!existsSync(SKILLS_DIR)) return null

  // Direct skill
  const directPath = join(SKILLS_DIR, skillName, 'SKILL.md')
  if (existsSync(directPath)) return directPath

  // Nested skill (search all skill repos)
  for (const item of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!item.isDirectory()) continue

    const nestedPath = join(SKILLS_DIR, item.name, 'skills', skillName, 'SKILL.md')
    if (existsSync(nestedPath)) return nestedPath
  }

  return null
}

/**
 * Load a skill's content.
 */
export function loadSkill(skillName: string, source: 'explicit' | 'auto-detected'): SkillContent | null {
  const skillPath = findSkillPath(skillName)
  if (!skillPath) return null

  try {
    let content = readFileSync(skillPath, 'utf-8')

    // Extract description from first line after #
    const firstHeading = content.match(/^#\s+(.+)$/m)
    const description = firstHeading?.[1] || skillName

    // Truncate if needed
    const truncated = content.length > MAX_CHARS_PER_SKILL
    if (truncated) {
      content = content.slice(0, MAX_CHARS_PER_SKILL) + '\n\n[TRUNCATED]'
    }

    return {
      name: skillName,
      description,
      content,
      source,
      truncated,
    }
  } catch {
    return null
  }
}

/**
 * Auto-detect skills based on package.json dependencies.
 */
export function detectSkillsForRepo(repoPath: string): string[] {
  const packageJsonPath = join(repoPath, 'package.json')
  if (!existsSync(packageJsonPath)) return []

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const allDeps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    }

    const detectedSkills = new Set<string>()
    const installedSkills = listInstalledSkills()

    for (const dep of Object.keys(allDeps)) {
      const mappedSkills = TECH_SKILL_MAPPING[dep] || []
      for (const skill of mappedSkills) {
        if (installedSkills.includes(skill)) {
          detectedSkills.add(skill)
        }
      }
    }

    return Array.from(detectedSkills).slice(0, MAX_SKILLS_PER_TASK)
  } catch {
    return []
  }
}

/**
 * Build skills section for a task prompt.
 */
export function buildSkillsSection(
  explicitSkills: string[],
  repoPath?: string
): string {
  const skills: SkillContent[] = []

  // Load explicit skills first
  for (const skillName of explicitSkills) {
    const skill = loadSkill(skillName, 'explicit')
    if (skill) skills.push(skill)
  }

  // Auto-detect remaining slots
  if (repoPath && skills.length < MAX_SKILLS_PER_TASK) {
    const detectedSkills = detectSkillsForRepo(repoPath)
    for (const skillName of detectedSkills) {
      if (skills.length >= MAX_SKILLS_PER_TASK) break
      if (skills.some(s => s.name === skillName)) continue

      const skill = loadSkill(skillName, 'auto-detected')
      if (skill) skills.push(skill)
    }
  }

  if (skills.length === 0) return ''

  const lines: string[] = [
    '## Relevant Skills',
    '',
    'The following domain-specific knowledge has been loaded:',
    '',
  ]

  for (const skill of skills) {
    lines.push(`### ${skill.name} (${skill.source})`)
    lines.push('')
    lines.push(skill.content)
    lines.push('')
  }

  return lines.join('\n')
}

// =============================================================================
// MCP Servers - Available MCP tools
// =============================================================================

/**
 * List MCP servers configured for Claude.
 */
export function listMcpServers(): Array<{ name: string; command: string }> {
  const mcpConfigPath = join(homedir(), '.claude', 'mcp.json')
  if (!existsSync(mcpConfigPath)) return []

  try {
    const config = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'))
    const servers = config.mcpServers || {}

    return Object.entries(servers).map(([name, config]: [string, any]) => ({
      name,
      command: config.command,
    }))
  } catch {
    return []
  }
}

/**
 * Build MCP servers section for prompts.
 */
export function buildMcpSection(): string {
  const servers = listMcpServers()
  if (servers.length === 0) return ''

  const lines: string[] = [
    '## Available MCP Servers',
    '',
    'The following MCP tools are available:',
    '',
  ]

  for (const server of servers) {
    lines.push(`- **${server.name}**: \`${server.command}\``)
  }

  return lines.join('\n')
}

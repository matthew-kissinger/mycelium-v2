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
**The system automatically notifies on task completion and failure.** You do NOT need to send a completion notification.
Use \`mycel notify\` only for mid-task progress updates or important findings:
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
(System sends completion notification automatically - no need to call mycel notify)

### If You're Blocked or Need Human Input
1. Send alignment question with full context
2. Continue with safe work if possible
3. If fully blocked, notify and exit cleanly

## Hub Environment Awareness

You are running on a shared automation hub. Be mindful of system resources:

### Reserved Ports
- **8765** - Mycelium orchestration server (NEVER use)
- **5765** - Mycelium frontend dev server
- **3000** - Often used by other services

### Rules for Dev Servers
1. **Don't start long-running servers** - If you need to test, use high ports (9000+) and kill when done
2. **No background processes** - Your task should not leave processes running after completion
3. **Clean up** - If you start something, stop it before exiting

### If You Need a Server for Testing
\`\`\`bash
# Use high port, run in foreground briefly, then kill
python3 -m http.server 9123 &
SERVER_PID=$!
# ... do your test ...
kill $SERVER_PID
\`\`\`

**Why this matters:** Other agents and the orchestration system share this machine. A server you leave running can block critical infrastructure.`
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

  // Codex (OpenAI)
  agents.codex = {
    command: 'codex',
    available: true,
    models: ['gpt-5.2-codex', 'gpt-5.2-codex-high', 'gpt-5.2-codex-fast'],
    defaultModel: 'gpt-5.2-codex',
    strengths: {
      'gpt-5.2-codex': 'Balanced code generation, most tasks',
      'gpt-5.2-codex-high': 'Higher quality, complex refactors',
      'gpt-5.2-codex-fast': 'Quick edits, low latency',
    },
  }

  // Gemini (Google)
  agents.gemini = {
    command: 'gemini',
    available: true,
    models: ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'flash'],
    defaultModel: 'flash',
    strengths: {
      'gemini-3-pro-preview': 'Deep research, complex analysis',
      'gemini-3-flash-preview': 'Fast iteration, most tasks',
      'flash': 'Alias for default flash model',
    },
  }

  // Cline (OpenRouter - model switched dynamically via cline auth)
  agents.cline = {
    command: 'cline',
    available: true,
    models: ['kimi-k2.5', 'deepseek-v3.2', 'qwen3-coder', 'glm-4.7', 'glm-4.7-flash', 'devstral'],
    defaultModel: 'kimi-k2.5',
    strengths: {
      'kimi-k2.5': 'Top open-source coder, strong reasoning, 262K context (Jan 2026, $0.45/$2.50)',
      'deepseek-v3.2': 'Near-GPT-5 quality at 1/50th cost, 164K context ($0.25/$0.38)',
      'qwen3-coder': '480B MoE optimized for agentic coding, 262K context ($0.22/$0.95)',
      'glm-4.7': 'Strong function-calling, 203K context ($0.40/$1.50)',
      'glm-4.7-flash': 'Fast GLM variant for simple tasks ($0.07/$0.40)',
      'devstral': 'Mistral coding model, ultra-cheap, 262K context ($0.05/$0.22)',
    },
  }

  // Cursor (supports --model flag)
  agents.cursor = {
    command: 'agent',
    available: true,
    models: ['composer-1', 'opus-4.5-thinking', 'sonnet-4.5', 'gpt-5.2-codex', 'gemini-3-flash'],
    defaultModel: 'composer-1',
    strengths: {
      'composer-1': 'Multi-file composition, large refactors (default)',
      'opus-4.5-thinking': 'Complex design, architecture, deep reasoning',
      'sonnet-4.5': 'Balanced feature work',
      'gpt-5.2-codex': 'Code generation, mechanical tasks',
      'gemini-3-flash': 'Fast iteration, simple features',
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

  lines.push('**Model selection guidance:**')
  lines.push('- Simple fixes, docs, single-file: claude/haiku, gemini/flash, cline/glm-4.7-flash, cline/devstral')
  lines.push('- Feature work, multi-file: claude/sonnet, codex/gpt-5.2-codex, cline/kimi-k2.5, cursor/composer-1')
  lines.push('- Architecture, complex reasoning: claude/opus, cursor/opus-4.5-thinking, gemini/gemini-3-pro-preview')
  lines.push('- Bulk mechanical work: codex/gpt-5.2-codex-fast, cursor/gpt-5.2-codex, cline/deepseek-v3.2')
  lines.push('- Cost-sensitive tasks: cline/deepseek-v3.2 ($0.25/$0.38), cline/devstral ($0.05/$0.22), cline/qwen3-coder ($0.22/$0.95)')
  lines.push('')
  lines.push('**Notes:**')
  lines.push('- Cline switches models dynamically via OpenRouter (specify any listed model)')
  lines.push('- Cursor supports per-task model selection via --model flag')
  lines.push('- Use at least 2-3 different agents across tasks for diversity')

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

import { getMcpServers } from '../config/inventory'

/**
 * List MCP servers from all agent configs.
 * Re-exports from inventory for backwards compatibility.
 */
export function listMcpServers(): Array<{ name: string; command: string }> {
  return getMcpServers().map(s => ({ name: s.name, command: s.command }))
}

/**
 * Build MCP servers section for prompts.
 * Uses lightweight listing (like v1) - just tells agents what's available.
 */
export function buildMcpSection(): string {
  const servers = getMcpServers()
  if (servers.length === 0) return ''

  const lines: string[] = [
    '## Available MCP Servers',
    '',
    'MCP tools are available (prefixed with `mcp__<server>__`):',
    '',
  ]

  for (const server of servers) {
    lines.push(`- **${server.name}**: \`${server.command}\``)
  }

  return lines.join('\n')
}

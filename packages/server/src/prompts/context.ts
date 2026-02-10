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
import { DEFAULT_AGENT_CONFIGS, AGENT_PROVIDERS, type AgentType, type ProviderType } from '@mycelium/shared'
import { getCachedEnabledAgents } from '../agents/registry-cache'

// =============================================================================
// MYCEL_CONTEXT - CLI instructions for agents
// =============================================================================

interface MycelContextOptions {
  agentId?: string
  model?: string
  taskId?: string
  taskTitle?: string
  role?: string  // e.g., "task_agent", "shepherd", "discovery"
  worktreePath?: string
  branchName?: string
}

/**
 * Build the MYCEL_CONTEXT instruction block for agent prompts.
 * This teaches agents how to communicate with humans via mycel CLI.
 */
export function buildMycelContext(options: MycelContextOptions = {}): string {
  const { agentId, model, taskId, taskTitle, role, worktreePath, branchName } = options

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

**For other SYSTEM agents (Discovery, Genesis, Digest, Compaction):**
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

**Why this matters:** Other agents and the orchestration system share this machine. A server you leave running can block critical infrastructure.

${buildStructuredOutputSection(role)}
${buildAgentSpecificInstructions(agentId)}${buildWorktreeContext(worktreePath, branchName)}`
}

/** System agent roles that have their own output formats (YAML, markers, etc.) */
const SYSTEM_AGENT_ROLES = new Set(['shepherd', 'discovery', 'digest', 'compaction', 'armory', 'genesis', 'max_alignment'])

/**
 * Build structured output section.
 * Task agents get XML <task_result> instructions.
 * System agents (shepherd, digest, compaction, etc.) have their own output
 * formats defined in their dedicated prompts - skip to avoid ambiguity.
 */
function buildStructuredOutputSection(role?: string): string {
  if (role && SYSTEM_AGENT_ROLES.has(role)) return ''

  return `## Structured Output (REQUIRED)

At the end of your work, output this XML block so the orchestration system can parse your results:

\`\`\`xml
<task_result status="success|partial|blocked">
  <summary>Brief description of what you did and why</summary>
  <files_changed>
    <file action="modified">src/foo.ts</file>
    <file action="created">src/bar.ts</file>
    <file action="deleted">src/old.ts</file>
  </files_changed>
  <tests>
    <passed>12</passed>
    <failed>0</failed>
    <skipped>1</skipped>
  </tests>
  <commits>
    <commit hash="abc1234">feat: add user model</commit>
    <commit hash="def5678">test: add user tests</commit>
  </commits>
</task_result>
\`\`\`

Field reference:
- status: "success" (completed), "partial" (some work done), "blocked" (could not proceed)
- summary: 1-3 sentences of what you accomplished
- files_changed: each file with action="modified"|"created"|"deleted"
- tests: only if you ran tests (omit section entirely if you didn't)
- commits: your commit messages with short hashes (omit if no commits)

You MUST output this XML block. The system parses it to track your work.`
}

/**
 * Build agent-specific instruction overrides.
 * These address known behavioral issues with specific agent CLIs.
 */
function buildAgentSpecificInstructions(agentId?: string): string {
  if (!agentId) return ''

  const sections: string[] = []

  if (agentId === 'kiro') {
    sections.push(`
## Kiro Git Safety (CRITICAL)

When committing changes:
- ONLY stage files YOU created or modified
- Use \`git add <specific-file>\` for each file
- NEVER use \`git add .\`, \`git add -A\`, or \`git add --all\`
- NEVER commit files you did not create or modify
- Always verify staged files with \`git status\` before committing`)
  }

  if (agentId === 'cursor') {
    sections.push(`
## Test Verification (REQUIRED)

If your task involves writing or running tests, you MUST actually execute them and include the test output. Do not report success without running tests.`)
  }

  return sections.join('')
}

/**
 * Build worktree awareness context when working in an isolated worktree.
 */
function buildWorktreeContext(worktreePath?: string, branchName?: string): string {
  if (!worktreePath || !branchName) return ''

  return `

## Workspace Isolation

You are working in a git worktree at \`${worktreePath}\` on branch \`${branchName}\`.
This is an isolated workspace - commit freely without worrying about other agents.
When done, commit your changes to this branch. The system will handle merging.`
}

// =============================================================================
// AGENTS_SECTION - Comprehensive agent/provider/model matrix
// =============================================================================

import { AGENT_MATRIX, type AgentCapabilities, getFreeModels } from '@mycelium/shared'

/**
 * Get available agents from the matrix.
 * Re-exported for backwards compatibility.
 */
export function getAvailableAgents(): Record<string, AgentCapabilities> {
  const result: Record<string, AgentCapabilities> = {}
  for (const agent of AGENT_MATRIX) {
    result[agent.agent] = agent
  }
  return result
}

// Keep old interface for backwards compat but mark deprecated
/** @deprecated Use AGENT_MATRIX from agent-matrix.ts instead */
interface AgentInfo {
  command: string
  available: boolean
  models: string[]
  defaultModel: string
  providers: ProviderType[]
  defaultProvider: ProviderType
  billing: 'subscription' | 'per_use' | 'free'
  strengths: Record<string, string>
  notes?: string
}

// Legacy AGENT_INFO - converted from AGENT_MATRIX for backwards compat
const AGENT_INFO: Record<AgentType, AgentInfo> = Object.fromEntries(
  AGENT_MATRIX.map(ac => [ac.agent, {
    command: ac.command,
    available: true,
    models: ac.providers.flatMap(p => p.models.map(m => m.short ?? m.id)),
    defaultModel: ac.providers[0]?.models[0]?.id ?? 'default',
    providers: ac.providers.map(p => p.provider),
    defaultProvider: ac.providers[0]?.provider ?? 'anthropic' as ProviderType,
    billing: ac.providers[0]?.billing ?? 'subscription',
    strengths: Object.fromEntries(
      ac.providers.flatMap(p => p.models.map(m => [m.short ?? m.id, m.strengths.join(', ')]))
    ),
    notes: ac.notes,
  }])
) as Record<AgentType, AgentInfo>

// Export for legacy code
const legacyAgentInfo = AGENT_INFO


/**
 * Credit and cost information for agents section.
 * This gets populated dynamically when building the section.
 */
export interface AgentCreditsInfo {
  openrouter?: {
    remaining: number
    limit: number
    freeModels: string[]
  }
  cline?: {
    balance: number
  }
  gemini?: {
    quotaStatus: 'available' | 'exceeded'
    quotaResetAt?: string
  }
  groq?: {
    available: boolean
    remainingRequests?: number
  }
  cerebras?: {
    available: boolean
    remainingRequestsDay?: number
    limitRequestsDay?: number
  }
  mistral?: {
    available: boolean
  }
}

// Cache for credits info (refreshed every 5 min)
let creditsCache: { info: AgentCreditsInfo; fetchedAt: number } | null = null

/**
 * Get current credits/quota info for all agents.
 */
export async function getAgentCreditsInfo(): Promise<AgentCreditsInfo> {
  // Return cached if fresh (5 min)
  if (creditsCache && Date.now() - creditsCache.fetchedAt < 300000) {
    return creditsCache.info
  }

  const info: AgentCreditsInfo = {}

  try {
    // OpenRouter credits and free models
    const { checkOpenRouterCredits, getOpenRouterFreeModels } = await import('../agents/health')
    const [orCredits, freeModels] = await Promise.all([
      checkOpenRouterCredits(),
      getOpenRouterFreeModels(),
    ])

    if (orCredits) {
      info.openrouter = {
        remaining: orCredits.remaining,
        limit: orCredits.limit,
        freeModels: freeModels.slice(0, 10), // Top 10 for prompt brevity
      }
    }

    // Cline account credits
    const { checkClineCredits } = await import('../agents/health')
    const clineCredits = await checkClineCredits()
    if (clineCredits) {
      info.cline = { balance: clineCredits.balance }
    }

    // Gemini quota status
    const { getHealthSummary } = await import('../agents/health')
    const health = getHealthSummary()
    const geminiHealth = Object.entries(health).find(([k]) => k.startsWith('gemini'))
    if (geminiHealth) {
      const [, h] = geminiHealth
      info.gemini = {
        quotaStatus: h.status === 'quota_exceeded' ? 'exceeded' : 'available',
        quotaResetAt: h.quotaResetAt,
      }
    }

    // Provider status (groq, cerebras, mistral)
    const { checkAllProviderStatus } = await import('../agents/health')
    const providers = await checkAllProviderStatus()

    if (providers.groq) {
      info.groq = {
        available: providers.groq.available,
        remainingRequests: providers.groq.remainingRequests,
      }
    }
    if (providers.cerebras) {
      info.cerebras = {
        available: providers.cerebras.available,
        remainingRequestsDay: providers.cerebras.remainingRequestsDay,
        limitRequestsDay: providers.cerebras.limitRequestsDay,
      }
    }
    if (providers.mistral) {
      info.mistral = {
        available: providers.mistral.available,
      }
    }
  } catch {
    // Ignore errors, return partial info
  }

  creditsCache = { info, fetchedAt: Date.now() }
  return info
}

/**
 * Task distribution by agent for injection into AGENTS_SECTION.
 */
export interface TaskDistribution {
  [agent: string]: { total: number; done: number; failed: number; pending: number; running: number }
}

/**
 * Build the AGENTS_SECTION for prompts.
 * Compact matrix of all valid agent/provider/model combinations.
 */
export function buildAgentsSection(creditsInfo?: AgentCreditsInfo, taskDistribution?: TaskDistribution): string {
  const lines: string[] = [
    '## Agent-Provider-Model Matrix',
    '',
  ]

  // Credits summary
  if (creditsInfo) {
    lines.push('### Credits & Provider Status')
    const parts: string[] = []
    if (creditsInfo.openrouter) {
      parts.push(`OpenRouter: $${creditsInfo.openrouter.remaining.toFixed(2)}/$${creditsInfo.openrouter.limit}`)
    }
    if (creditsInfo.gemini?.quotaStatus === 'exceeded') {
      parts.push(`Gemini: QUOTA EXCEEDED`)
    }
    if (creditsInfo.groq) {
      const status = creditsInfo.groq.available ? 'OK' : 'UNAVAILABLE'
      const reqs = creditsInfo.groq.remainingRequests != null ? ` (${creditsInfo.groq.remainingRequests} reqs left)` : ''
      parts.push(`Groq: ${status}${reqs}`)
    }
    if (creditsInfo.cerebras) {
      const status = creditsInfo.cerebras.available ? 'OK' : 'UNAVAILABLE'
      const reqs = creditsInfo.cerebras.remainingRequestsDay != null && creditsInfo.cerebras.limitRequestsDay != null
        ? ` (${creditsInfo.cerebras.remainingRequestsDay}/${creditsInfo.cerebras.limitRequestsDay} day)`
        : ''
      parts.push(`Cerebras: ${status}${reqs}`)
    }
    if (creditsInfo.mistral) {
      parts.push(`Mistral: ${creditsInfo.mistral.available ? 'OK' : 'UNAVAILABLE'}`)
    }
    parts.push('Subscription agents: Unlimited')
    lines.push(parts.join(' | '))
    lines.push('')
  }

  // Provider requirement explanation
  lines.push('### When to Use --provider')
  lines.push('')
  lines.push('**Single-provider agents** (NO --provider needed):')
  lines.push('- claude, codex, cursor, kiro, copilot, gemini, vibe, opencode')
  lines.push('')
  lines.push('**Multi-provider agents** (MUST specify --provider):')
  lines.push('- `cline`: --provider openrouter (default) or --provider cline')
  lines.push('- `pi`: --provider groq|cerebras|openrouter|mistral|google|anthropic|openai')
  lines.push('')

  // Get enabled agents from registry cache
  const enabledAgents = getCachedEnabledAgents()
  const enabledAgentIds = new Set(enabledAgents.map(a => a.id))

  // Compact matrix table
  lines.push('### Valid Combinations')
  lines.push('')
  lines.push('| Agent | Provider | Billing | Models (top 3) | Best For |')
  lines.push('|-------|----------|---------|----------------|----------|')

  for (const ac of AGENT_MATRIX) {
    // Skip disabled agents if registry is available
    if (enabledAgentIds.size > 0 && !enabledAgentIds.has(ac.agent)) continue
    for (const pm of ac.providers) {
      const topModels = pm.models.slice(0, 3).map(m => m.short ?? m.id).join(', ')
      const bestFor = pm.models[0]?.strengths.slice(0, 2).join(', ') ?? ''
      const billing = pm.billing === 'subscription' ? 'sub' : pm.billing === 'free' ? 'FREE' : '$/tok'
      lines.push(`| ${ac.agent} | ${pm.provider} | ${billing} | ${topModels} | ${bestFor} |`)
    }
  }
  lines.push('')

  // Free options (prioritize these)
  lines.push('### Free Options (Prefer These for Simple Tasks)')
  lines.push('')
  const freeModels = getFreeModels()
  const freeByAgent = new Map<string, string[]>()
  for (const fm of freeModels) {
    const key = `${fm.agent}/${fm.provider}`
    if (!freeByAgent.has(key)) freeByAgent.set(key, [])
    freeByAgent.get(key)!.push(fm.model.id)
  }
  for (const [key, models] of freeByAgent) {
    lines.push(`- **${key}**: ${models.slice(0, 4).join(', ')}${models.length > 4 ? '...' : ''}`)
  }
  lines.push('')

  // Task complexity guide
  lines.push('### Task-to-Agent Mapping')
  lines.push('')
  lines.push('| Task Type | Agent | Provider | Model | Why |')
  lines.push('|-----------|-------|----------|-------|-----|')
  lines.push('| Simple fix | pi | groq | kimi-k2-instruct | Free, ultra-fast |')
  lines.push('| Simple fix | pi | cerebras | gpt-oss-120b | Free, ultra-fast |')
  lines.push('| Simple fix | opencode | - | kimi-k2.5-free | Free, capable |')
  lines.push('| Docs/comments | claude | - | haiku | Sub, fast |')
  lines.push('| Feature | claude | - | sonnet | Sub, balanced |')
  lines.push('| Feature | cursor | - | opus-4.6-thinking | Sub, default, thinking |')
  lines.push('| Refactor | codex | - | gpt-5.3-codex | Sub, latest codex |')
  lines.push('| Complex | claude | - | opus | Sub, best reasoning |')
  lines.push('| Complex | cursor | - | opus-4.6-thinking | Sub, extended thinking |')
  lines.push('| Bulk/mechanical | cline | openrouter | deepseek-v3.2 | Cheap $0.25/$0.38 |')
  lines.push('| Research | copilot | - | claude-opus-4.6 | GitHub MCP built-in |')
  if (creditsInfo?.gemini?.quotaStatus !== 'exceeded') {
    lines.push('| Exploration | gemini | - | flash | Free quota |')
  }
  lines.push('')

  // Task creation format
  lines.push('### Task Creation Format')
  lines.push('')
  lines.push('```bash')
  lines.push('# Single-provider agents (NO --provider)')
  lines.push('mycel task create "title" --agent claude --model sonnet --repo /path')
  lines.push('mycel task create "title" --agent cursor --model opus-4.6-thinking --repo /path')
  lines.push('mycel task create "title" --agent opencode --model opencode/kimi-k2.5-free --repo /path')
  lines.push('mycel task create "title" --agent gemini --model flash --repo /path')
  lines.push('')
  lines.push('# Multi-provider agents (MUST include --provider)')
  lines.push('mycel task create "title" --agent cline --provider openrouter --model kimi-k2.5 --repo /path')
  lines.push('mycel task create "title" --agent pi --provider groq --model kimi-k2-instruct --repo /path')
  lines.push('mycel task create "title" --agent pi --provider cerebras --model gpt-oss-120b --repo /path')
  lines.push('```')
  lines.push('')

  // Pi provider quick ref
  lines.push('### Pi Provider Reference')
  lines.push('`pi` is a multi-provider agent. You MUST specify --provider:')
  lines.push('- **groq**: Free, ultra-fast (kimi-k2-instruct, llama-3.3-70b-versatile)')
  lines.push('- **cerebras**: Free, ultra-fast (gpt-oss-120b, qwen-3-235b, glm-4.7)')
  lines.push('- **openrouter**: 100+ models, some free (deepseek-v3.2, qwen3-coder)')
  lines.push('- **mistral**: Per-use (devstral-latest, mistral-large-latest)')
  lines.push('- **google**: Free quota (gemini-3-flash, gemini-3-pro)')
  lines.push('- **anthropic/openai**: Per-use direct API')
  lines.push('')

  // Usage distribution stats
  if (taskDistribution) {
    const totalTasks = Object.values(taskDistribution).reduce((s, d) => s + d.total, 0)
    if (totalTasks > 0) {
      lines.push('### Current Usage Distribution (REBALANCE NEEDED)')
      lines.push('')
      lines.push('| Agent | Tasks | % | Done | Failed | Success Rate |')
      lines.push('|-------|-------|---|------|--------|--------------|')

      // Sort by total descending
      const sorted = Object.entries(taskDistribution).sort(([, a], [, b]) => b.total - a.total)
      for (const [agent, d] of sorted) {
        const pct = ((d.total / totalTasks) * 100).toFixed(0)
        const successRate = d.done + d.failed > 0
          ? ((d.done / (d.done + d.failed)) * 100).toFixed(0) + '%'
          : 'N/A'
        lines.push(`| ${agent} | ${d.total} | ${pct}% | ${d.done} | ${d.failed} | ${successRate} |`)
      }
      lines.push('')
      lines.push('**Target:** Free 60%+ | Subscription 30% | Per-use 10%')
      lines.push('**Action:** Assign new tasks to underused agents to rebalance.')
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Build agents section with live credits info and usage distribution.
 * Use this for Discovery and other system agents that benefit from cost awareness.
 */
export async function buildAgentsSectionWithCredits(): Promise<string> {
  const [creditsInfo, taskDistribution] = await Promise.all([
    getAgentCreditsInfo(),
    import('../db/queries').then(q => q.getTaskDistributionByAgent()).catch(() => undefined),
  ])
  return buildAgentsSection(creditsInfo, taskDistribution)
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
const MAX_SKILLS_PER_TASK = 5
const MAX_CHARS_PER_SKILL = 8000

// Tech stack to skills mapping (dep name -> installed skill names)
const TECH_SKILL_MAPPING: Record<string, string[]> = {
  // Three.js ecosystem
  'three': ['threejs-fundamentals', 'threejs-performance'],
  '@types/three': ['threejs-fundamentals'],
  'three-mesh-bvh': ['three-mesh-bvh', 'threejs-bvh-skill'],
  'postprocessing': ['pmndrs-postprocessing', 'threejs-postprocessing'],

  // Game engines/libs
  'bitecs': ['bitecs-skill'],
  'rapier3d': ['rapier3d-physics'],
  'yuka': ['yuka-game-ai'],

  // React ecosystem
  'react': ['react-best-practices', 'react-performance'],
  'react-dom': ['react-best-practices'],
  '@xyflow/react': ['reactflow-node-graphs'],
  'reactflow': ['reactflow-node-graphs'],
  'zustand': ['zustand'],

  // Testing
  'vitest': ['vitest'],
  'playwright': ['webapp-testing'],
  '@playwright/test': ['webapp-testing'],
  'msw': ['msw-testing'],

  // Build tools
  'vite': ['vite-optimization'],
  'tailwindcss': ['ui-design-system'],
  'eslint': ['eslint-typescript'],
  '@typescript-eslint/parser': ['eslint-typescript'],

  // Backend
  'hono': ['hono-framework'],
  'drizzle-orm': ['drizzle-orm'],
  'zod': ['zod-validation'],
  'fastapi': ['fastapi'],
  'aiosqlite': ['python-async-skill'],

  // AI/Media
  '@google/generative-ai': ['google-generative-ai'],
  'sharp': ['nodejs-image-processing'],

  // Other
  'xstate': ['xstate-skill'],
  'tweakpane': ['tweakpane-skill'],
}

// Task keyword to skill mapping (for selectTaskSkills)
const TASK_SKILL_KEYWORDS: Record<string, string[]> = {
  'collision': ['threejs-collision', 'threejs-bvh-skill'],
  'shader': ['threejs-shaders', 'webgpu-threejs-tsl'],
  'material': ['threejs-materials'],
  'light': ['threejs-lighting'],
  'animation': ['threejs-animation'],
  'particle': ['threejs-particles-skill'],
  'audio': ['threejs-audio-skill'],
  'camera': ['game-camera-systems'],
  'physics': ['rapier3d-physics'],
  'pathfinding': ['game-ai-pathfinding', 'yuka-game-ai'],
  'AI': ['game-ai-pathfinding', 'yuka-game-ai'],
  'state machine': ['game-state-management', 'xstate-skill'],
  'test': ['vitest', 'game-testing-patterns'],
  'geometry': ['threejs-geometry'],
  'texture': ['threejs-textures'],
  'postprocess': ['pmndrs-postprocessing', 'threejs-postprocessing'],
  'performance': ['threejs-performance', 'performance-benchmarking'],
  'loader': ['threejs-loaders'],
  'interaction': ['threejs-interaction'],
  'ECS': ['bitecs-skill'],
  'LOD': ['threejs-performance'],
  'instanc': ['threejs-performance', 'threejs-geometry'],
  'worker': ['web-workers'],
  'SSE': ['sse-streaming'],
  'react': ['react-best-practices'],
  'component': ['composition-patterns', 'react-best-practices'],
  'database': ['drizzle-orm'],
  'API': ['hono-framework'],
  'validation': ['zod-validation'],
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
 * Auto-detect ALL matching skills for a repo (no limit).
 * Used for storing the full skill list in repos.skills column.
 */
export function detectAllSkillsForRepo(repoPath: string): string[] {
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

    return Array.from(detectedSkills)
  } catch {
    return []
  }
}

/**
 * Select the most relevant skills for a specific task based on keywords.
 * Only returns skills that are in the repo's skill list (intersection).
 * Falls back to first N from repoSkills if no keyword matches.
 */
export function selectTaskSkills(
  repoSkills: string[],
  taskTitle: string,
  taskPrompt?: string,
  maxSkills = 3,
): string[] {
  if (repoSkills.length === 0) return []

  const text = `${taskTitle} ${taskPrompt ?? ''}`.toLowerCase()
  const matched = new Set<string>()

  for (const [keyword, skills] of Object.entries(TASK_SKILL_KEYWORDS)) {
    if (text.includes(keyword.toLowerCase())) {
      for (const skill of skills) {
        if (repoSkills.includes(skill)) {
          matched.add(skill)
        }
      }
    }
  }

  if (matched.size > 0) {
    return Array.from(matched).slice(0, maxSkills)
  }

  // Fallback: first N from repo skills
  return repoSkills.slice(0, maxSkills)
}

/**
 * Build a skills list section for discovery prompts.
 * Shows available skills for a repo so discovery can add --skills to tasks.
 */
export function buildRepoSkillsList(repoPath: string, repoSkills?: string[]): string {
  const skills = repoSkills ?? detectAllSkillsForRepo(repoPath)
  if (skills.length === 0) return ''

  const lines: string[] = [
    '## Available Skills for This Repo',
    '',
    'When creating tasks, add `--skills skill1,skill2` with 1-3 relevant skills from this list:',
    '',
  ]

  for (const skill of skills) {
    lines.push(`- ${skill}`)
  }

  lines.push('')
  lines.push('Only add --skills when specific domain knowledge would help the task.')

  return lines.join('\n')
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

import { getMcpServers, getMcpServersForAgent } from '../config/inventory'

/**
 * List MCP servers from all agent configs.
 * Re-exports from inventory for backwards compatibility.
 */
export function listMcpServers(): Array<{ name: string; command: string }> {
  return getMcpServers().map(s => ({ name: s.name, command: s.command }))
}

/**
 * Build MCP servers section for prompts.
 * When agent is specified, only shows MCPs configured for that specific agent.
 * Falls back to all MCPs when no agent specified (e.g. inventory display).
 */
export function buildMcpSection(agent?: string): string {
  const servers = agent ? getMcpServersForAgent(agent) : getMcpServers()
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

// =============================================================================
// MEMORY - Patterns and warnings from network memory
// =============================================================================

const MAX_MEMORY_SECTION_CHARS = 2048

/**
 * Build memory section with patterns and warnings for a repo.
 * Includes both repo-specific and global memory items.
 * Returns empty string if no memory exists.
 */
export async function buildMemorySection(repoPath: string): Promise<string> {
  const queries = await import('../db/queries')

  const [repoPatterns, globalPatterns, repoWarnings, globalWarnings] = await Promise.all([
    queries.getPatterns({ repo_path: repoPath, limit: 10 }),
    queries.getGlobalPatterns(5),
    queries.getWarnings({ repo_path: repoPath, limit: 10 }),
    queries.getGlobalWarnings(5),
  ])

  // Dedup global items that might overlap with repo items
  const patternIds = new Set(repoPatterns.map(p => p.id))
  const uniqueGlobalPatterns = globalPatterns.filter(p => !patternIds.has(p.id))
  const warningIds = new Set(repoWarnings.map(w => w.id))
  const uniqueGlobalWarnings = globalWarnings.filter(w => !warningIds.has(w.id))

  const allPatterns = [...repoPatterns, ...uniqueGlobalPatterns]
  const allWarnings = [...repoWarnings, ...uniqueGlobalWarnings]

  if (allPatterns.length === 0 && allWarnings.length === 0) return ''

  const lines: string[] = ['## Network Memory', '']

  let currentSize = lines.join('\n').length

  if (allPatterns.length > 0) {
    lines.push('### Patterns')
    for (const p of allPatterns) {
      const tags = JSON.parse(p.tags ?? '[]') as string[]
      const tagSuffix = tags.length > 0 ? ` [tags: ${tags.join(', ')}]` : ''
      const line = `- ${p.content}${tagSuffix}`
      if (currentSize + line.length + 1 > MAX_MEMORY_SECTION_CHARS) break
      lines.push(line)
      currentSize += line.length + 1
    }
    lines.push('')
  }

  if (allWarnings.length > 0) {
    lines.push('### Warnings')
    for (const w of allWarnings) {
      const line = `- [${w.severity}] ${w.content}`
      if (currentSize + line.length + 1 > MAX_MEMORY_SECTION_CHARS) break
      lines.push(line)
      currentSize += line.length + 1
    }
    lines.push('')
  }

  return lines.join('\n')
}

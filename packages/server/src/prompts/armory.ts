/**
 * Armory Agent Prompts
 *
 * Analyzes completed tasks to identify tooling gaps and installs
 * missing skills/MCP servers. Outputs structured XML manifest.
 *
 * Template variables:
 * - {MYCEL_CONTEXT}: Injected mycel CLI context instructions
 * - {inventory}: Current skills + MCP server inventory
 * - {tasks_analyzed}: Number of tasks to analyze
 */

// Main Armory Agent prompt template
export const ARMORY_AGENT_PROMPT = `You are the Armory Agent for Mycelium, an AI agent orchestration network.

Your role: Ensure task agents have the domain knowledge (skills) and tools (MCP servers) they need to succeed. You analyze recent completed tasks, identify gaps in the current tooling inventory, and install what's missing.

{MYCEL_CONTEXT}

{inventory}

## Your Mission

1. **Analyze Recent Work**
   Run: \`mycel tasks --status completed --limit {tasks_analyzed}\`
   Look at:
   - What repos were worked on and their tech stacks
   - What technologies and frameworks are being used
   - Patterns in failures or struggles that suggest missing tools
   - Tasks where agents had to work around missing capabilities

2. **Identify Gaps**
   Compare what tasks needed vs what's in the inventory.
   Examples:
   - "Tasks on Three.js repos but no threejs-performance skill"
   - "Browser testing needed but no playwright MCP"
   - "Python async work but no python-async skill"
   - "Database migrations needed but no drizzle skill"

3. **Acquire Skills**
   For each gap, either:
   a. Search GitHub for existing skill repos (e.g., "threejs claude skill SKILL.md")
   b. WebFetch documentation and create a SKILL.md yourself

   To install a skill:
   \`\`\`bash
   # Clone existing
   git clone <repo> ~/.claude/skills/<skill-name>

   # Or create new
   mkdir -p ~/.claude/skills/<skill-name>
   cat > ~/.claude/skills/<skill-name>/SKILL.md << 'EOF'
   ---
   description: "Brief description"
   ---
   # Skill Name

   Content here...
   EOF
   \`\`\`

4. **Install MCP Servers**
   Common helpful MCPs:
   - playwright: Browser automation
   - sqlite: Database queries
   - filesystem: Extended file ops

   To install:
   \`\`\`bash
   claude mcp add <server-name> -- <command>
   \`\`\`

5. **Loop Until Satisfied**
   Keep going until you've addressed the gaps you identified.
   Don't over-acquire - only add what's clearly needed.

## Guidelines

- **Don't duplicate**: Check inventory before adding
- **Quality over quantity**: A few good skills > many mediocre ones
- **Be specific**: Skills should have clear descriptions
- **Test installs**: Verify skills load with \`ls ~/.claude/skills/\`
- **Document reasoning**: Explain why each addition helps

## Output Format

When done, output your results in this XML format (no backtick fencing):

<armory_result health="healthy|warning|critical">
  <headline>Brief summary of what was done</headline>
  <analysis>
    <tasks_analyzed count="{tasks_analyzed}"/>
    <gaps_identified count="N"/>
  </analysis>
  <skills_added>
    <skill name="skill-name" source="github.com/user/repo">Why this skill was needed</skill>
  </skills_added>
  <mcps_installed>
    <mcp name="mcp-name" command="npx @modelcontextprotocol/server-x">Why this MCP was needed</mcp>
  </mcps_installed>
  <gaps_remaining>
    <gap>Unfilled gap description and why it couldn't be filled</gap>
  </gaps_remaining>
  <inventory_summary>
    <skills total="N" added="N"/>
    <mcps total="N" added="N"/>
  </inventory_summary>
  <patterns tags="tag1,tag2">Tooling pattern observed across tasks</patterns>
  <warnings severity="high|medium|low">Tooling concern or risk</warnings>
</armory_result>

You MUST output the <armory_result> XML block. The system parses it to track inventory changes and broadcast tooling health.

Notes:
- health="healthy" if all gaps filled, "warning" if some remain, "critical" if many unfilled gaps
- Include empty sections if nothing to report (e.g., no skills added)
- Source can be "github.com/..." for cloned or "self-authored" for created
- Patterns and warnings help the network learn about recurring tooling needs

Start by analyzing recent tasks.
`

// Types for context injection
export interface ArmorySkill {
  name: string
  description: string
}

export interface ArmoryMcpServer {
  name: string
  command: string
}

export interface ArmoryContext {
  tasksAnalyzed: number
  existingSkills: ArmorySkill[]
  existingMcpServers: ArmoryMcpServer[]
}

/**
 * Format inventory section for prompt injection
 */
function formatInventory(skills: ArmorySkill[], mcpServers: ArmoryMcpServer[]): string {
  const parts: string[] = []

  parts.push('## Current Inventory')
  parts.push('')
  parts.push('### Installed Skills')
  if (skills.length > 0) {
    for (const skill of skills) {
      parts.push(`- **${skill.name}**: ${skill.description}`)
    }
  } else {
    parts.push('(none)')
  }
  parts.push('')

  parts.push('### Installed MCP Servers')
  if (mcpServers.length > 0) {
    for (const mcp of mcpServers) {
      parts.push(`- **${mcp.name}**: \`${mcp.command}\``)
    }
  } else {
    parts.push('(none)')
  }
  parts.push('')

  return parts.join('\n')
}

/**
 * Build the complete Armory Agent prompt with context injected
 */
export function buildArmoryPrompt(context: ArmoryContext, mycelContext?: string): string {
  const inventory = formatInventory(context.existingSkills, context.existingMcpServers)

  return ARMORY_AGENT_PROMPT
    .replace('{inventory}', inventory)
    .replace(/\{tasks_analyzed\}/g, String(context.tasksAnalyzed))
    .replace(/{MYCEL_CONTEXT}/g, mycelContext ?? '')
}

// =============================================================================
// Output Parsing
// =============================================================================

export interface ArmorySkillAdded {
  name: string
  source: string
  reason: string
}

export interface ArmoryMcpInstalled {
  name: string
  command: string
  reason: string
}

export interface ArmoryOutput {
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  tasks_analyzed: number
  gaps_identified: number
  skills_added: ArmorySkillAdded[]
  mcps_installed: ArmoryMcpInstalled[]
  gaps_remaining: string[]
  inventory_summary?: {
    skills_total: number
    skills_added: number
    mcps_total: number
    mcps_added: number
  }
  patterns?: Array<{ content: string; tags?: string[] }>
  warnings?: Array<{ content: string; severity?: string }>
}

/**
 * Parse Armory agent XML output.
 */
export function parseArmoryOutput(output: string): ArmoryOutput | null {
  const blockMatch = output.match(
    /<armory_result\s+health="(healthy|warning|critical)">([\s\S]*?)<\/armory_result>/
  )
  if (!blockMatch) return null

  const health = blockMatch[1] as ArmoryOutput['health']
  const body = blockMatch[2]

  const result: ArmoryOutput = {
    health,
    headline: '',
    tasks_analyzed: 0,
    gaps_identified: 0,
    skills_added: [],
    mcps_installed: [],
    gaps_remaining: [],
  }

  // Headline
  const headlineMatch = body.match(/<headline>([\s\S]*?)<\/headline>/)
  if (headlineMatch) result.headline = headlineMatch[1].trim()

  // Analysis
  const analysisBlock = body.match(/<analysis>([\s\S]*?)<\/analysis>/)
  if (analysisBlock) {
    const ab = analysisBlock[1]
    const tasksMatch = ab.match(/<tasks_analyzed\s+count="(\d+)"/)
    if (tasksMatch) result.tasks_analyzed = +tasksMatch[1]
    const gapsMatch = ab.match(/<gaps_identified\s+count="(\d+)"/)
    if (gapsMatch) result.gaps_identified = +gapsMatch[1]
  }

  // Skills added
  const skillsBlock = body.match(/<skills_added>([\s\S]*?)<\/skills_added>/)
  if (skillsBlock) {
    const skillRegex = /<skill\s+([^>]*)>([\s\S]*?)<\/skill>/g
    let m
    while ((m = skillRegex.exec(skillsBlock[1])) !== null) {
      const attrs = m[1]
      const name = attrs.match(/name="([^"]*)"/)
      const source = attrs.match(/source="([^"]*)"/)
      if (name) {
        result.skills_added.push({
          name: name[1],
          source: source?.[1] || 'unknown',
          reason: m[2].trim(),
        })
      }
    }
  }

  // MCPs installed
  const mcpsBlock = body.match(/<mcps_installed>([\s\S]*?)<\/mcps_installed>/)
  if (mcpsBlock) {
    const mcpRegex = /<mcp\s+([^>]*)>([\s\S]*?)<\/mcp>/g
    let m
    while ((m = mcpRegex.exec(mcpsBlock[1])) !== null) {
      const attrs = m[1]
      const name = attrs.match(/name="([^"]*)"/)
      const command = attrs.match(/command="([^"]*)"/)
      if (name) {
        result.mcps_installed.push({
          name: name[1],
          command: command?.[1] || '',
          reason: m[2].trim(),
        })
      }
    }
  }

  // Gaps remaining
  const gapsBlock = body.match(/<gaps_remaining>([\s\S]*?)<\/gaps_remaining>/)
  if (gapsBlock) {
    const gapRegex = /<gap>([\s\S]*?)<\/gap>/g
    let m
    while ((m = gapRegex.exec(gapsBlock[1])) !== null) {
      result.gaps_remaining.push(m[1].trim())
    }
  }

  // Inventory summary
  const invBlock = body.match(/<inventory_summary>([\s\S]*?)<\/inventory_summary>/)
  if (invBlock) {
    const ib = invBlock[1]
    const skillsSum = ib.match(/<skills\s+total="(\d+)"\s+added="(\d+)"/)
    const mcpsSum = ib.match(/<mcps\s+total="(\d+)"\s+added="(\d+)"/)
    result.inventory_summary = {
      skills_total: skillsSum ? +skillsSum[1] : 0,
      skills_added: skillsSum ? +skillsSum[2] : 0,
      mcps_total: mcpsSum ? +mcpsSum[1] : 0,
      mcps_added: mcpsSum ? +mcpsSum[2] : 0,
    }
  }

  // Patterns
  const patternsRegex = /<patterns(?:\s+tags="([^"]*)")?\s*>([\s\S]*?)<\/patterns>/g
  const patterns: Array<{ content: string; tags?: string[] }> = []
  let pm
  while ((pm = patternsRegex.exec(body)) !== null) {
    patterns.push({
      content: pm[2].trim(),
      tags: pm[1] ? pm[1].split(',').map(t => t.trim()) : undefined,
    })
  }
  if (patterns.length > 0) result.patterns = patterns

  // Warnings
  const warningsRegex = /<warnings(?:\s+severity="([^"]*)")?\s*>([\s\S]*?)<\/warnings>/g
  const warnings: Array<{ content: string; severity?: string }> = []
  let wm
  while ((wm = warningsRegex.exec(body)) !== null) {
    warnings.push({
      content: wm[2].trim(),
      severity: wm[1] || undefined,
    })
  }
  if (warnings.length > 0) result.warnings = warnings

  if (!result.headline) return null

  return result
}

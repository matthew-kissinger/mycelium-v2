/**
 * Armory Agent Prompt - ported from v1 armory.py
 * DO NOT MODIFY - keep exact wording from v1
 */

// Inventory format template
export const INVENTORY_FORMAT = `## Current Inventory

### Installed Skills
{skills_section}

### Installed MCP Servers
{mcps_section}
`

// YAML output schema expected from the agent
export const ARMORY_OUTPUT_SCHEMA = `armory_update:
  timestamp: "2026-01-25T12:00:00Z"
  tasks_analyzed: {tasks_analyzed}
  skills_added:
    - name: skill-name
      source: github.com/user/repo OR "self-authored"
      reason: "Why this was needed"
  mcps_installed:
    - name: mcp-name
      command: "command used"
      reason: "Why this was needed"
  gaps_remaining:
    - "Any gaps you couldn't fill"`

// Main Armory Agent prompt template
export const ARMORY_AGENT_PROMPT = `# Armory Agent

You are the Armory Agent for the Mycelium network. Your job is to ensure task agents have the domain knowledge (skills) and tools (MCP servers) they need to succeed.

{inventory}

## Your Mission

1. **Analyze Recent Work**
   Run: \`mycel tasks --status completed --limit {tasks_analyzed}\`
   Look at:
   - What repos were worked on
   - What technologies are being used
   - Any patterns in failures or struggles

2. **Identify Gaps**
   Compare what tasks needed vs what's in the inventory.
   Examples:
   - "Tasks on Three.js repos but no threejs-performance skill"
   - "Browser testing needed but no playwright MCP"
   - "Python async work but no python-async skill"

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

## Output

When done, output a YAML manifest:

\`\`\`yaml
armory_update:
  timestamp: "2026-01-25T12:00:00Z"
  tasks_analyzed: {tasks_analyzed}
  skills_added:
    - name: skill-name
      source: github.com/user/repo OR "self-authored"
      reason: "Why this was needed"
  mcps_installed:
    - name: mcp-name
      command: "command used"
      reason: "Why this was needed"
  gaps_remaining:
    - "Any gaps you couldn't fill"
\`\`\`

## Guidelines

- **Don't duplicate**: Check inventory before adding
- **Quality over quantity**: A few good skills > many mediocre ones
- **Be specific**: Skills should have clear descriptions
- **Test installs**: Verify skills load with \`ls ~/.claude/skills/\`
- **Document reasoning**: Explain why each addition helps

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
export function buildArmoryPrompt(context: ArmoryContext): string {
  const inventory = formatInventory(context.existingSkills, context.existingMcpServers)

  return ARMORY_AGENT_PROMPT
    .replace('{inventory}', inventory)
    .replace(/\{tasks_analyzed\}/g, String(context.tasksAnalyzed))
}

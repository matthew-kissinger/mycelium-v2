/**
 * Genesis Agent Prompt - ported from v1 genesis.py
 * DO NOT MODIFY - keep exact wording from v1
 */

/**
 * Main Genesis Agent prompt for manual mode.
 * Creates new repos from human requests.
 */
export const GENESIS_AGENT_PROMPT = `You are the Genesis Agent for Mycelium, an agent orchestration system.

Your job: Create a new repository from scratch based on a human request.

## Your Role

You create new projects with full "agent plumbing" - everything needed for AI agents to work on them effectively:
- Clear documentation (README, CLAUDE.md)
- Proper project structure
- Git and GitHub setup
- Added to the mycelium network

{MYCEL_CONTEXT}

## Genesis-Specific Tools

\`\`\`bash
# Create GitHub repo (use gh CLI)
gh repo create <name> --public --clone  # or --private

# Add to network after creation
mycel repos add <path> --description "description"
\`\`\`

**Notify human** when done: \`mycel notify "[GENESIS] Created: repo-name"\`

## Process

1. **Parse the request** - What does the human want to build?
2. **Choose a name** - Short, kebab-case, descriptive
3. **Create GitHub repo** - Use \`gh repo create <name> --{visibility} --clone\`
4. **Create scaffold files**:
   - README.md - Project description, setup, usage
   - CLAUDE.md - Agent instructions, conventions, stack
   - .gitignore - Appropriate for language
   - Basic project structure for the language
5. **Initial commit** - "Initial scaffold"
6. **Push to GitHub** - \`git push -u origin main\`
7. **Add to network** - \`mycel repos add <path> --description "..."\`
8. **Notify** - Tell human what was created

## Scaffold Templates

### CLAUDE.md Template
\`\`\`markdown
# Project Name

Brief description of what this project does.

## Stack

| Layer | Technology |
|-------|------------|
| Language | Python/TypeScript/etc |
| ... | ... |

## Conventions

- No emojis unless requested
- Conventional commits
- Test before commit

## Quick Start

\`\`\`bash
# Setup commands
\`\`\`

## Architecture

Brief description of how things are organized.
\`\`\`

### README.md Template
\`\`\`markdown
# Project Name

One-line description.

## Features

- Feature 1
- Feature 2

## Installation

\`\`\`bash
# Install commands
\`\`\`

## Usage

\`\`\`bash
# Usage examples
\`\`\`

## Development

\`\`\`bash
# Dev setup
\`\`\`

## License

MIT (or as specified)
\`\`\`

## Input

You will receive:
- Human's request (what to build)
- Visibility preference (public/private)
- Language hint (if provided)
- Repos directory path

## Guidelines

- Choose sensible defaults
- Keep scaffolds minimal but complete
- Use modern tooling (uv for Python, bun for JS/TS)
- Include .gitignore appropriate for language
- CLAUDE.md is for agents, README.md is for humans

## Output

After completing all steps, output:

\`\`\`yaml
genesis_result:
  name: repo-name
  path: /full/path/to/repo
  github_url: https://github.com/user/repo-name
  visibility: public
  language: python
  files_created:
    - README.md
    - CLAUDE.md
    - .gitignore
    - pyproject.toml
\`\`\`

Then output:
<genesis_complete>true</genesis_complete>
`

/**
 * Auto Genesis prompt for network analysis mode.
 * Proposes new repos based on current network state.
 */
export const AUTO_GENESIS_PROMPT = `You are the Genesis Agent in AUTO mode for Mycelium, an agent orchestration system.

Your job: Analyze the current network of projects and propose new repos that would be valuable additions.

## Current Network

You'll receive:
- List of existing repos with descriptions and languages
- Recent memory patterns (what's working, what's failing)
- Network health data

## Your Task

Based on the existing network, identify:
1. **Gaps** - Tools or projects that would complement the existing repos
2. **Opportunities** - New ideas inspired by patterns in the network
3. **Infrastructure** - Shared utilities that multiple repos could use

## Guidelines

- Propose repos that ADD VALUE to the network
- Don't duplicate existing functionality
- Consider the human's apparent interests (game dev, CLI tools, automation)
- Keep proposals focused and achievable
- Prefer smaller, well-scoped projects over ambitious ones
- NEVER use \`--wait\`. You are a system agent - send proposal and exit. Daemon handles continuation.

## Output Format

If you identify a good candidate for a new repo, output:

\`\`\`yaml
genesis_proposal:
  name: suggested-repo-name
  description: One-line description
  rationale: Why this would be valuable (2-3 sentences)
  language: python/typescript/etc
  visibility: public/private
  priority: high/medium/low
\`\`\`

Then either:

### If auto_create=True
Create the repo using the same process as manual Genesis:
1. \`gh repo create <name> --{visibility} --clone\`
2. Create scaffold files
3. Commit and push
4. \`mycel repos add <path> --description "..."\`
5. \`mycel notify "[GENESIS] Created: name - description"\`

Output: \`<genesis_complete>true</genesis_complete>\`

### If auto_create=False
Send an alignment signal asking for approval:
\`\`\`bash
mycel align "Genesis proposes: {name} - {description}. {rationale}. Reply 'create', 'skip', or suggest modifications."
\`\`\`

Output: \`<genesis_proposal_sent>true</genesis_proposal_sent>\`

If you find NO good candidates, explain why and output:
\`<genesis_no_proposals>true</genesis_no_proposals>\`
`

/**
 * Genesis continuation prompt for handling human responses to proposals.
 */
export const GENESIS_CONTINUATION_PROMPT = `You are the Genesis Agent continuing after human feedback.

## Context

The human was asked about a repo proposal and has now replied.

**Original Proposal:**
{original_proposal}

**Human's Response:**
{human_response}

## Your Task

Based on the human's response, take the appropriate action:

1. If they want to CREATE the repo - use \`gh repo create\` and full scaffold process
2. If they want to SKIP - just acknowledge and exit
3. If they want MODIFICATIONS - incorporate their feedback and create with changes
4. If unclear - ask for clarification via \`mycel align\`

## Tools

\`\`\`bash
# Create repo
gh repo create <name> --public --clone

# Notify human
mycel notify "[GENESIS] message"

# Ask for clarification (if needed)
mycel align "[GENESIS] clarification question"
\`\`\`

After completing, output:
<genesis_continuation_complete>true</genesis_continuation_complete>
`

// Output markers for parsing
export const GENESIS_MARKERS = {
  complete: '<genesis_complete>true</genesis_complete>',
  proposalSent: '<genesis_proposal_sent>true</genesis_proposal_sent>',
  noProposals: '<genesis_no_proposals>true</genesis_no_proposals>',
  continuationComplete: '<genesis_continuation_complete>true</genesis_continuation_complete>',
} as const

// Types for context building
export interface GenesisContext {
  description: string
  language?: string
  isPrivate: boolean
  reposDir: string
}

export interface AutoGenesisContext {
  networkRepos: Array<{
    name: string
    description?: string
    language?: string
    mode: 'auto' | 'align'
  }>
  memoryPatterns?: string[]
  memoryWarnings?: string[]
  shepherdEvaluations?: Array<{
    repoName: string
    health: string
    headline?: string
    concerns?: string[]
    patterns?: string[]
    warnings?: string[]
  }>
  autoCreate: boolean
  reposDir: string
  defaultVisibility: 'public' | 'private'
  defaultLanguage?: string
}

export interface ContinuationContext {
  originalProposal: string
  humanResponse: string
}

/**
 * Build the full Genesis prompt with context injected.
 * Replaces {MYCEL_CONTEXT} placeholder.
 */
export function buildGenesisPrompt(
  mycelContext: string,
  context: GenesisContext
): string {
  const visibility = context.isPrivate ? 'private' : 'public'

  const contextSection = `## Human Request
${context.description}

## Configuration
- Visibility: ${visibility}
- Language hint: ${context.language || 'auto-detect from request'}
- Repos directory: ${context.reposDir}

---

Create the repository now. Use gh CLI to create on GitHub, scaffold files, commit, push, and add to network.
`

  const prompt = GENESIS_AGENT_PROMPT.replace('{MYCEL_CONTEXT}', mycelContext)
  return `${prompt}\n\n${contextSection}`
}

/**
 * Build the Auto Genesis prompt with network context.
 */
export function buildAutoGenesisPrompt(context: AutoGenesisContext): string {
  // Format network repos
  const repoLines = context.networkRepos.length > 0
    ? context.networkRepos.map(r =>
        `- ${r.name} [${r.language || '?'}] (${r.mode}): ${r.description || 'No description'}`
      ).join('\n')
    : 'No repos in network yet.'

  // Format memory patterns
  let memorySection = ''
  if (context.memoryPatterns && context.memoryPatterns.length > 0) {
    memorySection += '\nPatterns:\n'
    memorySection += context.memoryPatterns.slice(-10).map(p => `  - ${p.slice(0, 80)}`).join('\n')
  }
  if (context.memoryWarnings && context.memoryWarnings.length > 0) {
    memorySection += '\n\nWarnings:\n'
    memorySection += context.memoryWarnings.slice(-5).map(w => `  - ${w.slice(0, 80)}`).join('\n')
  }

  // Format shepherd evaluations
  let shepherdSection = ''
  if (context.shepherdEvaluations && context.shepherdEvaluations.length > 0) {
    shepherdSection = '\n## Recent Shepherd Evaluations\n\nLearn from recent task evaluations across the network:\n\n'
    for (const ev of context.shepherdEvaluations.slice(0, 5)) {
      shepherdSection += `### ${ev.repoName} - Health: ${ev.health}\n`
      if (ev.headline) shepherdSection += `- ${ev.headline}\n`
      if (ev.concerns && ev.concerns.length > 0) {
        shepherdSection += `- **Concerns**: ${ev.concerns.slice(0, 3).join('; ')}\n`
      }
      if (ev.patterns && ev.patterns.length > 0) {
        shepherdSection += `- **Patterns**: ${ev.patterns.slice(0, 3).join('; ')}\n`
      }
      if (ev.warnings && ev.warnings.length > 0) {
        shepherdSection += `- **Warnings**: ${ev.warnings.slice(0, 3).join('; ')}\n`
      }
      shepherdSection += '\n'
    }
  }

  const contextSection = `## Network Analysis

Current network repos:

${repoLines}

## Memory Context

${memorySection || 'No memory patterns yet.'}

${shepherdSection}

## Configuration

- auto_create: ${context.autoCreate}
- repos_dir: ${context.reposDir}
- default_visibility: ${context.defaultVisibility}
- default_language: ${context.defaultLanguage || 'auto'}

---

Analyze the network and either propose a new repo or explain why none are needed right now.
`

  return `${AUTO_GENESIS_PROMPT}\n\n${contextSection}`
}

/**
 * Build the continuation prompt with context.
 */
export function buildContinuationPrompt(context: ContinuationContext): string {
  return GENESIS_CONTINUATION_PROMPT
    .replace('{original_proposal}', context.originalProposal)
    .replace('{human_response}', context.humanResponse)
}

/**
 * Check if output contains a Genesis completion marker.
 */
export function parseGenesisResult(output: string): {
  type: 'complete' | 'proposal_sent' | 'no_proposals' | 'continuation_complete' | 'unknown'
  yamlResult?: Record<string, unknown>
} {
  if (output.includes(GENESIS_MARKERS.complete)) {
    // Try to extract YAML result
    let yamlResult: Record<string, unknown> | undefined
    const yamlMatch = output.match(/```yaml\s*([\s\S]*?)\s*```/)
    if (yamlMatch) {
      try {
        // Simple YAML parsing for genesis_result
        const yamlStr = yamlMatch[1]
        if (yamlStr.includes('genesis_result:')) {
          // Basic extraction - proper YAML parsing would need a library
          const lines = yamlStr.split('\n')
          const result: Record<string, unknown> = {}
          let inResult = false
          let inFiles = false
          const files: string[] = []

          for (const line of lines) {
            if (line.includes('genesis_result:')) {
              inResult = true
              continue
            }
            if (!inResult) continue

            const match = line.match(/^\s+(\w+):\s*(.*)$/)
            if (match) {
              const [, key, value] = match
              if (key === 'files_created') {
                inFiles = true
              } else {
                inFiles = false
                result[key] = value
              }
            } else if (inFiles && line.match(/^\s+-\s+(.+)$/)) {
              files.push(line.match(/^\s+-\s+(.+)$/)?.[1] || '')
            }
          }

          if (files.length > 0) {
            result.files_created = files
          }

          yamlResult = result
        }
      } catch {
        // YAML parsing failed, continue without result
      }
    }
    return { type: 'complete', yamlResult }
  }

  if (output.includes(GENESIS_MARKERS.proposalSent)) {
    return { type: 'proposal_sent' }
  }

  if (output.includes(GENESIS_MARKERS.noProposals)) {
    return { type: 'no_proposals' }
  }

  if (output.includes(GENESIS_MARKERS.continuationComplete)) {
    return { type: 'continuation_complete' }
  }

  return { type: 'unknown' }
}

/**
 * Check if a signal question is from the Genesis Agent.
 */
export function isGenesisSignal(question: string): boolean {
  return question.includes('Genesis proposes:') || question.trim().startsWith('[GENESIS')
}

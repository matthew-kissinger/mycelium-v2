/**
 * Compaction Agent Prompts
 *
 * Smart compaction agent that outputs the cleaned-up memory directly.
 * No complex action parsing - the output IS the new memory state.
 *
 * Template variables:
 * - {MYCEL_CONTEXT}: Injected mycel CLI context instructions
 * - {repo_name}: Name of the repository being compacted
 */

/**
 * Compaction Agent Prompt - semantic memory management
 */
export const COMPACTION_AGENT_PROMPT = `You are the Compaction Agent for Mycelium, an agent orchestration system.

Your job: Clean up and consolidate the memory (patterns and warnings) for a repository.
Output the new, cleaned-up memory directly - your output becomes the new memory state.

{MYCEL_CONTEXT}

## Your Task

Review the current patterns and warnings for this repository and output a cleaned-up version:

1. **Remove duplicates** - Same meaning, different wording? Keep the best one.
2. **Consolidate related items** - Multiple patterns about the same topic? Merge into one comprehensive pattern.
3. **Remove stale items** - References old APIs, deprecated code, or fixed issues? Remove.
4. **Improve clarity** - Vague or unclear patterns? Rewrite to be specific and actionable.
5. **Adjust severity** - Warnings that are more/less critical than rated? Adjust.

## What Makes Good Memory

**Bad patterns (vague, duplicated):**
- "Use Zod for validation"
- "Validate inputs with Zod"
- "Always validate"

**Good pattern (consolidated, specific):**
- "Validate all API inputs and form data using Zod schemas. Define schemas in src/schemas/ and use z.parse() at API boundaries."

**Bad warnings (stale):**
- "Auth v1 endpoint is flaky" (but auth v2 shipped months ago)

**Good warnings (current, actionable):**
- "Payment webhook occasionally times out under load - add retry logic"

## Guidelines

- **Be conservative** - When unsure, keep the pattern
- **Preserve value** - Don't lose useful information when consolidating
- **Be specific** - "Use X for Y in Z" beats "Use X"
- **Stay relevant** - Remove items that don't match current tech stack
- **Tag well** - Good tags help agents find relevant patterns

## Output Format

Output the cleaned-up memory in this YAML format:

\`\`\`yaml
summary:
  patterns_before: 15
  patterns_after: 8
  warnings_before: 5
  warnings_after: 3
  health: good  # good, needs_attention, or cluttered

patterns:
  - content: "Validate all API inputs using Zod schemas defined in src/schemas/"
    tags: ["validation", "zod", "api"]
  - content: "Use React Query for server state, Zustand for client state"
    tags: ["state", "react-query", "zustand"]
  - content: "Run bun test before committing - CI will fail on test failures"
    tags: ["testing", "ci"]

warnings:
  - content: "Payment webhook can timeout under load - needs retry logic"
    severity: medium
  - content: "Legacy auth endpoints still in use by mobile app v2.x"
    severity: low

removed:
  - "Duplicate: 'Use Zod for validation' (merged into comprehensive pattern)"
  - "Stale: 'Auth v1 endpoint is flaky' (v2 shipped)"
  - "Duplicate: 'Always run tests' (merged into testing pattern)"

notes: "Consolidated 3 Zod patterns into one. Removed 2 stale warnings about old auth system."
\`\`\`

If the memory is already clean (no changes needed), output it as-is with summary showing before = after counts.
If there are no patterns or warnings, output empty arrays.
`

// =============================================================================
// Context and Builder
// =============================================================================

export interface CompactionContext {
  repoPath: string
  repoName: string
  patterns: Array<{
    id: string
    content: string
    tags?: string[]
    source?: string
    created_at?: string
  }>
  warnings: Array<{
    id: string
    content: string
    severity: string
    created_at?: string
  }>
  recentTaskTitles?: string[]  // To assess relevance
  techStack?: string[]  // From package.json dependencies
}

/**
 * Build the Compaction agent prompt with context injected.
 */
export function buildCompactionPrompt(
  context: CompactionContext,
  mycelContext: string
): string {
  let prompt = COMPACTION_AGENT_PROMPT
    .replace(/{MYCEL_CONTEXT}/g, mycelContext)
    .replace(/{repo_name}/g, context.repoName)

  // Build data section
  const dataParts: string[] = []

  dataParts.push(`## Repository: ${context.repoName}`)
  dataParts.push(`Path: ${context.repoPath}`)
  dataParts.push('')

  // Tech stack context
  if (context.techStack && context.techStack.length > 0) {
    dataParts.push('### Tech Stack (from package.json)')
    dataParts.push(context.techStack.slice(0, 20).join(', '))
    dataParts.push('')
  }

  // Recent tasks for relevance assessment
  if (context.recentTaskTitles && context.recentTaskTitles.length > 0) {
    dataParts.push('### Recent Task Titles (for relevance assessment)')
    for (const title of context.recentTaskTitles.slice(0, 10)) {
      dataParts.push(`- ${title}`)
    }
    dataParts.push('')
  }

  // Current Patterns
  dataParts.push(`### Current Patterns (${context.patterns.length} total)`)
  dataParts.push('')
  if (context.patterns.length === 0) {
    dataParts.push('No patterns stored for this repository.')
  } else {
    for (const pattern of context.patterns) {
      const tags = pattern.tags?.length ? ` [${pattern.tags.join(', ')}]` : ''
      dataParts.push(`- ${pattern.content}${tags}`)
    }
  }
  dataParts.push('')

  // Current Warnings
  dataParts.push(`### Current Warnings (${context.warnings.length} total)`)
  dataParts.push('')
  if (context.warnings.length === 0) {
    dataParts.push('No warnings stored for this repository.')
  } else {
    for (const warning of context.warnings) {
      dataParts.push(`- [${warning.severity.toUpperCase()}] ${warning.content}`)
    }
  }

  dataParts.push('')
  dataParts.push('---')
  dataParts.push('')
  dataParts.push('Output the cleaned-up memory in the YAML format specified above.')
  dataParts.push('Your output becomes the new memory state for this repository.')

  return `${prompt}\n\n${dataParts.join('\n')}`
}

// =============================================================================
// Output Parsing
// =============================================================================

export interface CompactionOutput {
  summary?: {
    patterns_before: number
    patterns_after: number
    warnings_before: number
    warnings_after: number
    health: 'good' | 'needs_attention' | 'cluttered'
  }
  patterns: Array<{
    content: string
    tags?: string[]
  }>
  warnings: Array<{
    content: string
    severity: string
  }>
  removed?: string[]
  notes?: string
}

/**
 * Parse Compaction agent YAML output.
 */
export function parseCompactionOutput(output: string): CompactionOutput | null {
  // Extract YAML block
  const yamlMatch = output.match(/```yaml\n([\s\S]*?)```/)
  if (!yamlMatch) return null

  try {
    const yaml = yamlMatch[1]
    const lines = yaml.split('\n')

    const result: CompactionOutput = {
      patterns: [],
      warnings: [],
      removed: [],
    }

    let currentSection = ''
    let currentItem: Record<string, unknown> | null = null

    for (const line of lines) {
      const trimmed = line.trim()

      // Top-level sections
      if (trimmed === 'summary:') {
        currentSection = 'summary'
        result.summary = { patterns_before: 0, patterns_after: 0, warnings_before: 0, warnings_after: 0, health: 'good' }
      } else if (trimmed === 'patterns:') {
        currentSection = 'patterns'
        // Save any pending item from previous section
        if (currentItem && currentSection !== 'patterns') {
          currentItem = null
        }
      } else if (trimmed === 'warnings:') {
        // Save pending pattern
        if (currentSection === 'patterns' && currentItem?.content) {
          result.patterns.push(currentItem as { content: string; tags?: string[] })
        }
        currentSection = 'warnings'
        currentItem = null
      } else if (trimmed === 'removed:') {
        // Save pending warning
        if (currentSection === 'warnings' && currentItem?.content) {
          result.warnings.push(currentItem as { content: string; severity: string })
        }
        currentSection = 'removed'
        currentItem = null
      } else if (trimmed.startsWith('notes:')) {
        // Save pending warning
        if (currentSection === 'warnings' && currentItem?.content) {
          result.warnings.push(currentItem as { content: string; severity: string })
        }
        result.notes = trimmed.replace('notes:', '').trim().replace(/^["']|["']$/g, '')
        currentSection = 'notes'
        currentItem = null
      }

      // Summary fields
      if (currentSection === 'summary' && result.summary) {
        if (trimmed.startsWith('patterns_before:')) {
          result.summary.patterns_before = parseInt(trimmed.split(':')[1].trim())
        } else if (trimmed.startsWith('patterns_after:')) {
          result.summary.patterns_after = parseInt(trimmed.split(':')[1].trim())
        } else if (trimmed.startsWith('warnings_before:')) {
          result.summary.warnings_before = parseInt(trimmed.split(':')[1].trim())
        } else if (trimmed.startsWith('warnings_after:')) {
          result.summary.warnings_after = parseInt(trimmed.split(':')[1].trim())
        } else if (trimmed.startsWith('health:')) {
          const health = trimmed.split(':')[1].trim()
          if (health === 'good' || health === 'needs_attention' || health === 'cluttered') {
            result.summary.health = health
          }
        }
      }

      // Patterns
      if (currentSection === 'patterns') {
        if (trimmed.startsWith('- content:')) {
          // Save previous pattern
          if (currentItem?.content) {
            result.patterns.push(currentItem as { content: string; tags?: string[] })
          }
          currentItem = { content: trimmed.replace('- content:', '').trim().replace(/^["']|["']$/g, '') }
        } else if (trimmed.startsWith('content:') && currentItem) {
          currentItem.content = trimmed.replace('content:', '').trim().replace(/^["']|["']$/g, '')
        } else if (trimmed.startsWith('tags:') && currentItem) {
          const tagsMatch = trimmed.match(/\[([^\]]*)\]/)
          if (tagsMatch) {
            currentItem.tags = tagsMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
          }
        }
      }

      // Warnings
      if (currentSection === 'warnings') {
        if (trimmed.startsWith('- content:')) {
          // Save previous warning
          if (currentItem?.content) {
            result.warnings.push(currentItem as { content: string; severity: string })
          }
          currentItem = { content: trimmed.replace('- content:', '').trim().replace(/^["']|["']$/g, ''), severity: 'medium' }
        } else if (trimmed.startsWith('content:') && currentItem) {
          currentItem.content = trimmed.replace('content:', '').trim().replace(/^["']|["']$/g, '')
        } else if (trimmed.startsWith('severity:') && currentItem) {
          currentItem.severity = trimmed.replace('severity:', '').trim()
        }
      }

      // Removed items (simple string list)
      if (currentSection === 'removed') {
        if (trimmed.startsWith('- "') || trimmed.startsWith("- '") || trimmed.startsWith('- ')) {
          const item = trimmed.replace(/^- ["']?|["']?$/g, '')
          if (item) result.removed?.push(item)
        }
      }
    }

    // Save final pending item
    if (currentSection === 'patterns' && currentItem?.content) {
      result.patterns.push(currentItem as { content: string; tags?: string[] })
    }
    if (currentSection === 'warnings' && currentItem?.content) {
      result.warnings.push(currentItem as { content: string; severity: string })
    }

    return result
  } catch (error) {
    console.error('[Compaction] Failed to parse YAML:', error)
    return null
  }
}

/** Marker output by Compaction agent after completion */
export const COMPACTION_COMPLETE_MARKER = '<compaction_complete>true</compaction_complete>'

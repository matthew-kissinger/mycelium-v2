/**
 * Output Parser - Extract structured results from agent output.
 *
 * Supports two formats:
 * 1. XML <task_result> blocks (preferred, new format)
 * 2. Legacy [MARKER] format (fallback for older agents)
 *
 * Also provides git-backed data assembly when agents produce no structured output.
 */

// =============================================================================
// TaskParsedResult - unified structured output from task agents
// =============================================================================

export interface TaskParsedResult {
  status?: 'success' | 'partial' | 'blocked'
  summary?: string
  files_modified: string[]
  files_created: string[]
  files_deleted: string[]
  tests?: { passed: number; failed: number; skipped: number }
  commits: Array<{ hash?: string; message: string }>
  branch?: string
  git_backed?: boolean  // true when data came from git, not agent output
}

// =============================================================================
// parseTaskResult - unified entry point (XML first, then legacy fallback)
// =============================================================================

/**
 * Parse structured output from task agent output.
 * Tries XML <task_result> format first, falls back to legacy [MARKER] format.
 * Returns null if no structured output is found.
 */
export function parseTaskResult(output: string): TaskParsedResult | null {
  if (!output) return null

  // 1. Try new <task_result> XML format
  const xmlResult = parseTaskResultXml(output)
  if (xmlResult) return xmlResult

  // 2. Fall back to legacy [MARKER] format
  const legacy = parseAgentOutput(output)
  if (legacy) return convertLegacyResult(legacy)

  return null
}

// =============================================================================
// XML Parser for <task_result> blocks
// =============================================================================

function parseTaskResultXml(output: string): TaskParsedResult | null {
  const blockMatch = output.match(/<task_result\s+status="(success|partial|blocked)">([\s\S]*?)<\/task_result>/)
  if (!blockMatch) return null

  const status = blockMatch[1] as TaskParsedResult['status']
  const body = blockMatch[2]

  const result: TaskParsedResult = {
    status,
    files_modified: [],
    files_created: [],
    files_deleted: [],
    commits: [],
  }

  // <summary>
  const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) result.summary = summaryMatch[1].trim()

  // <file action="modified|created|deleted">
  const fileRegex = /<file\s+action="(modified|created|deleted)">([\s\S]*?)<\/file>/g
  let fileMatch
  while ((fileMatch = fileRegex.exec(body)) !== null) {
    const action = fileMatch[1]
    const filePath = fileMatch[2].trim()
    if (action === 'modified') result.files_modified.push(filePath)
    else if (action === 'created') result.files_created.push(filePath)
    else if (action === 'deleted') result.files_deleted.push(filePath)
  }

  // <tests> with <passed>, <failed>, <skipped>
  const testsMatch = body.match(/<tests>([\s\S]*?)<\/tests>/)
  if (testsMatch) {
    const testsBody = testsMatch[1]
    const passed = testsBody.match(/<passed>(\d+)<\/passed>/)
    const failed = testsBody.match(/<failed>(\d+)<\/failed>/)
    const skipped = testsBody.match(/<skipped>(\d+)<\/skipped>/)
    result.tests = {
      passed: passed ? parseInt(passed[1], 10) : 0,
      failed: failed ? parseInt(failed[1], 10) : 0,
      skipped: skipped ? parseInt(skipped[1], 10) : 0,
    }
  }

  // <commit hash="...">message</commit>
  const commitRegex = /<commit(?:\s+hash="([^"]*)")?>([\s\S]*?)<\/commit>/g
  let commitMatch
  while ((commitMatch = commitRegex.exec(body)) !== null) {
    result.commits.push({
      hash: commitMatch[1] || undefined,
      message: commitMatch[2].trim(),
    })
  }

  return result
}

// =============================================================================
// Legacy converter: old ParsedResult -> TaskParsedResult
// =============================================================================

function convertLegacyResult(legacy: LegacyParsedResult): TaskParsedResult {
  return {
    files_modified: legacy.files_changed ?? [],
    files_created: [],
    files_deleted: [],
    tests: legacy.tests_run,
    commits: [],
    branch: legacy.branch,
    summary: legacy.summary,
  }
}

// =============================================================================
// Legacy [MARKER] Parser (kept for backwards compatibility)
// =============================================================================

export interface LegacyParsedResult {
  files_changed?: string[]
  tests_run?: { passed: number; failed: number; skipped: number }
  branch?: string
  summary?: string
}

/** @deprecated Use ParsedResult from @mycelium/shared instead */
export type ParsedResult = LegacyParsedResult

/**
 * Parse structured output markers from agent output.
 * Returns null if no markers are found.
 */
export function parseAgentOutput(output: string): ParsedResult | null {
  if (!output) return null

  const result: ParsedResult = {}
  let hasAny = false

  // [FILES_CHANGED] comma-separated list
  const filesMatch = output.match(/\[FILES_CHANGED\][ \t]*(.+)/i)
  if (filesMatch && filesMatch[1]) {
    const files = filesMatch[1]
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0)
    if (files.length > 0) {
      result.files_changed = files
      hasAny = true
    }
  }

  // [TESTS_RUN] X passed, Y failed (optional: Z skipped)
  const testsMatch = output.match(/\[TESTS_RUN\]\s*(.+)/i)
  if (testsMatch && testsMatch[1]) {
    const testsLine = testsMatch[1]
    const passed = testsLine.match(/(\d+)\s*passed/i)
    const failed = testsLine.match(/(\d+)\s*failed/i)
    const skipped = testsLine.match(/(\d+)\s*skipped/i)

    result.tests_run = {
      passed: passed?.[1] ? parseInt(passed[1], 10) : 0,
      failed: failed?.[1] ? parseInt(failed[1], 10) : 0,
      skipped: skipped?.[1] ? parseInt(skipped[1], 10) : 0,
    }
    hasAny = true
  }

  // [BRANCH] branch name
  const branchMatch = output.match(/\[BRANCH\]\s*(.+)/i)
  if (branchMatch && branchMatch[1]) {
    result.branch = branchMatch[1].trim()
    hasAny = true
  }

  // Extract a summary from the last ~500 chars of output (before markers)
  // Look for common summary patterns agents tend to produce
  const summaryMatch = output.match(/(?:##?\s*Summary|SUMMARY)[:\s]*\n([\s\S]{10,500}?)(?:\n##|\n\[FILES_CHANGED\]|\n\[TESTS_RUN\]|\n\[BRANCH\]|$)/i)
  if (summaryMatch && summaryMatch[1]) {
    result.summary = summaryMatch[1].trim()
    hasAny = true
  }

  return hasAny ? result : null
}

// =============================================================================
// Discovery Result Parser
// =============================================================================

export interface DiscoveryResult {
  mode: 'align' | 'auto'
  health?: 'healthy' | 'warning' | 'critical'
  headline?: string
  tasks: Array<{
    id?: string       // only present in auto mode (from mycel task create output)
    agent: string
    model: string
    tier: string
    title: string
    depends_on?: string
  }>
  docs_updated?: string[]
  findings?: Array<{ severity: string; description: string }>
  agent_distribution?: Record<string, number>
  inbox_checked?: boolean
}

/**
 * Parse structured <discovery_result> XML from discovery agent output.
 * Falls back to detecting old-style markers for backwards compatibility.
 */
export function parseDiscoveryResult(output: string): DiscoveryResult | null {
  if (!output) return null

  // Try new structured XML first
  const blockMatch = output.match(/<discovery_result\s+mode="(align|auto)">([\s\S]*?)<\/discovery_result>/)
  if (blockMatch) {
    const mode = blockMatch[1] as 'align' | 'auto'
    const body = blockMatch[2]

    const result: DiscoveryResult = { mode, tasks: [] }

    // <health>
    const healthMatch = body.match(/<health>(healthy|warning|critical)<\/health>/)
    if (healthMatch) result.health = healthMatch[1] as DiscoveryResult['health']

    // <headline>
    const headlineMatch = body.match(/<headline>([\s\S]*?)<\/headline>/)
    if (headlineMatch) result.headline = headlineMatch[1].trim()

    // <inbox_checked>
    const inboxMatch = body.match(/<inbox_checked>(true|false)<\/inbox_checked>/)
    if (inboxMatch) result.inbox_checked = inboxMatch[1] === 'true'

    // Parse tasks - both <suggested_tasks> (align) and <tasks_created> (auto)
    const taskRegex = /<task\s+([^>]*)>([\s\S]*?)<\/task>/g
    let taskMatch
    while ((taskMatch = taskRegex.exec(body)) !== null) {
      const attrs = taskMatch[1]
      const title = taskMatch[2].trim()

      const agent = attrs.match(/agent="([^"]*)"/)
      const model = attrs.match(/model="([^"]*)"/)
      const tier = attrs.match(/tier="([^"]*)"/)
      const id = attrs.match(/id="([^"]*)"/)
      const dependsOn = attrs.match(/depends_on="([^"]*)"/)

      result.tasks.push({
        title,
        agent: agent?.[1] ?? 'unknown',
        model: model?.[1] ?? 'unknown',
        tier: tier?.[1] ?? 'unknown',
        ...(id?.[1] ? { id: id[1] } : {}),
        ...(dependsOn?.[1] ? { depends_on: dependsOn[1] } : {}),
      })
    }

    // <docs_updated>
    const docsRegex = /<doc>([\s\S]*?)<\/doc>/g
    const docs: string[] = []
    let docMatch
    while ((docMatch = docsRegex.exec(body)) !== null) {
      docs.push(docMatch[1].trim())
    }
    if (docs.length > 0) result.docs_updated = docs

    // <finding>
    const findingRegex = /<finding\s+severity="([^"]*)">([\s\S]*?)<\/finding>/g
    const findings: Array<{ severity: string; description: string }> = []
    let findingMatch
    while ((findingMatch = findingRegex.exec(body)) !== null) {
      findings.push({ severity: findingMatch[1], description: findingMatch[2].trim() })
    }
    if (findings.length > 0) result.findings = findings

    // <tier name="..." count="..." />
    const tierRegex = /<tier\s+name="([^"]*)"\s+count="(\d+)"\s*\/>/g
    const distribution: Record<string, number> = {}
    let tierMatch
    while ((tierMatch = tierRegex.exec(body)) !== null) {
      distribution[tierMatch[1]] = parseInt(tierMatch[2], 10)
    }
    if (Object.keys(distribution).length > 0) result.agent_distribution = distribution

    return result
  }

  // Backwards compat: detect old markers
  const hasOldAlign = output.includes('<discovery_sent>true</discovery_sent>')
  const hasOldAuto = output.includes('<discovery_auto>complete</discovery_auto>')

  if (hasOldAlign) {
    return { mode: 'align', tasks: [] }
  }
  if (hasOldAuto) {
    return { mode: 'auto', tasks: [] }
  }

  return null
}

/**
 * Extract Claude session ID from agent output.
 * Claude Code outputs session info that can be used with --resume.
 * Patterns:
 *   "Session: <uuid>"
 *   "session_id: <uuid>"
 *   "╭─ Session: <id> ─╮"
 */
export function parseClaudeSessionId(output: string): string | null {
  if (!output) return null

  // Match UUID-like session identifiers in various Claude output formats
  const patterns = [
    /Session:\s*([0-9a-f-]{36})/i,
    /session_id[:\s]+([0-9a-f-]{36})/i,
    /Session:\s*(\S+)/i,
  ]

  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }

  return null
}

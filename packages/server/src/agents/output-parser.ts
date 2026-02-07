/**
 * Output Parser - Extract structured markers from agent output.
 *
 * Agents are instructed to include markers like:
 *   [FILES_CHANGED] file1.ts, file2.ts
 *   [TESTS_RUN] 5 passed, 1 failed
 *   [BRANCH] mycel/task-abc12345
 *
 * This module parses those markers into a structured result.
 */

export interface ParsedResult {
  files_changed?: string[]
  tests_run?: { passed: number; failed: number; skipped: number }
  branch?: string
  summary?: string
}

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

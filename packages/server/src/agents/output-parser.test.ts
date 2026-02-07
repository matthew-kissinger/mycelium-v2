import { describe, expect, test } from 'bun:test'
import { parseAgentOutput, parseClaudeSessionId } from './output-parser'

// =============================================================================
// parseAgentOutput
// =============================================================================

describe('parseAgentOutput', () => {
  test('parses [FILES_CHANGED] with comma-separated files', () => {
    const output = `Done. Here's what I changed.
[FILES_CHANGED] src/index.ts, src/utils.ts, README.md
[BRANCH] mycel/task-abc12345`

    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.files_changed).toEqual(['src/index.ts', 'src/utils.ts', 'README.md'])
  })

  test('parses [FILES_CHANGED] with single file', () => {
    const output = '[FILES_CHANGED] package.json'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.files_changed).toEqual(['package.json'])
  })

  test('parses [TESTS_RUN] with passed and failed', () => {
    const output = '[TESTS_RUN] 12 passed, 3 failed'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.tests_run).toEqual({ passed: 12, failed: 3, skipped: 0 })
  })

  test('parses [TESTS_RUN] with passed, failed, and skipped', () => {
    const output = '[TESTS_RUN] 10 passed, 2 failed, 5 skipped'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.tests_run).toEqual({ passed: 10, failed: 2, skipped: 5 })
  })

  test('parses [TESTS_RUN] with only passed', () => {
    const output = '[TESTS_RUN] 8 passed'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.tests_run).toEqual({ passed: 8, failed: 0, skipped: 0 })
  })

  test('parses [BRANCH] info', () => {
    const output = '[BRANCH] mycel/task-abc12345'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.branch).toBe('mycel/task-abc12345')
  })

  test('parses [BRANCH] with whitespace trimming', () => {
    const output = '[BRANCH]   feature/new-thing  '
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.branch).toBe('feature/new-thing')
  })

  test('parses all markers together', () => {
    const output = `All changes committed.

[FILES_CHANGED] src/app.ts, src/routes.ts
[TESTS_RUN] 5 passed, 0 failed
[BRANCH] mycel/task-12345678`

    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.files_changed).toEqual(['src/app.ts', 'src/routes.ts'])
    expect(result!.tests_run).toEqual({ passed: 5, failed: 0, skipped: 0 })
    expect(result!.branch).toBe('mycel/task-12345678')
  })

  test('parses summary section', () => {
    const output = `## Summary
Added new API endpoint for user profiles.
Updated validation logic.

[FILES_CHANGED] src/routes.ts`

    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.summary).toContain('Added new API endpoint')
  })

  test('returns null for empty string', () => {
    expect(parseAgentOutput('')).toBeNull()
  })

  test('returns null for output with no markers', () => {
    const output = 'Task completed successfully. Everything looks good.'
    expect(parseAgentOutput(output)).toBeNull()
  })

  test('handles case-insensitive markers', () => {
    const output = '[files_changed] lower.ts\n[tests_run] 1 passed'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.files_changed).toEqual(['lower.ts'])
    expect(result!.tests_run!.passed).toBe(1)
  })

  test('handles empty file list gracefully', () => {
    const output = '[FILES_CHANGED]   \n[BRANCH] main'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    // Empty files should not produce files_changed
    expect(result!.files_changed).toBeUndefined()
    expect(result!.branch).toBe('main')
  })

  test('returns partial result when only some markers present', () => {
    const output = '[BRANCH] feature/fix'
    const result = parseAgentOutput(output)
    expect(result).not.toBeNull()
    expect(result!.branch).toBe('feature/fix')
    expect(result!.files_changed).toBeUndefined()
    expect(result!.tests_run).toBeUndefined()
  })
})

// =============================================================================
// parseClaudeSessionId
// =============================================================================

describe('parseClaudeSessionId', () => {
  test('parses UUID-format session ID', () => {
    const output = 'Session: 550e8400-e29b-41d4-a716-446655440000\nDone.'
    const result = parseClaudeSessionId(output)
    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  test('parses session_id format', () => {
    const output = 'session_id: 550e8400-e29b-41d4-a716-446655440000'
    const result = parseClaudeSessionId(output)
    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  test('returns null for output without session ID', () => {
    const output = 'Task completed. All tests pass.'
    expect(parseClaudeSessionId(output)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseClaudeSessionId('')).toBeNull()
  })

  test('parses non-UUID session ID', () => {
    const output = 'Session: some-session-identifier'
    const result = parseClaudeSessionId(output)
    expect(result).toBe('some-session-identifier')
  })
})

import { describe, expect, test } from 'bun:test'
import { parseAgentOutput, parseClaudeSessionId, parseTaskResult } from './output-parser'

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
// parseTaskResult (XML + legacy fallback)
// =============================================================================

describe('parseTaskResult', () => {
  test('parses full XML with all fields', () => {
    const output = `I've completed the work.

<task_result status="success">
  <summary>Added user authentication with JWT tokens</summary>
  <files_changed>
    <file action="modified">src/auth.ts</file>
    <file action="created">src/middleware/jwt.ts</file>
    <file action="deleted">src/old-auth.ts</file>
  </files_changed>
  <tests>
    <passed>12</passed>
    <failed>0</failed>
    <skipped>1</skipped>
  </tests>
  <commits>
    <commit hash="abc1234">feat: add JWT authentication</commit>
    <commit hash="def5678">test: add auth middleware tests</commit>
  </commits>
</task_result>`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('success')
    expect(result!.summary).toBe('Added user authentication with JWT tokens')
    expect(result!.files_modified).toEqual(['src/auth.ts'])
    expect(result!.files_created).toEqual(['src/middleware/jwt.ts'])
    expect(result!.files_deleted).toEqual(['src/old-auth.ts'])
    expect(result!.tests).toEqual({ passed: 12, failed: 0, skipped: 1 })
    expect(result!.commits).toHaveLength(2)
    expect(result!.commits[0]).toEqual({ hash: 'abc1234', message: 'feat: add JWT authentication' })
    expect(result!.commits[1]).toEqual({ hash: 'def5678', message: 'test: add auth middleware tests' })
  })

  test('parses partial XML (missing optional sections)', () => {
    const output = `<task_result status="success">
  <summary>Fixed the login bug</summary>
  <files_changed>
    <file action="modified">src/login.ts</file>
  </files_changed>
</task_result>`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('success')
    expect(result!.summary).toBe('Fixed the login bug')
    expect(result!.files_modified).toEqual(['src/login.ts'])
    expect(result!.tests).toBeUndefined()
    expect(result!.commits).toEqual([])
  })

  test('parses status="partial"', () => {
    const output = `<task_result status="partial">
  <summary>Started refactoring but hit a blocker</summary>
</task_result>`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('partial')
  })

  test('parses status="blocked"', () => {
    const output = `<task_result status="blocked">
  <summary>Cannot proceed without API key</summary>
</task_result>`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('blocked')
  })

  test('parses commits without hashes', () => {
    const output = `<task_result status="success">
  <summary>Done</summary>
  <commits>
    <commit>feat: add new feature</commit>
  </commits>
</task_result>`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.commits).toHaveLength(1)
    expect(result!.commits[0]).toEqual({ hash: undefined, message: 'feat: add new feature' })
  })

  test('falls back to legacy [MARKER] format', () => {
    const output = `[FILES_CHANGED] src/app.ts, src/routes.ts
[TESTS_RUN] 5 passed, 0 failed
[BRANCH] mycel/task-12345678`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.files_modified).toEqual(['src/app.ts', 'src/routes.ts'])
    expect(result!.tests).toEqual({ passed: 5, failed: 0, skipped: 0 })
    expect(result!.branch).toBe('mycel/task-12345678')
    expect(result!.commits).toEqual([])
    expect(result!.files_created).toEqual([])
    expect(result!.files_deleted).toEqual([])
  })

  test('returns null for empty/garbage output', () => {
    expect(parseTaskResult('')).toBeNull()
    expect(parseTaskResult('Task completed successfully.')).toBeNull()
    expect(parseTaskResult('random text with no markers')).toBeNull()
  })

  test('handles malformed XML gracefully', () => {
    const output = `<task_result status="success">
  <summary>Incomplete XML...`
    // Should not throw, just return null (no closing tag match)
    const result = parseTaskResult(output)
    expect(result).toBeNull()
  })

  test('prefers XML over legacy markers when both present', () => {
    const output = `<task_result status="success">
  <summary>XML result</summary>
  <files_changed>
    <file action="created">new.ts</file>
  </files_changed>
</task_result>
[FILES_CHANGED] old.ts
[BRANCH] legacy-branch`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('success')
    expect(result!.files_created).toEqual(['new.ts'])
    // Should NOT have legacy data
    expect(result!.branch).toBeUndefined()
  })

  test('handles multiple file actions correctly', () => {
    const output = `<task_result status="success">
  <summary>Refactored modules</summary>
  <files_changed>
    <file action="modified">src/a.ts</file>
    <file action="modified">src/b.ts</file>
    <file action="created">src/c.ts</file>
    <file action="created">src/d.ts</file>
    <file action="deleted">src/e.ts</file>
  </files_changed>
</task_result>`

    const result = parseTaskResult(output)
    expect(result).not.toBeNull()
    expect(result!.files_modified).toEqual(['src/a.ts', 'src/b.ts'])
    expect(result!.files_created).toEqual(['src/c.ts', 'src/d.ts'])
    expect(result!.files_deleted).toEqual(['src/e.ts'])
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

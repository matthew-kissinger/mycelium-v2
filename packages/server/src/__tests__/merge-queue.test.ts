/**
 * Merge Queue Tests
 *
 * Tests sequential merge ordering, conflict detection, rebase logic,
 * and mixed merge/defer results.
 *
 * Mocks the git.ts helper module to control git command responses.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'

// =============================================================================
// Mock git operations before importing merge-queue
// =============================================================================

let gitResponseFn: (args: string[]) => { exitCode: number; stdout: string; stderr: string }

function defaultGitResponse() {
  return { exitCode: 0, stdout: '', stderr: '' }
}

function setupGitResponses(
  patterns: Array<{
    match: string
    exitCode?: number
    stdout?: string
    stderr?: string
  }>
) {
  gitResponseFn = (args: string[]) => {
    const cmdStr = args.join(' ')
    for (const p of patterns) {
      if (cmdStr.includes(p.match)) {
        return {
          exitCode: p.exitCode ?? 0,
          stdout: p.stdout ?? '',
          stderr: p.stderr ?? '',
        }
      }
    }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
}

// Mock the git helper module
const mockRunGitSafe = mock(async (args: string[], _cwd: string) => {
  return gitResponseFn(args)
})

const mockDetectDefaultBranch = mock(async (_repoPath: string) => {
  // Delegate to runGitSafe for main/master detection
  const mainCheck = await mockRunGitSafe(['rev-parse', '--verify', 'main'], _repoPath)
  if (mainCheck.exitCode === 0) return 'main'
  const masterCheck = await mockRunGitSafe(['rev-parse', '--verify', 'master'], _repoPath)
  if (masterCheck.exitCode === 0) return 'master'
  return 'HEAD'
})

mock.module('../github/git', () => ({
  runGitSafe: mockRunGitSafe,
  detectDefaultBranch: mockDetectDefaultBranch,
}))

// Now import the module under test
const { processMergeQueue, rebaseBranch } = await import('../github/merge-queue')

// =============================================================================
// Helpers
// =============================================================================

function makeEntry(id: string, branch: string, order: number) {
  return {
    taskId: id,
    branchName: branch,
    title: `Task ${id}`,
    mergeOrder: order,
    agent: 'claude' as string | null,
    model: 'sonnet' as string | null,
  }
}

beforeEach(() => {
  gitResponseFn = defaultGitResponse
  mockRunGitSafe.mockClear()
  mockDetectDefaultBranch.mockClear()
})

// =============================================================================
// processMergeQueue
// =============================================================================

describe('processMergeQueue', () => {
  test('empty entries returns empty result', async () => {
    const result = await processMergeQueue('/repo', [])
    expect(result.merged).toHaveLength(0)
    expect(result.deferred).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
  })

  test('single clean merge succeeds', async () => {
    setupGitResponses([
      { match: 'rev-parse --verify main', exitCode: 0, stdout: 'abc123' },
      { match: 'merge --no-commit --no-ff', exitCode: 0 },
      { match: 'merge --abort', exitCode: 0 },
      { match: 'merge --no-ff', exitCode: 0 },
      { match: 'diff --stat', stdout: ' src/a.ts | 5 +++++\n 1 file changed' },
      { match: 'checkout', exitCode: 0 },
    ])

    const entries = [makeEntry('task-1', 'mycel/task-1', 1)]
    const result = await processMergeQueue('/repo', entries)

    expect(result.merged).toHaveLength(1)
    expect(result.merged[0]!.taskId).toBe('task-1')
    expect(result.merged[0]!.filesChanged).toBe(1)
    expect(result.deferred).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
  })

  test('conflicting merge triggers rebase then defer on failure', async () => {
    setupGitResponses([
      { match: 'rev-parse --verify main', exitCode: 0, stdout: 'abc123' },
      { match: 'merge --no-commit --no-ff', exitCode: 1, stderr: 'CONFLICT' },
      { match: 'diff --name-only --diff-filter=U', stdout: 'src/shared.ts' },
      { match: 'merge --abort', exitCode: 0 },
      { match: 'rebase --abort', exitCode: 0 },
      { match: 'rebase', exitCode: 1, stderr: 'CONFLICT' },
      { match: 'checkout', exitCode: 0 },
    ])

    const entries = [makeEntry('task-1', 'mycel/task-1', 1)]
    const result = await processMergeQueue('/repo', entries)

    expect(result.merged).toHaveLength(0)
    expect(result.deferred).toHaveLength(1)
    expect(result.deferred[0]!.taskId).toBe('task-1')
    expect(result.deferred[0]!.reason).toContain('conflicts')
  })

  test('multiple entries processed in order', async () => {
    setupGitResponses([
      { match: 'rev-parse --verify main', exitCode: 0, stdout: 'abc123' },
      { match: 'merge --no-commit --no-ff', exitCode: 0 },
      { match: 'merge --abort', exitCode: 0 },
      { match: 'merge --no-ff', exitCode: 0 },
      { match: 'diff --stat', stdout: ' src/a.ts | 1 +\n 1 file changed' },
      { match: 'checkout', exitCode: 0 },
    ])

    const entries = [
      makeEntry('task-1', 'mycel/task-1', 1),
      makeEntry('task-2', 'mycel/task-2', 2),
      makeEntry('task-3', 'mycel/task-3', 3),
    ]

    const result = await processMergeQueue('/repo', entries)

    expect(result.merged).toHaveLength(3)
    expect(result.merged[0]!.taskId).toBe('task-1')
    expect(result.merged[1]!.taskId).toBe('task-2')
    expect(result.merged[2]!.taskId).toBe('task-3')
  })

  test('checkout failure fails all entries', async () => {
    setupGitResponses([
      { match: 'rev-parse --verify main', exitCode: 0, stdout: 'abc123' },
      { match: 'checkout', exitCode: 1, stderr: 'error: pathspec does not match' },
    ])

    const entries = [makeEntry('task-1', 'mycel/task-1', 1)]
    const result = await processMergeQueue('/repo', entries)

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.error).toContain('Cannot checkout')
  })

  test('falls back to master when main does not exist', async () => {
    setupGitResponses([
      { match: 'rev-parse --verify main', exitCode: 1 },
      { match: 'rev-parse --verify master', exitCode: 0, stdout: 'def456' },
      { match: 'merge --no-commit --no-ff', exitCode: 0 },
      { match: 'merge --abort', exitCode: 0 },
      { match: 'merge --no-ff', exitCode: 0 },
      { match: 'diff --stat', stdout: '' },
      { match: 'checkout', exitCode: 0 },
    ])

    const entries = [makeEntry('task-1', 'mycel/task-1', 1)]
    const result = await processMergeQueue('/repo', entries)

    expect(result.merged).toHaveLength(1)
  })
})

// =============================================================================
// rebaseBranch
// =============================================================================

describe('rebaseBranch', () => {
  test('successful rebase returns success', async () => {
    setupGitResponses([
      { match: 'checkout', exitCode: 0 },
      { match: 'rebase main', exitCode: 0 },
    ])

    const result = await rebaseBranch('/repo', 'mycel/task-1', 'main')

    expect(result.success).toBe(true)
    expect(result.conflicts).toBeUndefined()
  })

  test('failed rebase returns conflicts', async () => {
    setupGitResponses([
      { match: 'checkout', exitCode: 0 },
      { match: 'rebase --abort', exitCode: 0 },
      { match: 'rebase', exitCode: 1, stderr: 'CONFLICT' },
      { match: 'diff --name-only --diff-filter=U', stdout: 'file1.ts\nfile2.ts' },
    ])

    const result = await rebaseBranch('/repo', 'mycel/task-1', 'main')

    expect(result.success).toBe(false)
    expect(result.conflicts).toContain('file1.ts')
    expect(result.conflicts).toContain('file2.ts')
  })

  test('checkout failure returns conflict info', async () => {
    setupGitResponses([
      { match: 'checkout mycel/task-1', exitCode: 1, stderr: 'Branch not found' },
    ])

    const result = await rebaseBranch('/repo', 'mycel/task-1', 'main')

    expect(result.success).toBe(false)
    expect(result.conflicts).toBeDefined()
    expect(result.conflicts!.length).toBeGreaterThan(0)
  })
})

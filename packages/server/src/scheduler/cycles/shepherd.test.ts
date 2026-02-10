/**
 * Shepherd cycle tests.
 *
 * Tests batch threshold, XML/YAML evaluation parsing, branch processing,
 * memory recording, and error handling.
 * Heavy dependencies (dispatch, DB queries, SSE, telegram, workspace, git) are mocked.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { configFixture, resetFixtureCounters } from '../../__tests__/helpers/fixtures'

// =============================================================================
// Mock all heavy dependencies before importing shepherd
// =============================================================================

// Mock queries - track all calls
const mockGetRepos = mock(async () => [] as any[])
const mockGetUnevaluatedTasks = mock(async (_repoPath?: string, _limit?: number) => [] as any[])
const mockCreateRun = mock(async (_input: any) => ({ id: 'run-test-001', status: 'running' }))
const mockCompleteRun = mock(async (_id: string, _output?: string) => {})
const mockFailRun = mock(async (_id: string, _error: string) => {})
const mockUpdateTask = mock(async (_id: string, _updates: any) => {})
const mockCreateShepherdEvaluation = mock(async (_input: any) => ({ id: 'eval-001' }))
const mockCreatePattern = mock(async (_input: any) => ({ id: 'pattern-001' }))
const mockCreateWarning = mock(async (_input: any) => ({ id: 'warning-001' }))
const mockCreateFruitingSession = mock(async (_input: any) => ({ id: 'session-001' }))
const mockGetRepo = mock(async (_path: string) => null)

mock.module('../../db/queries', () => ({
  getRepos: mockGetRepos,
  getRepo: mockGetRepo,
  getUnevaluatedTasks: mockGetUnevaluatedTasks,
  createRun: mockCreateRun,
  completeRun: mockCompleteRun,
  failRun: mockFailRun,
  updateTask: mockUpdateTask,
  createShepherdEvaluation: mockCreateShepherdEvaluation,
  createPattern: mockCreatePattern,
  createWarning: mockCreateWarning,
  createFruitingSession: mockCreateFruitingSession,
}))

// Mock dispatch
const mockDispatchFn = mock(async (_options: any) => ({
  success: true,
  output: 'No evaluation output',
  exit_code: 0,
  duration_seconds: 60,
}))

mock.module('../../agents/dispatch', () => ({
  dispatch: mockDispatchFn,
}))

// Mock SSE broadcast
const mockBroadcastFn = mock((_event: string, _data: unknown) => {})
mock.module('../../sse', () => ({
  broadcast: mockBroadcastFn,
}))

// Mock context
mock.module('../../prompts/context', () => ({
  buildMycelContext: mock(() => '## Mock Shepherd Context'),
  buildMemorySection: mock(async () => ''),
}))

// Mock telegram
const mockTelegramSendMessage = mock(async (_msg: string) => {})
const mockTelegramConnected = mock(() => true)

mock.module('../../telegram', () => ({
  getTelegramService: mock(() => ({
    isConnected: mockTelegramConnected,
    sendMessage: mockTelegramSendMessage,
  })),
}))

mock.module('../../telegram/messages', () => ({
  formatShepherdReport: mock((_report: any) => 'shepherd report'),
  formatMergeConflict: mock(() => 'merge conflict'),
  formatMergeSuccess: mock(() => 'merge success'),
}))

mock.module('../../telegram/buffer', () => ({
  bufferTaskEvent: mock(() => {}),
}))

// Mock active runs
const mockRegisterActiveRun = mock((_run: any) => {})
const mockUnregisterActiveRun = mock((_runId: string) => {})
const mockIsShepherdRunningForRepo = mock((_repoPath: string) => false)

mock.module('../active-runs', () => ({
  registerActiveRun: mockRegisterActiveRun,
  unregisterActiveRun: mockUnregisterActiveRun,
  isShepherdRunningForRepo: mockIsShepherdRunningForRepo,
  isMaxAlignmentRunningForRepo: mock(() => false),
}))

// Mock GitHub
mock.module('../../github', () => ({
  getRepoSlug: mock(async () => null),
  createPR: mock(async () => null),
  mergePR: mock(async () => ({ success: false, error: 'mock' })),
  closePR: mock(async () => {}),
  buildPRBody: mock(() => 'mock PR body'),
  ensureLabels: mock(async () => {}),
  AGENT_LABELS: ['mycelium', 'auto-merge', 'needs-review'],
  createCommitStatus: mock(async () => {}),
  getBranchSha: mock(async () => null),
}))

mock.module('../../github/merge-queue', () => ({
  processMergeQueue: mock(async () => ({ merged: [], deferred: [], failed: [] })),
}))

// Mock workspace
const mockGetBranchDiff = mock(async (_repoPath: string, _branchName: string) => ({
  filesChanged: ['src/main.ts'],
  diffStat: ' src/main.ts | 5 +++++\n 1 file changed',
  diffContent: '+// changed code',
}))
const mockCleanupWorkspace = mock(async (_taskId: string, _repoPath: string, _deleteBranch?: boolean) => {})

mock.module('../../agents/workspace', () => ({
  getBranchDiff: mockGetBranchDiff,
  cleanupWorkspace: mockCleanupWorkspace,
}))

// Mock registry queries (for agent feedback)
const mockGetAgentHealth = mock((_agentId: string) => undefined as any)
const mockUpsertAgentHealth = mock((_key: string, _data: any) => {})

mock.module('../../db/registry-queries', () => ({
  getAgentHealth: mockGetAgentHealth,
  upsertAgentHealth: mockUpsertAgentHealth,
}))

// Now import the module under test
const { runShepherdCycle } = await import('./shepherd')

// =============================================================================
// Helpers
// =============================================================================

function makeRepo(path = '/home/test/repo', name = 'test-repo') {
  return { id: 'repo-001', path, name, description: null, language: 'typescript', mode: 'align', weight: 50, skills: '[]', created_at: new Date().toISOString(), last_scanned_at: null }
}

function makeTask(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    title: `Task ${id.slice(0, 8)}`,
    status: 'done',
    agent: 'claude',
    model: 'sonnet',
    repo_path: '/home/test/repo',
    result: 'Completed the work',
    error: null,
    cost_usd: 0.05,
    duration_seconds: 120,
    branch_name: null,
    ...overrides,
  }
}

/** Build an XML evaluation output that parseShepherdOutput can parse */
function makeEvalOutput(overrides: {
  health?: string
  headline?: string
  concerns?: string[]
  wins?: string[]
  recommendation?: string
  patterns?: Array<{ content: string; tags?: string[] }>
  warnings?: Array<{ content: string; severity?: string }>
  branch_evaluations?: Array<{
    task_id: string; decision: string; reason: string;
    confidence?: number; merge_order?: number; agent?: string;
    files_modified?: string[]; files_created?: string[];
    tests?: { passed: number; failed: number; skipped: number };
    commits?: Array<{ hash?: string; message: string }>;
    patterns?: Array<{ content: string; tags?: string[] }>;
    warnings?: Array<{ content: string; severity?: string }>;
  }>
  agent_feedback?: Array<{ agent: string; best_for?: string; avoid_for?: string }>
} = {}): string {
  const health = overrides.health ?? 'healthy'
  const headline = overrides.headline ?? 'All systems nominal'
  const parts: string[] = ['Here is my evaluation:\n']

  parts.push(`<shepherd_result health="${health}">`)
  parts.push(`  <headline>${headline}</headline>`)

  if (overrides.recommendation) {
    parts.push(`  <recommendation>${overrides.recommendation}</recommendation>`)
  }
  if (overrides.concerns?.length) {
    parts.push('  <concerns>')
    for (const c of overrides.concerns) parts.push(`    <item>${c}</item>`)
    parts.push('  </concerns>')
  }
  if (overrides.wins?.length) {
    parts.push('  <wins>')
    for (const w of overrides.wins) parts.push(`    <item>${w}</item>`)
    parts.push('  </wins>')
  }
  if (overrides.patterns?.length) {
    parts.push('  <patterns>')
    for (const p of overrides.patterns) {
      const tagsAttr = p.tags?.length ? ` tags="${p.tags.join(',')}"` : ''
      parts.push(`    <pattern${tagsAttr}>${p.content}</pattern>`)
    }
    parts.push('  </patterns>')
  }
  if (overrides.warnings?.length) {
    parts.push('  <warnings>')
    for (const w of overrides.warnings) {
      const sevAttr = w.severity ? ` severity="${w.severity}"` : ''
      parts.push(`    <warning${sevAttr}>${w.content}</warning>`)
    }
    parts.push('  </warnings>')
  }
  if (overrides.branch_evaluations?.length) {
    parts.push('  <branch_evaluations>')
    for (const be of overrides.branch_evaluations) {
      let attrs = `task_id="${be.task_id}" decision="${be.decision}"`
      if (be.confidence !== undefined) attrs += ` confidence="${be.confidence}"`
      if (be.merge_order !== undefined) attrs += ` merge_order="${be.merge_order}"`
      if (be.agent) attrs += ` agent="${be.agent}"`
      parts.push(`    <evaluation ${attrs}>`)
      parts.push(`      <reason>${be.reason}</reason>`)
      if (be.files_modified?.length || be.files_created?.length) {
        parts.push('      <files_changed>')
        for (const f of be.files_modified ?? []) parts.push(`        <file action="modified">${f}</file>`)
        for (const f of be.files_created ?? []) parts.push(`        <file action="created">${f}</file>`)
        parts.push('      </files_changed>')
      }
      if (be.tests) {
        parts.push(`      <tests><passed>${be.tests.passed}</passed><failed>${be.tests.failed}</failed><skipped>${be.tests.skipped}</skipped></tests>`)
      }
      if (be.commits?.length) {
        parts.push('      <commits>')
        for (const c of be.commits) parts.push(`        <commit${c.hash ? ` hash="${c.hash}"` : ''}>${c.message}</commit>`)
        parts.push('      </commits>')
      }
      if (be.patterns?.length) {
        parts.push('      <patterns>')
        for (const p of be.patterns) parts.push(`        <pattern${p.tags?.length ? ` tags="${p.tags.join(',')}"` : ''}>${p.content}</pattern>`)
        parts.push('      </patterns>')
      }
      if (be.warnings?.length) {
        parts.push('      <warnings>')
        for (const w of be.warnings) parts.push(`        <warning${w.severity ? ` severity="${w.severity}"` : ''}>${w.content}</warning>`)
        parts.push('      </warnings>')
      }
      parts.push('    </evaluation>')
    }
    parts.push('  </branch_evaluations>')
  }
  if (overrides.agent_feedback?.length) {
    parts.push('  <agent_feedback>')
    for (const af of overrides.agent_feedback) {
      parts.push(`    <agent name="${af.agent}">`)
      if (af.best_for) parts.push(`      <best_for>${af.best_for}</best_for>`)
      if (af.avoid_for) parts.push(`      <avoid_for>${af.avoid_for}</avoid_for>`)
      parts.push('    </agent>')
    }
    parts.push('  </agent_feedback>')
  }

  parts.push('</shepherd_result>')
  return parts.join('\n')
}

/** Build a YAML evaluation output for fallback parser testing */
function makeYamlEvalOutput(overrides: {
  health?: string
  headline?: string
  concerns?: string[]
  wins?: string[]
  recommendation?: string
  patterns?: Array<{ content: string; tags?: string[] }>
  warnings?: Array<{ content: string; severity?: string }>
  branch_evaluations?: Array<{ task_id: string; decision: string; reason: string; merge_order?: number }>
} = {}): string {
  const health = overrides.health ?? 'healthy'
  const headline = overrides.headline ?? 'All systems nominal'
  const parts: string[] = ['Here is my evaluation:\n', '```yaml']
  parts.push(`health: ${health}`)
  parts.push(`headline: "${headline}"`)
  if (overrides.concerns?.length) {
    parts.push('concerns:')
    for (const c of overrides.concerns) parts.push(`  - "${c}"`)
  }
  if (overrides.wins?.length) {
    parts.push('wins:')
    for (const w of overrides.wins) parts.push(`  - "${w}"`)
  }
  if (overrides.recommendation) parts.push(`recommendation: "${overrides.recommendation}"`)
  if (overrides.patterns?.length) {
    parts.push('patterns:')
    for (const p of overrides.patterns) {
      parts.push(`  - content: "${p.content}"`)
      if (p.tags?.length) {
        parts.push('    tags:')
        for (const t of p.tags) parts.push(`      - "${t}"`)
      }
    }
  }
  if (overrides.warnings?.length) {
    parts.push('warnings:')
    for (const w of overrides.warnings) {
      parts.push(`  - content: "${w.content}"`)
      if (w.severity) parts.push(`    severity: ${w.severity}`)
    }
  }
  if (overrides.branch_evaluations?.length) {
    parts.push('branch_evaluations:')
    for (const be of overrides.branch_evaluations) {
      parts.push(`  - task_id: "${be.task_id}"`)
      parts.push(`    decision: ${be.decision}`)
      parts.push(`    reason: "${be.reason}"`)
      if (be.merge_order !== undefined) parts.push(`    merge_order: ${be.merge_order}`)
    }
  }
  parts.push('```')
  return parts.join('\n')
}

function resetAllMocks() {
  resetFixtureCounters()
  mockGetRepos.mockClear()
  mockGetUnevaluatedTasks.mockClear()
  mockCreateRun.mockClear()
  mockCompleteRun.mockClear()
  mockFailRun.mockClear()
  mockUpdateTask.mockClear()
  mockCreateShepherdEvaluation.mockClear()
  mockCreatePattern.mockClear()
  mockCreateWarning.mockClear()
  mockCreateFruitingSession.mockClear()
  mockDispatchFn.mockClear()
  mockBroadcastFn.mockClear()
  mockRegisterActiveRun.mockClear()
  mockUnregisterActiveRun.mockClear()
  mockIsShepherdRunningForRepo.mockClear()
  mockGetBranchDiff.mockClear()
  mockCleanupWorkspace.mockClear()
  mockTelegramSendMessage.mockClear()
  mockGetAgentHealth.mockClear()
  mockUpsertAgentHealth.mockClear()

  // Reset implementations to defaults
  mockGetRepos.mockImplementation(async () => [])
  mockGetUnevaluatedTasks.mockImplementation(async () => [])
  mockIsShepherdRunningForRepo.mockImplementation(() => false)
  mockCreateRun.mockImplementation(async () => ({ id: 'run-test-001', status: 'running' }))
  mockDispatchFn.mockImplementation(async () => ({
    success: true,
    output: 'No evaluation output',
    exit_code: 0,
    duration_seconds: 60,
  }))
  mockGetAgentHealth.mockImplementation(() => undefined)
  mockUpsertAgentHealth.mockImplementation(() => {})
}

// =============================================================================
// Batch Threshold
// =============================================================================

describe('runShepherdCycle - batch threshold', () => {
  beforeEach(resetAllMocks)

  test('does nothing when no repos exist', async () => {
    const config = configFixture({ shepherd_batch_size: 5 })
    mockGetRepos.mockImplementation(async () => [])

    await runShepherdCycle(config)

    expect(mockGetUnevaluatedTasks).not.toHaveBeenCalled()
    expect(mockDispatchFn).not.toHaveBeenCalled()
  })

  test('skips repo below batch threshold', async () => {
    const config = configFixture({ shepherd_batch_size: 5 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    // Return 3 tasks (below threshold of 5)
    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    await runShepherdCycle(config)

    // Queries unevaluated tasks but does not dispatch
    expect(mockGetUnevaluatedTasks).toHaveBeenCalled()
    expect(mockDispatchFn).not.toHaveBeenCalled()
  })

  test('triggers evaluation when threshold met', async () => {
    const config = configFixture({ shepherd_batch_size: 3 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')]
    // First call: threshold check (returns >= batchSize)
    // Second call: get all unevaluated (returns same or more)
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    // Set dispatch to return valid YAML output
    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput({ headline: 'Good work' }),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockDispatchFn).toHaveBeenCalledTimes(1)
    expect(mockCreateRun).toHaveBeenCalledTimes(1)
  })

  test('runs below threshold when specificRepo provided', async () => {
    const config = configFixture({ shepherd_batch_size: 5 })
    const repo = makeRepo('/home/test/specific-repo', 'specific-repo')
    mockGetRepos.mockImplementation(async () => [repo])

    // Only 2 tasks (below threshold of 5)
    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput(),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config, '/home/test/specific-repo')

    // Should dispatch anyway because specificRepo forces evaluation
    expect(mockDispatchFn).toHaveBeenCalledTimes(1)
  })

  test('skips repo when shepherd already running for it', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])
    mockIsShepherdRunningForRepo.mockImplementation(() => true)

    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    await runShepherdCycle(config)

    // Should not even check for unevaluated tasks
    expect(mockGetUnevaluatedTasks).not.toHaveBeenCalled()
    expect(mockDispatchFn).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Evaluation Parsing (via dispatch output)
// =============================================================================

describe('runShepherdCycle - evaluation parsing', () => {
  beforeEach(resetAllMocks)

  function setupForEvaluation(evalOutput: string) {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('task-001'), makeTask('task-002')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async (options: any) => {
      // Call onOutput if provided (for session logging)
      if (options.onOutput) options.onOutput(evalOutput, 'stdout')
      return {
        success: true,
        output: evalOutput,
        exit_code: 0,
        duration_seconds: 60,
      }
    })

    return { config, tasks }
  }

  test('parses healthy evaluation with concerns and wins', async () => {
    const output = makeEvalOutput({
      health: 'healthy',
      headline: 'Solid progress on features',
      concerns: ['Test coverage low', 'No error handling'],
      wins: ['Clean code', 'Good naming'],
      recommendation: 'Add more tests',
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    expect(mockCreateShepherdEvaluation).toHaveBeenCalledTimes(1)
    const evalArg = mockCreateShepherdEvaluation.mock.calls[0][0]
    expect(evalArg.health).toBe('healthy')
    expect(evalArg.headline).toBe('Solid progress on features')
    expect(evalArg.concerns).toEqual(['Test coverage low', 'No error handling'])
    expect(evalArg.wins).toEqual(['Clean code', 'Good naming'])
    expect(evalArg.recommendation).toBe('Add more tests')
  })

  test('parses warning health status', async () => {
    const output = makeEvalOutput({
      health: 'warning',
      headline: 'Some issues detected',
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    const evalArg = mockCreateShepherdEvaluation.mock.calls[0][0]
    expect(evalArg.health).toBe('warning')
  })

  test('parses critical health status', async () => {
    const output = makeEvalOutput({
      health: 'critical',
      headline: 'Major problems found',
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    const evalArg = mockCreateShepherdEvaluation.mock.calls[0][0]
    expect(evalArg.health).toBe('critical')
  })

  test('handles output without valid YAML block', async () => {
    // Output with no ```yaml ... ``` block
    const output = 'I evaluated the tasks. Everything looks fine but I forgot the YAML format.'

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    // Should NOT create evaluation record when parsing fails
    expect(mockCreateShepherdEvaluation).not.toHaveBeenCalled()
    // But should still mark tasks as evaluated
    expect(mockUpdateTask).toHaveBeenCalled()
  })

  test('marks tasks as evaluated after successful parsing', async () => {
    const output = makeEvalOutput({ headline: 'All good' })
    const { config, tasks } = setupForEvaluation(output)

    await runShepherdCycle(config)

    // Each task should be updated with shepherd_evaluated_at
    expect(mockUpdateTask.mock.calls.length).toBe(tasks.length)
    for (const call of mockUpdateTask.mock.calls) {
      expect(call[1]).toHaveProperty('shepherd_evaluated_at')
    }
  })
})

// =============================================================================
// Pattern and Warning Extraction
// =============================================================================

describe('runShepherdCycle - memory recording', () => {
  beforeEach(resetAllMocks)

  test('stores extracted patterns in memory', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    const output = makeEvalOutput({
      headline: 'Good work',
      patterns: [
        { content: 'Always use TypeScript strict mode', tags: ['typescript', 'config'] },
        { content: 'Prefer composition over inheritance', tags: ['design'] },
      ],
    })

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output,
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockCreatePattern).toHaveBeenCalledTimes(2)
    // First pattern
    const p1 = mockCreatePattern.mock.calls[0][0]
    expect(p1.content).toBe('Always use TypeScript strict mode')
    expect(p1.source).toBe('shepherd')
    expect(p1.repo_path).toBe('/home/test/repo')
    expect(p1.tags).toEqual(['typescript', 'config'])

    // Second pattern
    const p2 = mockCreatePattern.mock.calls[1][0]
    expect(p2.content).toBe('Prefer composition over inheritance')
  })

  test('stores extracted warnings in memory', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    const output = makeEvalOutput({
      headline: 'Some concerns',
      warnings: [
        { content: 'SQL injection risk in user input', severity: 'high' },
        { content: 'Missing input validation', severity: 'medium' },
      ],
    })

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output,
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockCreateWarning).toHaveBeenCalledTimes(2)
    const w1 = mockCreateWarning.mock.calls[0][0]
    expect(w1.content).toBe('SQL injection risk in user input')
    expect(w1.severity).toBe('high')
    expect(w1.repo_path).toBe('/home/test/repo')

    const w2 = mockCreateWarning.mock.calls[1][0]
    expect(w2.content).toBe('Missing input validation')
    expect(w2.severity).toBe('medium')
  })

  test('does not create patterns or warnings when none extracted', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    const output = makeEvalOutput({
      headline: 'Clean run, no patterns or warnings',
    })

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output,
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockCreatePattern).not.toHaveBeenCalled()
    expect(mockCreateWarning).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Branch Evaluations (MERGE / REJECT / DEFER)
// =============================================================================

describe('runShepherdCycle - branch evaluations', () => {
  beforeEach(resetAllMocks)

  function setupWithBranches(branchEvals: Array<{ task_id: string; decision: string; reason: string; merge_order?: number; confidence?: number; agent?: string }>) {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    // Tasks with branches
    const tasks = [
      makeTask('task-001-aaa-bbb-ccc', { branch_name: 'mycel/task-task-001' }),
      makeTask('task-002-ddd-eee-fff', { branch_name: 'mycel/task-task-002' }),
      makeTask('task-003-ggg-hhh-iii', { branch_name: 'mycel/task-task-003' }),
    ]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    const output = makeEvalOutput({
      headline: 'Branch evaluation complete',
      branch_evaluations: branchEvals,
    })

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output,
      exit_code: 0,
      duration_seconds: 60,
    }))

    return { config, tasks }
  }

  test('REJECT verdict cleans up worktree and clears branch fields', async () => {
    const { config } = setupWithBranches([
      { task_id: 'task-001', decision: 'REJECT', reason: 'Broken code' },
    ])

    await runShepherdCycle(config)

    // Should cleanup workspace with deleteBranch=true
    expect(mockCleanupWorkspace).toHaveBeenCalledTimes(1)
    const cleanupCall = mockCleanupWorkspace.mock.calls[0]
    expect(cleanupCall[0]).toBe('task-001-aaa-bbb-ccc')  // full task ID
    expect(cleanupCall[1]).toBe('/home/test/repo')
    expect(cleanupCall[2]).toBe(true)  // deleteBranch

    // Should clear worktree_path and branch_name
    const updateCalls = mockUpdateTask.mock.calls.filter(
      (c) => c[1].worktree_path === null && c[1].branch_name === null
    )
    expect(updateCalls.length).toBeGreaterThanOrEqual(1)
  })

  test('DEFER verdict keeps worktree intact', async () => {
    const { config } = setupWithBranches([
      { task_id: 'task-002', decision: 'DEFER', reason: 'Needs minor fixes' },
    ])

    await runShepherdCycle(config)

    // Should NOT cleanup workspace for deferred tasks
    expect(mockCleanupWorkspace).not.toHaveBeenCalled()
  })

  test('processes multiple branch decisions correctly', async () => {
    const { config } = setupWithBranches([
      { task_id: 'task-001', decision: 'REJECT', reason: 'Bad code' },
      { task_id: 'task-003', decision: 'DEFER', reason: 'Review later' },
    ])

    await runShepherdCycle(config)

    // Only 1 cleanup (REJECT). DEFER does not cleanup.
    expect(mockCleanupWorkspace).toHaveBeenCalledTimes(1)
  })

  test('skips branch evaluation when task_id not found', async () => {
    const { config } = setupWithBranches([
      { task_id: 'nonexistent', decision: 'MERGE', reason: 'Good code' },
    ])

    await runShepherdCycle(config)

    // Should not crash, just skip
    expect(mockCleanupWorkspace).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Error Handling
// =============================================================================

describe('runShepherdCycle - error handling', () => {
  beforeEach(resetAllMocks)

  test('agent failure does not crash cycle', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    // Dispatch returns failure
    mockDispatchFn.mockImplementation(async () => ({
      success: false,
      output: 'Agent crashed: out of memory',
      exit_code: 1,
      duration_seconds: 5,
    }))

    // Should not throw
    await runShepherdCycle(config)

    // Should mark run as failed
    expect(mockFailRun).toHaveBeenCalledTimes(1)
    expect(mockFailRun.mock.calls[0][1]).toContain('Agent crashed')

    // Should still mark tasks as evaluated
    expect(mockUpdateTask.mock.calls.length).toBe(tasks.length)

    // Should broadcast failure event
    const failEvents = mockBroadcastFn.mock.calls.filter((c) => c[0] === 'agent:failed')
    expect(failEvents.length).toBe(1)
  })

  test('YAML parse failure handles gracefully (no YAML block)', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    // Dispatch returns success but no valid YAML
    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: 'I analyzed everything. All good!',
      exit_code: 0,
      duration_seconds: 30,
    }))

    await runShepherdCycle(config)

    // Should not create evaluation record
    expect(mockCreateShepherdEvaluation).not.toHaveBeenCalled()
    // But should complete the run
    expect(mockCompleteRun).toHaveBeenCalledTimes(1)
    // And mark tasks as evaluated
    expect(mockUpdateTask).toHaveBeenCalled()
  })

  test('dispatch exception does not crash cycle', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    // Dispatch throws an exception
    mockDispatchFn.mockImplementation(async () => {
      throw new Error('Network connection refused')
    })

    // Should not throw
    await runShepherdCycle(config)

    // Should mark run as failed with the error message
    expect(mockFailRun).toHaveBeenCalledTimes(1)
    expect(mockFailRun.mock.calls[0][1]).toContain('Network connection refused')

    // Should still mark tasks as evaluated
    expect(mockUpdateTask).toHaveBeenCalled()

    // Should unregister active run (finally block)
    expect(mockUnregisterActiveRun).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// SSE Broadcasts
// =============================================================================

describe('runShepherdCycle - SSE events', () => {
  beforeEach(resetAllMocks)

  test('broadcasts agent started and completed events', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput(),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    const startEvents = mockBroadcastFn.mock.calls.filter((c) => c[0] === 'agent:started')
    const completedEvents = mockBroadcastFn.mock.calls.filter((c) => c[0] === 'agent:completed')

    expect(startEvents.length).toBe(1)
    expect(startEvents[0][1].agent_type).toBe('shepherd')
    expect(completedEvents.length).toBe(1)
    expect(completedEvents[0][1].agent_type).toBe('shepherd')
  })

  test('registers and unregisters active run', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput(),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockRegisterActiveRun).toHaveBeenCalledTimes(1)
    expect(mockRegisterActiveRun.mock.calls[0][0].agent_type).toBe('shepherd')
    expect(mockUnregisterActiveRun).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// Telegram Notifications
// =============================================================================

describe('runShepherdCycle - telegram notifications', () => {
  beforeEach(resetAllMocks)

  test('sends shepherd report via telegram on successful evaluation', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput({ headline: 'All good', health: 'healthy' }),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockTelegramSendMessage).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// Fruiting Session Recording
// =============================================================================

describe('runShepherdCycle - fruiting sessions', () => {
  beforeEach(resetAllMocks)

  test('records fruiting session for system agent run', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput(),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockCreateFruitingSession).toHaveBeenCalledTimes(1)
    const sessionArg = mockCreateFruitingSession.mock.calls[0][0]
    expect(sessionArg.agent).toBe('claude')
    expect(sessionArg.model).toBe('opus')
    expect(sessionArg.context_trace.agent_type).toBe('shepherd')
    expect(sessionArg.repo_path).toBe('/home/test/repo')
  })
})

// =============================================================================
// Regression Tests
// =============================================================================

describe('runShepherdCycle - regression tests', () => {
  beforeEach(resetAllMocks)

  test('Bug 1: DEFER during local merge queue does not crash with TDZ (deferredTaskIds)', async () => {
    // Regression: deferredTaskIds was declared AFTER it was used in the merge queue
    // deferred handler, causing a TDZ crash. Fix: declare at top of processBranchEvaluations.
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    // Tasks with branches - one will MERGE (triggering merge queue) and one will DEFER
    const tasks = [
      makeTask('task-001-aaa-bbb-ccc', { branch_name: 'mycel/task-task-001' }),
      makeTask('task-002-ddd-eee-fff', { branch_name: 'mycel/task-task-002' }),
    ]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    const output = makeEvalOutput({
      headline: 'Mixed results',
      branch_evaluations: [
        { task_id: 'task-001', decision: 'DEFER', reason: 'Needs review' },
      ],
    })

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output,
      exit_code: 0,
      duration_seconds: 60,
    }))

    // Should not throw TDZ error
    await runShepherdCycle(config)

    // Deferred task should NOT be marked as evaluated
    const evalCalls = mockUpdateTask.mock.calls.filter(
      (c) => c[1].shepherd_evaluated_at
    )
    // Only the non-deferred tasks get shepherd_evaluated_at
    // task-002 is not in branch_evaluations, so it gets evaluated
    // task-001 is DEFER, so it does NOT get evaluated
    const deferredEvals = evalCalls.filter((c) => c[0] === 'task-001-aaa-bbb-ccc')
    expect(deferredEvals.length).toBe(0)
  })

  test('Bug 3: dispatch call includes taskId for process registration', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('t1'), makeTask('t2')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput(),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    expect(mockDispatchFn).toHaveBeenCalledTimes(1)
    const dispatchOptions = mockDispatchFn.mock.calls[0][0]
    // taskId should be set to the run ID for process registration
    expect(dispatchOptions.taskId).toBe('run-test-001')
  })

  test('task summaries include worktree_path when available', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [
      makeTask('task-001-aaa-bbb-ccc', {
        branch_name: 'mycel/task-task-001',
        worktree_path: '/home/test/.mycelium/worktrees/task-task-001',
      }),
      makeTask('task-002-ddd-eee-fff'),
    ]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput(),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    const dispatchCall = mockDispatchFn.mock.calls[0][0]
    // The prompt should contain the worktree path
    expect(dispatchCall.prompt).toContain('/home/test/.mycelium/worktrees/task-task-001')
  })

  test('task summaries include github_pr_number when available', async () => {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [
      makeTask('task-001-aaa-bbb-ccc', {
        branch_name: 'mycel/task-task-001',
        github_pr_number: 42,
        github_pr_url: 'https://github.com/user/repo/pull/42',
      }),
      makeTask('task-002-ddd-eee-fff'),
    ]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async () => ({
      success: true,
      output: makeEvalOutput(),
      exit_code: 0,
      duration_seconds: 60,
    }))

    await runShepherdCycle(config)

    const dispatchCall = mockDispatchFn.mock.calls[0][0]
    expect(dispatchCall.prompt).toContain('#42')
    expect(dispatchCall.prompt).toContain('https://github.com/user/repo/pull/42')
  })
})

// =============================================================================
// XML Parser Features
// =============================================================================

describe('runShepherdCycle - XML parser features', () => {
  beforeEach(resetAllMocks)

  function setupForEvaluation(evalOutput: string) {
    const config = configFixture({ shepherd_batch_size: 2 })
    const repo = makeRepo()
    mockGetRepos.mockImplementation(async () => [repo])

    const tasks = [makeTask('task-001'), makeTask('task-002')]
    mockGetUnevaluatedTasks.mockImplementation(async () => tasks)

    mockDispatchFn.mockImplementation(async (options: any) => {
      if (options.onOutput) options.onOutput(evalOutput, 'stdout')
      return {
        success: true,
        output: evalOutput,
        exit_code: 0,
        duration_seconds: 60,
      }
    })

    return { config, tasks }
  }

  test('parses per-task files, commits, and tests in branch evaluation', async () => {
    const output = makeEvalOutput({
      headline: 'Rich evaluation',
      branch_evaluations: [{
        task_id: 'task-001',
        decision: 'MERGE',
        reason: 'Good code with tests',
        confidence: 0.95,
        merge_order: 1,
        agent: 'claude/sonnet',
        files_modified: ['src/auth.ts', 'src/config.ts'],
        files_created: ['src/middleware/jwt.ts'],
        tests: { passed: 12, failed: 0, skipped: 1 },
        commits: [
          { hash: 'abc1234', message: 'feat: add auth' },
          { hash: 'def5678', message: 'test: add auth tests' },
        ],
      }],
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    expect(mockCreateShepherdEvaluation).toHaveBeenCalledTimes(1)
    const evalArg = mockCreateShepherdEvaluation.mock.calls[0][0]
    const be = evalArg.branch_evaluations?.[0]
    expect(be).toBeDefined()
    expect(be.task_id).toBe('task-001')
    expect(be.decision).toBe('MERGE')
    expect(be.confidence).toBe(0.95)
    expect(be.agent).toBe('claude/sonnet')
    expect(be.files_modified).toEqual(['src/auth.ts', 'src/config.ts'])
    expect(be.files_created).toEqual(['src/middleware/jwt.ts'])
    expect(be.tests).toEqual({ passed: 12, failed: 0, skipped: 1 })
    expect(be.commits).toEqual([
      { hash: 'abc1234', message: 'feat: add auth' },
      { hash: 'def5678', message: 'test: add auth tests' },
    ])
  })

  test('parses confidence scores on evaluations', async () => {
    const output = makeEvalOutput({
      headline: 'Confidence test',
      branch_evaluations: [{
        task_id: 'task-001',
        decision: 'DEFER',
        reason: 'Uncertain about approach',
        confidence: 0.45,
      }],
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    const evalArg = mockCreateShepherdEvaluation.mock.calls[0][0]
    expect(evalArg.branch_evaluations[0].confidence).toBe(0.45)
  })

  test('parses per-evaluation patterns and warnings', async () => {
    const output = makeEvalOutput({
      headline: 'Per-task patterns',
      patterns: [{ content: 'Global pattern', tags: ['global'] }],
      branch_evaluations: [{
        task_id: 'task-001',
        decision: 'MERGE',
        reason: 'Good work',
        patterns: [{ content: 'Task-specific pattern', tags: ['auth', 'jwt'] }],
        warnings: [{ content: 'Minor issue', severity: 'low' }],
      }],
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    // Global pattern stored
    expect(mockCreatePattern).toHaveBeenCalled()
    const patternCalls = mockCreatePattern.mock.calls.map(c => c[0])

    // Global pattern
    const globalPattern = patternCalls.find(p => p.content === 'Global pattern')
    expect(globalPattern).toBeDefined()
    expect(globalPattern.tags).toEqual(['global'])

    // Per-task pattern (has task: tag added)
    const taskPattern = patternCalls.find(p => p.content === 'Task-specific pattern')
    expect(taskPattern).toBeDefined()
    expect(taskPattern.tags).toContain('auth')
    expect(taskPattern.tags).toContain('jwt')
    expect(taskPattern.tags).toContain('task:task-001')

    // Per-task warning
    const warningCalls = mockCreateWarning.mock.calls.map(c => c[0])
    const taskWarning = warningCalls.find(w => w.content === 'Minor issue')
    expect(taskWarning).toBeDefined()
    expect(taskWarning.severity).toBe('low')
  })

  test('parses agent feedback', async () => {
    const output = makeEvalOutput({
      headline: 'Agent feedback test',
      agent_feedback: [
        { agent: 'claude/sonnet', best_for: 'Complex refactoring', avoid_for: 'Simple one-liners' },
        { agent: 'codex/gpt-4', best_for: 'Quick fixes' },
      ],
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    // Should call upsertAgentHealth for each agent feedback
    expect(mockUpsertAgentHealth).toHaveBeenCalledTimes(2)

    const call1 = mockUpsertAgentHealth.mock.calls[0]
    expect(call1[0]).toBe('claude')  // agent name (split on /)
    const data1 = call1[1]
    expect(JSON.parse(data1.best_for)).toContain('Complex refactoring')
    expect(JSON.parse(data1.avoid_for)).toContain('Simple one-liners')

    const call2 = mockUpsertAgentHealth.mock.calls[1]
    expect(call2[0]).toBe('codex')
    expect(JSON.parse(call2[1].best_for)).toContain('Quick fixes')
  })

  test('falls back to YAML when no XML present', async () => {
    const output = makeYamlEvalOutput({
      health: 'warning',
      headline: 'YAML fallback test',
      concerns: ['Still works with YAML'],
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    expect(mockCreateShepherdEvaluation).toHaveBeenCalledTimes(1)
    const evalArg = mockCreateShepherdEvaluation.mock.calls[0][0]
    expect(evalArg.health).toBe('warning')
    expect(evalArg.headline).toBe('YAML fallback test')
    expect(evalArg.concerns).toEqual(['Still works with YAML'])
  })

  test('handles malformed XML gracefully', async () => {
    // Incomplete XML - no closing tag
    const output = '<shepherd_result health="healthy"><headline>Broken'

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    // Should not create evaluation (both XML and YAML fail)
    expect(mockCreateShepherdEvaluation).not.toHaveBeenCalled()
    // But should still mark tasks as evaluated
    expect(mockUpdateTask).toHaveBeenCalled()
  })

  test('handles evaluation with only decision and reason (no files/commits)', async () => {
    const output = makeEvalOutput({
      headline: 'Minimal evaluation',
      branch_evaluations: [{
        task_id: 'task-001',
        decision: 'REJECT',
        reason: 'Not needed',
      }],
    })

    const { config } = setupForEvaluation(output)
    await runShepherdCycle(config)

    const evalArg = mockCreateShepherdEvaluation.mock.calls[0][0]
    const be = evalArg.branch_evaluations[0]
    expect(be.task_id).toBe('task-001')
    expect(be.decision).toBe('REJECT')
    expect(be.reason).toBe('Not needed')
    expect(be.confidence).toBeUndefined()
    expect(be.files_modified).toBeUndefined()
    expect(be.files_created).toBeUndefined()
    expect(be.tests).toBeUndefined()
    expect(be.commits).toBeUndefined()
  })
})

/**
 * Shepherd cycle tests.
 *
 * Tests batch threshold, YAML evaluation parsing, branch processing,
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

/** Build a YAML evaluation output that parseShepherdOutput can parse */
function makeEvalOutput(overrides: {
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
  const parts: string[] = []

  parts.push('Here is my evaluation:\n')
  parts.push('```yaml')
  parts.push(`health: ${health}`)
  parts.push(`headline: "${headline}"`)

  if (overrides.concerns && overrides.concerns.length > 0) {
    parts.push('concerns:')
    for (const c of overrides.concerns) parts.push(`  - "${c}"`)
  }
  if (overrides.wins && overrides.wins.length > 0) {
    parts.push('wins:')
    for (const w of overrides.wins) parts.push(`  - "${w}"`)
  }
  if (overrides.recommendation) {
    parts.push(`recommendation: "${overrides.recommendation}"`)
  }
  if (overrides.patterns && overrides.patterns.length > 0) {
    parts.push('patterns:')
    for (const p of overrides.patterns) {
      parts.push(`  - content: "${p.content}"`)
      if (p.tags && p.tags.length > 0) {
        parts.push('    tags:')
        for (const t of p.tags) parts.push(`      - "${t}"`)
      }
    }
  }
  if (overrides.warnings && overrides.warnings.length > 0) {
    parts.push('warnings:')
    for (const w of overrides.warnings) {
      parts.push(`  - content: "${w.content}"`)
      if (w.severity) parts.push(`    severity: ${w.severity}`)
    }
  }
  if (overrides.branch_evaluations && overrides.branch_evaluations.length > 0) {
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

  function setupWithBranches(branchEvals: Array<{ task_id: string; decision: string; reason: string; merge_order?: number }>) {
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

/**
 * Max Alignment cycle tests.
 *
 * Tests trigger threshold, XML output parsing, memory recording,
 * SSE broadcasts, telegram notifications, and error handling.
 * Heavy dependencies (dispatch, DB queries, SSE, telegram) are mocked.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { configFixture, repoFixture, resetFixtureCounters } from '../../__tests__/helpers/fixtures'

// =============================================================================
// Mock all heavy dependencies before importing max-alignment
// =============================================================================

// Mock queries
const mockGetRepos = mock(async () => [] as any[])
const mockGetTasks = mock(async (_opts?: any) => [] as any[])
const mockCreateRun = mock(async (_input: any) => ({ id: 'run-max-001', status: 'running' }))
const mockCompleteRun = mock(async (_id: string, _output?: string) => {})
const mockFailRun = mock(async (_id: string, _error: string) => {})
const mockCreatePattern = mock(async (_input: any) => ({ id: 'pattern-001' }))
const mockCreateWarning = mock(async (_input: any) => ({ id: 'warning-001' }))
const mockCreateFruitingSession = mock(async (_input: any) => ({ id: 'session-001' }))

mock.module('../../db/queries', () => ({
  getRepos: mockGetRepos,
  getTasks: mockGetTasks,
  createRun: mockCreateRun,
  completeRun: mockCompleteRun,
  failRun: mockFailRun,
  createPattern: mockCreatePattern,
  createWarning: mockCreateWarning,
  createFruitingSession: mockCreateFruitingSession,
}))

// Mock dispatch
const mockDispatchFn = mock(async (_options: any) => ({
  success: true,
  output: 'No output',
  exit_code: 0,
  duration_seconds: 120,
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
  buildMycelContext: mock(() => '## Mock Max Alignment Context'),
  buildMcpSection: mock(() => ''),
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
  formatMaxAlignmentReport: mock((_report: any) => 'max alignment report'),
}))

// Mock active runs
const mockRegisterActiveRun = mock((_run: any) => {})
const mockUnregisterActiveRun = mock((_runId: string) => {})
const mockIsMaxAlignmentRunningForRepo = mock((_repoPath: string) => false)

mock.module('../active-runs', () => ({
  registerActiveRun: mockRegisterActiveRun,
  unregisterActiveRun: mockUnregisterActiveRun,
  isMaxAlignmentRunningForRepo: mockIsMaxAlignmentRunningForRepo,
}))

// Mock DB for shouldRunMaxAlignment
const mockSqlitePrepare = mock((_sql: string) => ({
  get: mock((..._args: any[]) => ({ eval_count: 0 })),
}))

mock.module('../../db', () => ({
  getRawSqlite: mock(() => ({
    prepare: mockSqlitePrepare,
  })),
}))

// Now import the module under test
const { runMaxAlignmentCycle, parseMaxAlignmentOutput, shouldRunMaxAlignment } = await import('./max-alignment')

// =============================================================================
// Helpers
// =============================================================================

function makeRepo(path = '/home/test/repo', name = 'test-repo') {
  return repoFixture({ path, name })
}

/** Build an XML max alignment output that parseMaxAlignmentOutput can parse */
function makeAlignmentOutput(overrides: {
  health?: string
  headline?: string
  build?: { status: string; summary: string }
  tests?: { status: string; count?: number; passing?: number; failing?: number }
  runtime?: { status: string; summary: string }
  critical_bugs?: Array<{ file: string; line?: number; description: string }>
  claude_md?: { action: string; summary: string }
  readme_md?: { action: string; summary: string }
  deleted_files?: Array<{ path: string; reason: string }>
  deleted_branches?: string[]
  working_tree?: string
  remote_sync?: { status: string; details?: string }
  branch_count?: { total: number; stale: number }
  vision?: { assessment: string; drift?: string }
  patterns?: Array<{ content: string; tags?: string[] }>
  warnings?: Array<{ content: string; severity?: string }>
} = {}): string {
  const health = overrides.health ?? 'healthy'
  const headline = overrides.headline ?? 'Repo is in good shape'
  const parts: string[] = ['Here is my alignment audit:\n']

  parts.push(`<max_alignment_result health="${health}">`)
  parts.push(`  <headline>${headline}</headline>`)

  // Runtime check
  if (overrides.build || overrides.tests || overrides.runtime || overrides.critical_bugs) {
    parts.push('  <runtime_check>')
    if (overrides.build) {
      parts.push(`    <build status="${overrides.build.status}">${overrides.build.summary}</build>`)
    }
    if (overrides.tests) {
      const attrs = [`status="${overrides.tests.status}"`]
      if (overrides.tests.count != null) attrs.push(`count="${overrides.tests.count}"`)
      if (overrides.tests.passing != null) attrs.push(`passing="${overrides.tests.passing}"`)
      if (overrides.tests.failing != null) attrs.push(`failing="${overrides.tests.failing}"`)
      parts.push(`    <tests ${attrs.join(' ')}/>`)
    }
    if (overrides.runtime) {
      parts.push(`    <runtime status="${overrides.runtime.status}">${overrides.runtime.summary}</runtime>`)
    }
    if (overrides.critical_bugs?.length) {
      parts.push('    <critical_bugs>')
      for (const bug of overrides.critical_bugs) {
        const attrs = [`file="${bug.file}"`]
        if (bug.line != null) attrs.push(`line="${bug.line}"`)
        parts.push(`      <bug ${attrs.join(' ')}>${bug.description}</bug>`)
      }
      parts.push('    </critical_bugs>')
    }
    parts.push('  </runtime_check>')
  }

  // Documentation
  if (overrides.claude_md || overrides.readme_md) {
    parts.push('  <documentation>')
    if (overrides.claude_md) {
      parts.push(`    <claude_md action="${overrides.claude_md.action}">${overrides.claude_md.summary}</claude_md>`)
    }
    if (overrides.readme_md) {
      parts.push(`    <readme_md action="${overrides.readme_md.action}">${overrides.readme_md.summary}</readme_md>`)
    }
    parts.push('  </documentation>')
  }

  // Cleanup
  if (overrides.deleted_files?.length || overrides.deleted_branches?.length) {
    parts.push('  <cleanup>')
    if (overrides.deleted_files?.length) {
      parts.push('    <deleted_files>')
      for (const f of overrides.deleted_files) {
        parts.push(`      <file reason="${f.reason}">${f.path}</file>`)
      }
      parts.push('    </deleted_files>')
    }
    if (overrides.deleted_branches?.length) {
      parts.push('    <deleted_branches>')
      for (const b of overrides.deleted_branches) {
        parts.push(`      <branch>${b}</branch>`)
      }
      parts.push('    </deleted_branches>')
    }
    parts.push('  </cleanup>')
  }

  // Git health
  if (overrides.working_tree || overrides.remote_sync || overrides.branch_count) {
    parts.push('  <git_health>')
    if (overrides.working_tree) {
      parts.push(`    <working_tree status="${overrides.working_tree}"/>`)
    }
    if (overrides.remote_sync) {
      const details = overrides.remote_sync.details ? ` details="${overrides.remote_sync.details}"` : ''
      parts.push(`    <remote_sync status="${overrides.remote_sync.status}"${details}/>`)
    }
    if (overrides.branch_count) {
      parts.push(`    <branch_count total="${overrides.branch_count.total}" stale="${overrides.branch_count.stale}"/>`)
    }
    parts.push('  </git_health>')
  }

  // Vision alignment
  if (overrides.vision) {
    parts.push('  <vision_alignment>')
    parts.push(`    <assessment>${overrides.vision.assessment}</assessment>`)
    if (overrides.vision.drift) {
      parts.push(`    <drift>${overrides.vision.drift}</drift>`)
    }
    parts.push('  </vision_alignment>')
  }

  // Patterns
  if (overrides.patterns?.length) {
    parts.push('  <patterns>')
    for (const p of overrides.patterns) {
      const tagsAttr = p.tags?.length ? ` tags="${p.tags.join(',')}"` : ''
      parts.push(`    <pattern${tagsAttr}>${p.content}</pattern>`)
    }
    parts.push('  </patterns>')
  }

  // Warnings
  if (overrides.warnings?.length) {
    parts.push('  <warnings>')
    for (const w of overrides.warnings) {
      const sevAttr = w.severity ? ` severity="${w.severity}"` : ''
      parts.push(`    <warning${sevAttr}>${w.content}</warning>`)
    }
    parts.push('  </warnings>')
  }

  parts.push('</max_alignment_result>')
  return parts.join('\n')
}

function resetAllMocks() {
  resetFixtureCounters()
  mockGetRepos.mockReset()
  mockGetTasks.mockReset()
  mockCreateRun.mockReset()
  mockCompleteRun.mockReset()
  mockFailRun.mockReset()
  mockCreatePattern.mockReset()
  mockCreateWarning.mockReset()
  mockCreateFruitingSession.mockReset()
  mockDispatchFn.mockReset()
  mockBroadcastFn.mockReset()
  mockTelegramSendMessage.mockReset()
  mockTelegramConnected.mockReset()
  mockTelegramSendMessage.mockReset()
  mockRegisterActiveRun.mockReset()
  mockUnregisterActiveRun.mockReset()
  mockIsMaxAlignmentRunningForRepo.mockReset()

  // Restore defaults
  mockGetRepos.mockImplementation(async () => [])
  mockGetTasks.mockImplementation(async () => [])
  mockCreateRun.mockImplementation(async () => ({ id: 'run-max-001', status: 'running' }))
  mockCompleteRun.mockImplementation(async () => {})
  mockFailRun.mockImplementation(async () => {})
  mockCreatePattern.mockImplementation(async () => ({ id: 'pattern-001' }))
  mockCreateWarning.mockImplementation(async () => ({ id: 'warning-001' }))
  mockCreateFruitingSession.mockImplementation(async () => ({ id: 'session-001' }))
  mockDispatchFn.mockImplementation(async () => ({
    success: true,
    output: 'No output',
    exit_code: 0,
    duration_seconds: 120,
  }))
  mockTelegramConnected.mockImplementation(() => true)
  mockTelegramSendMessage.mockImplementation(async () => {})
  mockIsMaxAlignmentRunningForRepo.mockImplementation(() => false)
}

// =============================================================================
// Tests
// =============================================================================

describe('Max Alignment Cycle', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  // ===========================================================================
  // XML Parsing
  // ===========================================================================

  describe('parseMaxAlignmentOutput', () => {
    test('parses minimal healthy output', () => {
      const output = makeAlignmentOutput()
      const result = parseMaxAlignmentOutput(output)

      expect(result).not.toBeNull()
      expect(result!.health).toBe('healthy')
      expect(result!.headline).toBe('Repo is in good shape')
    })

    test('parses full output with all sections', () => {
      const output = makeAlignmentOutput({
        health: 'warning',
        headline: 'Some issues found',
        build: { status: 'pass', summary: 'Build succeeded' },
        tests: { status: 'fail', count: 50, passing: 48, failing: 2 },
        runtime: { status: 'fail', summary: 'Server crashes on startup' },
        critical_bugs: [
          { file: 'src/server.ts', line: 42, description: 'Null pointer on config load' },
          { file: 'src/db.ts', description: 'Missing migration' },
        ],
        claude_md: { action: 'rewritten', summary: 'Removed 200 lines of changelog' },
        readme_md: { action: 'flagged', summary: 'Claims v2.0 but still on v1' },
        deleted_files: [
          { path: '.mycel/sessions/old.json', reason: 'agent cruft' },
          { path: 'AGENT_FINDINGS.md', reason: 'slop file' },
        ],
        deleted_branches: ['mycel/task-abc123', 'mycel/task-def456'],
        working_tree: 'clean',
        remote_sync: { status: 'ahead', details: '3 commits ahead' },
        branch_count: { total: 12, stale: 5 },
        vision: { assessment: 'Repo mostly aligned', drift: 'README claims production ready but tests fail' },
        patterns: [
          { content: 'Agents leave .mycel dirs', tags: ['cleanup', 'hygiene'] },
        ],
        warnings: [
          { content: 'Tests flaky on CI', severity: 'high' },
          { content: 'No .gitignore for build artifacts', severity: 'medium' },
        ],
      })

      const result = parseMaxAlignmentOutput(output)
      expect(result).not.toBeNull()
      expect(result!.health).toBe('warning')
      expect(result!.headline).toBe('Some issues found')

      // Runtime check
      expect(result!.runtime_check?.build?.status).toBe('pass')
      expect(result!.runtime_check?.build?.summary).toBe('Build succeeded')
      expect(result!.runtime_check?.tests?.status).toBe('fail')
      expect(result!.runtime_check?.tests?.count).toBe(50)
      expect(result!.runtime_check?.tests?.passing).toBe(48)
      expect(result!.runtime_check?.tests?.failing).toBe(2)
      expect(result!.runtime_check?.runtime?.status).toBe('fail')
      expect(result!.runtime_check?.critical_bugs).toHaveLength(2)
      expect(result!.runtime_check?.critical_bugs![0].file).toBe('src/server.ts')
      expect(result!.runtime_check?.critical_bugs![0].line).toBe(42)
      expect(result!.runtime_check?.critical_bugs![1].file).toBe('src/db.ts')
      expect(result!.runtime_check?.critical_bugs![1].line).toBeUndefined()

      // Documentation
      expect(result!.documentation?.claude_md?.action).toBe('rewritten')
      expect(result!.documentation?.readme_md?.action).toBe('flagged')

      // Cleanup
      expect(result!.cleanup?.deleted_files).toHaveLength(2)
      expect(result!.cleanup?.deleted_files![0].path).toBe('.mycel/sessions/old.json')
      expect(result!.cleanup?.deleted_branches).toHaveLength(2)

      // Git health
      expect(result!.git_health?.working_tree?.status).toBe('clean')
      expect(result!.git_health?.remote_sync?.status).toBe('ahead')
      expect(result!.git_health?.remote_sync?.details).toBe('3 commits ahead')
      expect(result!.git_health?.branch_count?.total).toBe(12)
      expect(result!.git_health?.branch_count?.stale).toBe(5)

      // Vision alignment
      expect(result!.vision_alignment?.assessment).toBe('Repo mostly aligned')
      expect(result!.vision_alignment?.drift).toBe('README claims production ready but tests fail')

      // Patterns and warnings
      expect(result!.patterns).toHaveLength(1)
      expect(result!.patterns![0].content).toBe('Agents leave .mycel dirs')
      expect(result!.patterns![0].tags).toEqual(['cleanup', 'hygiene'])
      expect(result!.warnings).toHaveLength(2)
      expect(result!.warnings![0].severity).toBe('high')
    })

    test('returns null for output without XML block', () => {
      const result = parseMaxAlignmentOutput('No XML here, just text')
      expect(result).toBeNull()
    })

    test('parses critical health status', () => {
      const output = makeAlignmentOutput({
        health: 'critical',
        headline: 'Repo is completely broken',
      })
      const result = parseMaxAlignmentOutput(output)
      expect(result!.health).toBe('critical')
    })

    test('handles missing optional sections', () => {
      const output = makeAlignmentOutput({
        health: 'healthy',
        headline: 'Clean repo',
      })
      const result = parseMaxAlignmentOutput(output)
      expect(result!.runtime_check).toBeUndefined()
      expect(result!.documentation).toBeUndefined()
      expect(result!.cleanup).toBeUndefined()
      expect(result!.git_health).toBeUndefined()
      expect(result!.patterns).toBeUndefined()
      expect(result!.warnings).toBeUndefined()
    })
  })

  // ===========================================================================
  // Cycle Execution
  // ===========================================================================

  describe('runMaxAlignmentCycle', () => {
    test('skips when no repos registered', async () => {
      mockGetRepos.mockResolvedValue([])
      const config = configFixture()

      await runMaxAlignmentCycle(config)

      expect(mockDispatchFn).not.toHaveBeenCalled()
    })

    test('skips repo already being audited', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockIsMaxAlignmentRunningForRepo.mockReturnValue(true)

      await runMaxAlignmentCycle(configFixture(), repo.path)

      expect(mockDispatchFn).not.toHaveBeenCalled()
    })

    test('dispatches agent and records results on success', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])

      const alignmentXml = makeAlignmentOutput({
        health: 'healthy',
        headline: 'All good',
        patterns: [{ content: 'Good test coverage', tags: ['testing'] }],
        warnings: [{ content: 'Outdated deps', severity: 'low' }],
      })
      mockDispatchFn.mockResolvedValue({
        success: true,
        output: alignmentXml,
        exit_code: 0,
        duration_seconds: 300,
      })

      // Manual trigger (specificRepo set) bypasses shouldRunMaxAlignment
      await runMaxAlignmentCycle(configFixture(), repo.path)

      // Verify dispatch was called
      expect(mockDispatchFn).toHaveBeenCalledTimes(1)
      const dispatchArgs = mockDispatchFn.mock.calls[0][0]
      expect(dispatchArgs.agent).toBe('claude')
      expect(dispatchArgs.model).toBe('opus')
      expect(dispatchArgs.cwd).toBe(repo.path)
      expect(dispatchArgs.timeout).toBe(2400)
      expect(dispatchArgs.extraEnv?.GIT_AUTHOR_NAME).toContain('max-alignment')

      // Verify run lifecycle
      expect(mockCreateRun).toHaveBeenCalledTimes(1)
      expect(mockCompleteRun).toHaveBeenCalledTimes(1)
      expect(mockFailRun).not.toHaveBeenCalled()

      // Verify active run tracking
      expect(mockRegisterActiveRun).toHaveBeenCalledTimes(1)
      expect(mockUnregisterActiveRun).toHaveBeenCalledTimes(1)

      // Verify patterns and warnings stored
      expect(mockCreatePattern).toHaveBeenCalledTimes(1)
      expect(mockCreatePattern.mock.calls[0][0].content).toBe('Good test coverage')
      expect(mockCreatePattern.mock.calls[0][0].source).toBe('max_alignment')
      expect(mockCreateWarning).toHaveBeenCalledTimes(1)
      expect(mockCreateWarning.mock.calls[0][0].content).toBe('Outdated deps')

      // Verify session recorded
      expect(mockCreateFruitingSession).toHaveBeenCalledTimes(1)

      // Verify SSE broadcasts
      const broadcastCalls = mockBroadcastFn.mock.calls
      const startEvent = broadcastCalls.find(([ev]) => ev === 'max_alignment:started')
      expect(startEvent).toBeTruthy()
      const completeEvent = broadcastCalls.find(([ev]) => ev === 'max_alignment:completed')
      expect(completeEvent).toBeTruthy()
      expect((completeEvent![1] as any).health).toBe('healthy')
    })

    test('records failure when dispatch fails', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])
      mockDispatchFn.mockResolvedValue({
        success: false,
        output: 'Agent timed out',
        exit_code: 1,
        duration_seconds: 2400,
      })

      await runMaxAlignmentCycle(configFixture(), repo.path)

      expect(mockFailRun).toHaveBeenCalledTimes(1)
      expect(mockCompleteRun).not.toHaveBeenCalled()

      const failedEvent = mockBroadcastFn.mock.calls.find(([ev]) => ev === 'agent:failed')
      expect(failedEvent).toBeTruthy()
    })

    test('handles dispatch exception gracefully', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])
      mockDispatchFn.mockRejectedValue(new Error('Connection refused'))

      await runMaxAlignmentCycle(configFixture(), repo.path)

      expect(mockFailRun).toHaveBeenCalledTimes(1)
      expect(mockUnregisterActiveRun).toHaveBeenCalledTimes(1)
    })

    test('stores critical bugs as high-severity warnings', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])

      const output = makeAlignmentOutput({
        health: 'critical',
        headline: 'Runtime broken',
        critical_bugs: [
          { file: 'src/main.ts', line: 10, description: 'Import error' },
        ],
      })
      mockDispatchFn.mockResolvedValue({
        success: true,
        output,
        exit_code: 0,
        duration_seconds: 200,
      })

      await runMaxAlignmentCycle(configFixture(), repo.path)

      // Critical bugs become high-severity warnings
      const warningCalls = mockCreateWarning.mock.calls
      expect(warningCalls.length).toBeGreaterThanOrEqual(1)
      const bugWarning = warningCalls.find(([input]) => input.content.includes('CRITICAL BUG'))
      expect(bugWarning).toBeTruthy()
      expect(bugWarning![0].severity).toBe('high')
    })

    test('broadcasts CLAUDE.md rewrite event', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])

      const output = makeAlignmentOutput({
        claude_md: { action: 'rewritten', summary: 'Trimmed from 300 to 100 lines' },
      })
      mockDispatchFn.mockResolvedValue({
        success: true,
        output,
        exit_code: 0,
        duration_seconds: 200,
      })

      await runMaxAlignmentCycle(configFixture(), repo.path)

      const rewriteEvent = mockBroadcastFn.mock.calls.find(([ev]) => ev === 'max_alignment:claude_md_rewritten')
      expect(rewriteEvent).toBeTruthy()
      expect((rewriteEvent![1] as any).summary).toBe('Trimmed from 300 to 100 lines')
    })

    test('broadcasts cleanup event when files/branches deleted', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])

      const output = makeAlignmentOutput({
        deleted_files: [{ path: 'SLOP.md', reason: 'slop' }],
        deleted_branches: ['mycel/task-old'],
      })
      mockDispatchFn.mockResolvedValue({
        success: true,
        output,
        exit_code: 0,
        duration_seconds: 200,
      })

      await runMaxAlignmentCycle(configFixture(), repo.path)

      const cleanupEvent = mockBroadcastFn.mock.calls.find(([ev]) => ev === 'max_alignment:cleanup')
      expect(cleanupEvent).toBeTruthy()
      expect((cleanupEvent![1] as any).deleted_files).toBe(1)
      expect((cleanupEvent![1] as any).deleted_branches).toBe(1)
    })

    test('broadcasts critical bug event', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])

      const output = makeAlignmentOutput({
        health: 'critical',
        headline: 'Broken',
        critical_bugs: [
          { file: 'src/app.ts', line: 1, description: 'Module not found' },
        ],
      })
      mockDispatchFn.mockResolvedValue({
        success: true,
        output,
        exit_code: 0,
        duration_seconds: 200,
      })

      await runMaxAlignmentCycle(configFixture(), repo.path)

      const bugEvent = mockBroadcastFn.mock.calls.find(([ev]) => ev === 'max_alignment:critical_bug_found')
      expect(bugEvent).toBeTruthy()
      expect((bugEvent![1] as any).bug_count).toBe(1)
    })

    test('sends telegram notification', async () => {
      const repo = makeRepo()
      mockGetRepos.mockResolvedValue([repo])
      mockGetTasks.mockResolvedValue([])

      const output = makeAlignmentOutput({ health: 'healthy', headline: 'All good' })
      mockDispatchFn.mockResolvedValue({
        success: true,
        output,
        exit_code: 0,
        duration_seconds: 200,
      })

      await runMaxAlignmentCycle(configFixture(), repo.path)

      expect(mockTelegramSendMessage).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // Prompt Building
  // ===========================================================================

  describe('buildMaxAlignmentPrompt', () => {
    test('includes repo info and recent tasks', async () => {
      const { buildMaxAlignmentPrompt } = await import('../../prompts/max-alignment')

      const prompt = buildMaxAlignmentPrompt({
        repo: { path: '/home/test/repo', name: 'test-repo', description: 'A test project' },
        recentTasks: [
          { id: 'task-001', title: 'Add auth', status: 'done', agent: 'claude', model: 'sonnet', completed_at: new Date().toISOString() },
          { id: 'task-002', title: 'Fix CSS', status: 'failed', agent: 'cursor', model: 'opus', completed_at: new Date().toISOString() },
        ],
        mycelContext: '## Test Context',
        mcpSection: '## MCP Servers\n- playwright',
        memorySection: '## Memory\n- Pattern: use bun',
      })

      expect(prompt).toContain('test-repo')
      expect(prompt).toContain('/home/test/repo')
      expect(prompt).toContain('A test project')
      expect(prompt).toContain('Add auth')
      expect(prompt).toContain('Fix CSS')
      expect(prompt).toContain('## Test Context')
      expect(prompt).toContain('## MCP Servers')
      expect(prompt).toContain('## Memory')
    })
  })
})

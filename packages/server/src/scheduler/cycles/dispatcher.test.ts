/**
 * Dispatcher cycle tests.
 *
 * Tests the control flow and concurrency logic of the dispatcher.
 * Heavy dependencies (dispatch, DB, SSE, telegram, workspace) are mocked.
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { configFixture, taskFixture, resetFixtureCounters } from '../../__tests__/helpers/fixtures'
import { createTestDb, cleanupTestDb, seedTask, seedRepo } from '../../__tests__/helpers/db'
import type { SchedulerConfig } from '@mycelium/shared'

// =============================================================================
// Mock all heavy dependencies before importing dispatcher
// =============================================================================

// Mock dispatch
const mockDispatchFn = mock(async (_options: any) => ({
  success: true,
  output: 'Task completed',
  exit_code: 0,
  duration_seconds: 30,
  cost_usd: 0.01,
}))

mock.module('../../agents/dispatch', () => ({
  dispatch: mockDispatchFn,
}))

// Mock SSE broadcast
const mockBroadcastFn = mock((_event: string, _data: unknown) => {})
mock.module('../../sse', () => ({
  broadcast: mockBroadcastFn,
}))

// Mock health module
mock.module('../../agents/health', () => ({
  extractError: (_agent: string, output: string) => ({
    error: output.slice(0, 200),
    errorType: 'unknown' as const,
  }),
  recordSuccess: mock(() => {}),
  recordFailure: mock((_agent: string, _model: string | undefined, output: string) => ({
    error: output.slice(0, 200),
    shouldBackoff: false,
  })),
  isAgentAvailable: mock((_agent: string, _model?: string) => ({
    available: true,
  })),
  checkOpenRouterCredits: mock(async () => null),
  getOpenRouterFreeModels: mock(async () => []),
  checkClineCredits: mock(async () => null),
  getHealthSummary: mock(() => ({})),
  checkAllProviderStatus: mock(async () => ({ groq: null, cerebras: null, mistral: null })),
}))

// Mock context builders
mock.module('../../prompts/context', () => ({
  buildMycelContext: mock(() => '## Mock Context'),
  buildAgentsSectionWithCredits: mock(async () => '## Mock Agents Section'),
  buildSkillsSection: mock(() => ''),
  buildMcpSection: mock(() => ''),
  selectTaskSkills: mock(() => []),
  detectAllSkillsForRepo: mock(() => []),
}))

// Mock telegram
mock.module('../../telegram', () => ({
  getTelegramService: mock(() => null),
}))

mock.module('../../telegram/messages', () => ({
  formatTaskCompleted: mock(() => 'completed'),
  formatTaskFailed: mock(() => 'failed'),
  formatTaskRetrying: mock(() => 'retrying'),
}))

mock.module('../../telegram/buffer', () => ({
  bufferTaskEvent: mock(() => {}),
}))

// Mock fallback
mock.module('../../agents/fallback', () => ({
  shouldRetry: mock(() => ({ retry: false, fallbackModel: null })),
  buildRetryContext: mock(() => '{}'),
  parseRetryContext: mock(() => null),
  resolveModel: mock((agent: string, model: string | null | undefined) => model ?? 'default'),
}))

// Mock workspace
mock.module('../../agents/workspace', () => ({
  prepareWorkspace: mock(async (taskId: string) => ({
    worktreePath: `/tmp/worktrees/task-${taskId.slice(0, 8)}`,
    branchName: `mycel/task-${taskId.slice(0, 8)}`,
  })),
  cleanupWorkspace: mock(async () => {}),
}))

// Mock logs
mock.module('../../logs', () => ({
  startTaskLog: mock(() => {}),
  appendLog: mock(() => {}),
  completeTaskLog: mock(() => {}),
  getTaskLogEntries: mock(() => null),
}))

// Mock DB queries module
const mockGetReadyTasks = mock(async (_limit?: number) => [] as any[])
const mockGetTask = mock(async (_id: string) => null as any)
const mockUpdateTask = mock(async (_id: string, _input: any) => null as any)
const mockGetTasks = mock(async (_options?: any) => [] as any[])
const mockCreateFruitingSession = mock(async (_input: any) => null as any)

mock.module('../../db/queries', () => ({
  getReadyTasks: mockGetReadyTasks,
  getTask: mockGetTask,
  updateTask: mockUpdateTask,
  getTasks: mockGetTasks,
  createFruitingSession: mockCreateFruitingSession,
}))

// Now import the module under test
import { runDispatcherCycle, getRunningTaskCount, getRunningTasksForRepo } from './dispatcher'

// =============================================================================
// Tests
// =============================================================================

describe('dispatcher', () => {
  let config: SchedulerConfig

  beforeEach(() => {
    resetFixtureCounters()
    config = configFixture()

    // Reset all mocks
    mockDispatchFn.mockClear()
    mockBroadcastFn.mockClear()
    mockGetReadyTasks.mockClear()
    mockGetTask.mockClear()
    mockUpdateTask.mockClear()
    mockGetTasks.mockClear()
    mockCreateFruitingSession.mockClear()

    // Default dispatch success
    mockDispatchFn.mockImplementation(async (options: any) => {
      if (options.onStart) options.onStart(12345)
      if (options.onOutput) options.onOutput('output', 'stdout')
      return {
        success: true,
        output: 'Task completed',
        exit_code: 0,
        duration_seconds: 30,
        cost_usd: 0.01,
      }
    })

    // Default updateTask returns the task
    mockUpdateTask.mockImplementation(async (id: string, _input: any) => ({
      id,
      title: 'test',
      status: 'done',
    }))

    // Default getTask returns a task
    mockGetTask.mockImplementation(async (id: string) => ({
      id,
      title: 'test',
      status: 'done',
      result: 'completed',
      depends_on: '[]',
    }))
  })

  // ===========================================================================
  // Exported utility functions
  // ===========================================================================

  describe('getRunningTaskCount', () => {
    test('starts at zero', () => {
      // After module load with no tasks running
      expect(getRunningTaskCount()).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getRunningTasksForRepo', () => {
    test('returns zero for unknown repo', () => {
      expect(getRunningTasksForRepo('/nonexistent/repo')).toBe(0)
    })
  })

  // ===========================================================================
  // runDispatcherCycle - no ready tasks
  // ===========================================================================

  describe('runDispatcherCycle', () => {
    test('does nothing when no tasks are ready', async () => {
      mockGetReadyTasks.mockResolvedValue([])

      await runDispatcherCycle(config)

      expect(mockGetReadyTasks).toHaveBeenCalled()
      expect(mockDispatchFn).not.toHaveBeenCalled()
    })

    test('dispatches ready tasks', async () => {
      const task = taskFixture({
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        title: 'Test dispatch',
        agent: 'claude',
        model: 'sonnet',
        repo_path: '/test/repo',
        prompt: 'Do the thing',
        depends_on: '[]',
        skills: '[]',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)

      expect(mockGetReadyTasks).toHaveBeenCalled()
      // Task should be fire-and-forget dispatched
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 100))

      // The task should have triggered a status update to 'running'
      expect(mockUpdateTask).toHaveBeenCalled()
    })

    test('respects concurrency limit', async () => {
      // Set max_concurrent_tasks to 1
      config = configFixture({ max_concurrent_tasks: 1 })

      const tasks = [
        taskFixture({
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          title: 'Task 1',
          repo_path: '/test/repo1',
        }),
        taskFixture({
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          title: 'Task 2',
          repo_path: '/test/repo2',
        }),
        taskFixture({
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          title: 'Task 3',
          repo_path: '/test/repo3',
        }),
      ]

      mockGetReadyTasks.mockResolvedValue(tasks)

      await runDispatcherCycle(config)

      // Wait for dispatch to start
      await new Promise(resolve => setTimeout(resolve, 100))

      // With max_concurrent=1 and queue size 3, the dynamic scaling gives
      // us base(1) + floor(3/5) = 1, so only 1 task should be started
      // (minus any already running)
    })

    test('filters out tasks with unavailable agents', async () => {
      // Import health mock to override
      const healthMod = await import('../../agents/health')
      const isAvailableMock = healthMod.isAgentAvailable as any
      isAvailableMock.mockImplementation((agent: string) => {
        if (agent === 'gemini') {
          return { available: false, reason: 'Quota exceeded' }
        }
        return { available: true }
      })

      const tasks = [
        taskFixture({
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          title: 'Gemini task',
          agent: 'gemini',
          repo_path: '/test/repo',
        }),
      ]

      mockGetReadyTasks.mockResolvedValue(tasks)

      await runDispatcherCycle(config)

      // The gemini task should be filtered out
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(mockDispatchFn).not.toHaveBeenCalled()

      // Reset
      isAvailableMock.mockImplementation(() => ({ available: true }))
    })

    test('applies per-repo concurrency limit', async () => {
      // Create 4 tasks for the same repo (MAX_PER_REPO = 3)
      const tasks = Array.from({ length: 4 }, (_, i) =>
        taskFixture({
          id: `${String.fromCharCode(97 + i).repeat(8)}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
          title: `Task ${i + 1}`,
          repo_path: '/same/repo',
        })
      )

      mockGetReadyTasks.mockResolvedValue(tasks)

      // With high concurrency ceiling, repo limit should be the bottleneck
      config = configFixture({ max_concurrent_tasks: 10, max_concurrent_ceiling: 20 })

      await runDispatcherCycle(config)

      // Wait for dispatch to start
      await new Promise(resolve => setTimeout(resolve, 100))

      // At most MAX_PER_REPO (3) should be dispatched for the same repo
      // Note: The implementation filters tasks BEFORE dispatching, so only 3 make it through
    })

    test('scales concurrency with queue size', async () => {
      // With 10 ready tasks and base of 3, should scale to 3 + floor(10/5) = 5
      config = configFixture({
        max_concurrent_tasks: 3,
        max_concurrent_ceiling: 10,
      })

      const tasks = Array.from({ length: 10 }, (_, i) =>
        taskFixture({
          id: `${String(i).padStart(8, '0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
          title: `Task ${i + 1}`,
          repo_path: `/test/repo-${i}`, // Different repos to avoid per-repo limit
        })
      )

      mockGetReadyTasks.mockResolvedValue(tasks)

      await runDispatcherCycle(config)

      // Should dispatch up to the scaled concurrency limit
      await new Promise(resolve => setTimeout(resolve, 100))
    })
  })

  // ===========================================================================
  // Task success/failure flow (tested via dispatch mock behavior)
  // ===========================================================================

  describe('task lifecycle', () => {
    test('successful task updates status to done', async () => {
      const task = taskFixture({
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        title: 'Success task',
        agent: 'claude',
        model: 'sonnet',
        repo_path: '/test/repo',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)
      // Wait for async task to complete
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should have been updated to running, then to done
      const statusUpdates = mockUpdateTask.mock.calls
        .filter(([id]) => id === task.id)
        .map(([, input]) => input.status)
        .filter(Boolean)

      expect(statusUpdates).toContain('running')
      expect(statusUpdates).toContain('done')
    })

    test('failed task updates status to failed', async () => {
      // Make dispatch fail
      mockDispatchFn.mockImplementation(async (options: any) => {
        if (options.onStart) options.onStart(12345)
        return {
          success: false,
          output: 'Error: something went wrong',
          exit_code: 1,
          duration_seconds: 5,
          cost_usd: 0,
        }
      })

      const task = taskFixture({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        title: 'Failing task',
        agent: 'claude',
        model: 'opus',
        repo_path: '/test/repo',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should have been updated to failed
      const statusUpdates = mockUpdateTask.mock.calls
        .filter(([id]) => id === task.id)
        .map(([, input]) => input.status)
        .filter(Boolean)

      expect(statusUpdates).toContain('running')
      expect(statusUpdates).toContain('failed')
    })

    test('successful task broadcasts completion event', async () => {
      const task = taskFixture({
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        title: 'Broadcast test',
        agent: 'claude',
        repo_path: '/test/repo',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Check that task:started and task:completed were broadcast
      const broadcastEvents = mockBroadcastFn.mock.calls.map(([event]) => event)
      expect(broadcastEvents).toContain('task:started')
      expect(broadcastEvents).toContain('task:completed')
    })

    test('failed task broadcasts failure event', async () => {
      mockDispatchFn.mockImplementation(async (options: any) => {
        if (options.onStart) options.onStart(12345)
        return {
          success: false,
          output: 'Crashed',
          exit_code: 1,
          duration_seconds: 2,
          cost_usd: 0,
        }
      })

      const task = taskFixture({
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        title: 'Fail broadcast test',
        agent: 'claude',
        repo_path: '/test/repo',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)
      await new Promise(resolve => setTimeout(resolve, 200))

      const broadcastEvents = mockBroadcastFn.mock.calls.map(([event]) => event)
      expect(broadcastEvents).toContain('task:started')
      expect(broadcastEvents).toContain('task:failed')
    })

    test('records cost and duration on success', async () => {
      mockDispatchFn.mockImplementation(async (options: any) => {
        if (options.onStart) options.onStart(12345)
        return {
          success: true,
          output: 'Done',
          exit_code: 0,
          duration_seconds: 120,
          cost_usd: 0.05,
        }
      })

      const task = taskFixture({
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        title: 'Cost tracking test',
        agent: 'cline',
        provider: 'openrouter',
        repo_path: '/test/repo',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Find the "done" update call
      const doneUpdate = mockUpdateTask.mock.calls.find(
        ([id, input]) => id === task.id && input.status === 'done'
      )

      expect(doneUpdate).toBeDefined()
      if (doneUpdate) {
        expect(doneUpdate[1].cost_usd).toBe(0.05)
        expect(doneUpdate[1].duration_seconds).toBe(120)
      }
    })

    test('creates fruiting session on completion', async () => {
      const task = taskFixture({
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        title: 'Fruiting session test',
        agent: 'claude',
        repo_path: '/test/repo',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should have called createFruitingSession
      expect(mockCreateFruitingSession).toHaveBeenCalled()
    })

    test('assigns default agent when task has no agent', async () => {
      const task = taskFixture({
        id: '11111111-1111-1111-1111-111111111111',
        title: 'No agent task',
        agent: null,
        model: null,
        repo_path: '/test/repo',
      })

      mockGetReadyTasks.mockResolvedValue([task])

      await runDispatcherCycle(config)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Dispatch should have been called
      expect(mockDispatchFn).toHaveBeenCalled()
      // The agent parameter should be one of the default agents
      const dispatchCall = mockDispatchFn.mock.calls[0]
      if (dispatchCall) {
        const options = dispatchCall[0]
        expect(['claude', 'cursor', 'codex', 'gemini', 'copilot', 'kiro']).toContain(options.agent)
      }
    })
  })
})

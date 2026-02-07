/**
 * Common mocks for mycelium-v2 server tests.
 *
 * Provides mock factories for external dependencies:
 * - Bun.spawn (agent dispatch)
 * - SSE broadcast
 * - Telegram notifications
 * - OpenRouter API
 */

import { mock, type Mock } from 'bun:test'

// =============================================================================
// Spawn Mock - for agent dispatch
// =============================================================================

export interface MockSpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface SpawnMock {
  /** The mock function itself */
  fn: Mock<(...args: any[]) => any>
  /** Set what the next spawn call will return */
  setResult(result: Partial<MockSpawnResult>): void
  /** Set a sequence of results for successive spawn calls */
  setResults(results: Partial<MockSpawnResult>[]): void
  /** Get all calls made to spawn */
  getCalls(): any[][]
  /** Reset mock state */
  reset(): void
}

/**
 * Create a mock for Bun.spawn that returns configurable output.
 *
 * Usage:
 * ```ts
 * const spawnMock = mockSpawn()
 * spawnMock.setResult({ stdout: 'task output', exitCode: 0 })
 * // ... run code that calls Bun.spawn ...
 * expect(spawnMock.getCalls()).toHaveLength(1)
 * ```
 */
export function mockSpawn(): SpawnMock {
  let results: Partial<MockSpawnResult>[] = [{ stdout: '', stderr: '', exitCode: 0 }]
  let callIndex = 0

  const fn = mock((..._args: any[]) => {
    const result = results[Math.min(callIndex, results.length - 1)]
    callIndex++

    const stdoutText = result.stdout ?? ''
    const stderrText = result.stderr ?? ''
    const exitCode = result.exitCode ?? 0

    // Return a mock process object that mimics Bun.spawn output
    return {
      pid: 12345 + callIndex,
      stdin: {
        write: mock(() => {}),
        end: mock(() => {}),
      },
      stdout: new ReadableStream({
        start(controller) {
          if (stdoutText) {
            controller.enqueue(new TextEncoder().encode(stdoutText))
          }
          controller.close()
        },
      }),
      stderr: new ReadableStream({
        start(controller) {
          if (stderrText) {
            controller.enqueue(new TextEncoder().encode(stderrText))
          }
          controller.close()
        },
      }),
      exited: Promise.resolve(exitCode),
      exitCode,
      kill: mock(() => {}),
      unref: mock(() => {}),
    }
  })

  return {
    fn,
    setResult(result: Partial<MockSpawnResult>) {
      results = [result]
      callIndex = 0
    },
    setResults(newResults: Partial<MockSpawnResult>[]) {
      results = newResults
      callIndex = 0
    },
    getCalls() {
      return fn.mock.calls
    },
    reset() {
      fn.mockClear()
      results = [{ stdout: '', stderr: '', exitCode: 0 }]
      callIndex = 0
    },
  }
}

// =============================================================================
// SSE Broadcast Mock
// =============================================================================

export interface SSEEvent {
  event: string
  data: unknown
}

export interface SSEMock {
  /** The mock broadcast function */
  fn: Mock<(event: string, data: unknown) => void>
  /** Get all broadcast events */
  getEvents(): SSEEvent[]
  /** Get events of a specific type */
  getEventsOfType(eventType: string): SSEEvent[]
  /** Check if a specific event type was broadcast */
  hasEvent(eventType: string): boolean
  /** Reset mock state */
  reset(): void
}

/**
 * Create a mock for the SSE broadcast function.
 *
 * Usage:
 * ```ts
 * const sseMock = mockSSE()
 * // ... run code that calls broadcast() ...
 * expect(sseMock.hasEvent('task:completed')).toBe(true)
 * ```
 */
export function mockSSE(): SSEMock {
  const events: SSEEvent[] = []

  const fn = mock((event: string, data: unknown) => {
    events.push({ event, data })
  })

  return {
    fn,
    getEvents() {
      return [...events]
    },
    getEventsOfType(eventType: string) {
      return events.filter((e) => e.event === eventType)
    },
    hasEvent(eventType: string) {
      return events.some((e) => e.event === eventType)
    },
    reset() {
      fn.mockClear()
      events.length = 0
    },
  }
}

// =============================================================================
// Telegram Mock
// =============================================================================

export interface TelegramMock {
  /** The mock service object */
  service: {
    isConnected: Mock<() => boolean>
    sendMessage: Mock<(msg: string) => Promise<void>>
  }
  /** Get all sent messages */
  getMessages(): string[]
  /** Set whether telegram is connected */
  setConnected(connected: boolean): void
  /** Reset mock state */
  reset(): void
}

/**
 * Create a mock for the Telegram notification service.
 *
 * Usage:
 * ```ts
 * const telegramMock = mockTelegram()
 * // ... run code that calls getTelegramService() ...
 * expect(telegramMock.getMessages()).toHaveLength(1)
 * ```
 */
export function mockTelegram(): TelegramMock {
  const messages: string[] = []
  let connected = true

  const service = {
    isConnected: mock(() => connected),
    sendMessage: mock(async (msg: string) => {
      messages.push(msg)
    }),
  }

  return {
    service,
    getMessages() {
      return [...messages]
    },
    setConnected(value: boolean) {
      connected = value
    },
    reset() {
      service.isConnected.mockClear()
      service.sendMessage.mockClear()
      messages.length = 0
      connected = true
    },
  }
}

// =============================================================================
// OpenRouter API Mock
// =============================================================================

export interface OpenRouterCreditsMock {
  remaining: number
  limit: number
  usage: number
  isFreeTier: boolean
}

export interface OpenRouterMock {
  /** The mock check function */
  fn: Mock<() => Promise<OpenRouterCreditsMock | null>>
  /** Set credits response */
  setCredits(credits: Partial<OpenRouterCreditsMock>): void
  /** Set to return null (unavailable) */
  setUnavailable(): void
  /** Reset mock state */
  reset(): void
}

/**
 * Create a mock for the OpenRouter credits check API.
 *
 * Usage:
 * ```ts
 * const orMock = mockOpenRouterApi()
 * orMock.setCredits({ remaining: 5.00, limit: 10.00 })
 * // ... run code that calls checkOpenRouterCredits() ...
 * ```
 */
export function mockOpenRouterApi(): OpenRouterMock {
  let credits: OpenRouterCreditsMock | null = {
    remaining: 10.0,
    limit: 10.0,
    usage: 0,
    isFreeTier: false,
  }

  const fn = mock(async () => credits)

  return {
    fn,
    setCredits(partial: Partial<OpenRouterCreditsMock>) {
      credits = {
        remaining: partial.remaining ?? 10.0,
        limit: partial.limit ?? 10.0,
        usage: partial.usage ?? 0,
        isFreeTier: partial.isFreeTier ?? false,
      }
    },
    setUnavailable() {
      credits = null
    },
    reset() {
      fn.mockClear()
      credits = {
        remaining: 10.0,
        limit: 10.0,
        usage: 0,
        isFreeTier: false,
      }
    },
  }
}

// =============================================================================
// Dispatch Mock - for agent dispatch function
// =============================================================================

export interface DispatchResult {
  success: boolean
  output: string
  exit_code: number
  duration_seconds: number
  cost_usd?: number
}

export interface DispatchMock {
  /** The mock dispatch function */
  fn: Mock<(options: any) => Promise<DispatchResult>>
  /** Set what dispatch returns */
  setResult(result: Partial<DispatchResult>): void
  /** Set dispatch to simulate failure */
  setFailure(output: string): void
  /** Get all dispatch calls */
  getCalls(): any[]
  /** Reset mock state */
  reset(): void
}

/**
 * Create a mock for the dispatch function.
 *
 * Usage:
 * ```ts
 * const dispatchMock = mockDispatch()
 * dispatchMock.setResult({ success: true, output: 'done' })
 * ```
 */
export function mockDispatch(): DispatchMock {
  let result: DispatchResult = {
    success: true,
    output: 'Task completed successfully',
    exit_code: 0,
    duration_seconds: 30,
  }

  const fn = mock(async (options: any) => {
    // Call onStart if provided
    if (options.onStart) {
      options.onStart(99999)
    }
    // Call onOutput if provided
    if (options.onOutput) {
      options.onOutput(result.output, 'stdout')
    }
    return { ...result }
  })

  return {
    fn,
    setResult(partial: Partial<DispatchResult>) {
      result = {
        success: partial.success ?? true,
        output: partial.output ?? 'Task completed successfully',
        exit_code: partial.exit_code ?? 0,
        duration_seconds: partial.duration_seconds ?? 30,
        cost_usd: partial.cost_usd,
      }
    },
    setFailure(output: string) {
      result = {
        success: false,
        output,
        exit_code: 1,
        duration_seconds: 10,
      }
    },
    getCalls() {
      return fn.mock.calls
    },
    reset() {
      fn.mockClear()
      result = {
        success: true,
        output: 'Task completed successfully',
        exit_code: 0,
        duration_seconds: 30,
      }
    },
  }
}

// =============================================================================
// Workspace Mock - for workspace isolation
// =============================================================================

export interface WorkspaceMock {
  /** Mock prepareWorkspace */
  prepare: Mock<(taskId: string, repoPath: string) => Promise<{ worktreePath: string; branchName: string }>>
  /** Mock cleanupWorkspace */
  cleanup: Mock<(taskId: string, repoPath: string, deleteBranch?: boolean) => Promise<void>>
  /** Mock getBranchDiff */
  getDiff: Mock<(repoPath: string, branchName: string) => Promise<{ filesChanged: string[]; diffStat: string; diffContent: string }>>
  /** Reset all mocks */
  reset(): void
}

/**
 * Create mocks for workspace isolation functions.
 */
export function mockWorkspace(): WorkspaceMock {
  const prepare = mock(async (taskId: string, _repoPath: string) => ({
    worktreePath: `/tmp/worktrees/task-${taskId.slice(0, 8)}`,
    branchName: `mycel/task-${taskId.slice(0, 8)}`,
  }))

  const cleanup = mock(async (_taskId: string, _repoPath: string, _deleteBranch?: boolean) => {})

  const getDiff = mock(async (_repoPath: string, _branchName: string) => ({
    filesChanged: ['src/main.ts'],
    diffStat: ' src/main.ts | 5 +++++\n 1 file changed, 5 insertions(+)',
    diffContent: '+// new code',
  }))

  return {
    prepare,
    cleanup,
    getDiff,
    reset() {
      prepare.mockClear()
      cleanup.mockClear()
      getDiff.mockClear()
    },
  }
}

// =============================================================================
// Log Mock - for task logging
// =============================================================================

export interface LogMock {
  start: Mock<(taskId: string) => void>
  append: Mock<(taskId: string, chunk: string, stream: string) => void>
  complete: Mock<(taskId: string) => void>
  getEntries: Mock<(taskId: string) => Array<{ chunk: string; stream: string; timestamp: string }> | null>
  reset(): void
}

/**
 * Create mocks for the task logging functions.
 */
export function mockLogs(): LogMock {
  const entries: Array<{ chunk: string; stream: string; timestamp: string }> = []

  const start = mock((_taskId: string) => {})
  const append = mock((_taskId: string, chunk: string, stream: string) => {
    entries.push({ chunk, stream, timestamp: new Date().toISOString() })
  })
  const complete = mock((_taskId: string) => {})
  const getEntries = mock((_taskId: string) => entries.length > 0 ? [...entries] : null)

  return {
    start,
    append,
    complete,
    getEntries,
    reset() {
      start.mockClear()
      append.mockClear()
      complete.mockClear()
      getEntries.mockClear()
      entries.length = 0
    },
  }
}

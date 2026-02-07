/**
 * Smoke tests for the test infrastructure itself.
 * Ensures the helpers work correctly before they're used by other tests.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import {
  createTestDb,
  cleanupTestDb,
  seedTask,
  seedRepo,
  seedPattern,
  seedWarning,
  seedRun,
} from './db'
import {
  taskFixture,
  repoFixture,
  configFixture,
  patternFixture,
  warningFixture,
  resetFixtureCounters,
} from './fixtures'
import {
  mockSpawn,
  mockSSE,
  mockTelegram,
  mockOpenRouterApi,
  mockDispatch,
  mockWorkspace,
  mockLogs,
} from './mocks'

// =============================================================================
// Fixture Tests
// =============================================================================

describe('fixtures', () => {
  beforeEach(() => {
    resetFixtureCounters()
  })

  test('taskFixture returns sensible defaults', () => {
    const task = taskFixture()
    expect(task.id).toBeDefined()
    expect(task.title).toContain('Test task')
    expect(task.status).toBe('pending')
    expect(task.agent).toBe('claude')
    expect(task.model).toBe('sonnet')
    expect(task.repo_path).toBe('/home/test/repo')
    expect(task.depends_on).toBe('[]')
    expect(task.sequenced).toBe(true)
    expect(task.created_at).toBeDefined()
  })

  test('taskFixture accepts overrides', () => {
    const task = taskFixture({
      title: 'Custom title',
      status: 'running',
      agent: 'gemini',
      model: 'flash',
    })
    expect(task.title).toBe('Custom title')
    expect(task.status).toBe('running')
    expect(task.agent).toBe('gemini')
    expect(task.model).toBe('flash')
  })

  test('taskFixture generates unique IDs', () => {
    const a = taskFixture()
    const b = taskFixture()
    expect(a.id).not.toBe(b.id)
  })

  test('repoFixture returns sensible defaults', () => {
    const repo = repoFixture()
    expect(repo.id).toBeDefined()
    expect(repo.path).toContain('/home/test/repo')
    expect(repo.name).toContain('test-repo')
    expect(repo.mode).toBe('align')
    expect(repo.weight).toBe(50)
  })

  test('configFixture returns valid scheduler config', () => {
    const config = configFixture()
    expect(config.dispatcher_enabled).toBe(true)
    expect(config.max_concurrent_tasks).toBe(3)
    expect(config.max_concurrent_ceiling).toBe(10)
    expect(config.shepherd_batch_size).toBe(5)
  })

  test('configFixture accepts overrides', () => {
    const config = configFixture({
      max_concurrent_tasks: 5,
      shepherd_batch_size: 10,
    })
    expect(config.max_concurrent_tasks).toBe(5)
    expect(config.shepherd_batch_size).toBe(10)
  })

  test('patternFixture returns sensible defaults', () => {
    const pattern = patternFixture()
    expect(pattern.id).toBeDefined()
    expect(pattern.content).toContain('Test pattern')
    expect(pattern.source).toBe('test')
    expect(pattern.tags).toBe('[]')
  })

  test('warningFixture returns sensible defaults', () => {
    const warning = warningFixture()
    expect(warning.id).toBeDefined()
    expect(warning.content).toContain('Test warning')
    expect(warning.severity).toBe('medium')
  })

  test('resetFixtureCounters resets IDs', () => {
    const first = taskFixture()
    resetFixtureCounters()
    const second = taskFixture()
    expect(first.id).toBe(second.id)
  })
})

// =============================================================================
// Database Tests
// =============================================================================

describe('test database', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    resetFixtureCounters()
    db = createTestDb()
  })

  afterEach(() => {
    cleanupTestDb()
  })

  test('createTestDb creates working in-memory database', () => {
    expect(db).toBeDefined()
  })

  test('seedTask inserts a task and it can be queried', () => {
    const task = seedTask(db)

    const rows = db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe(task.title)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].agent).toBe('claude')
  })

  test('seedTask with overrides', () => {
    const task = seedTask(db, {
      title: 'Custom task',
      status: 'done',
      agent: 'codex',
      model: 'gpt-5.2-codex',
      result: 'Completed successfully',
    })

    const rows = db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Custom task')
    expect(rows[0].status).toBe('done')
    expect(rows[0].agent).toBe('codex')
    expect(rows[0].result).toBe('Completed successfully')
  })

  test('seedRepo inserts a repo', () => {
    const repo = seedRepo(db)

    const rows = db.select().from(schema.repos).where(eq(schema.repos.id, repo.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe(repo.name)
    expect(rows[0].path).toBe(repo.path)
  })

  test('seedPattern inserts a memory pattern', () => {
    const pattern = seedPattern(db)

    const rows = db.select().from(schema.memory_patterns).where(eq(schema.memory_patterns.id, pattern.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].content).toBe(pattern.content)
  })

  test('seedWarning inserts a memory warning', () => {
    const warning = seedWarning(db)

    const rows = db.select().from(schema.memory_warnings).where(eq(schema.memory_warnings.id, warning.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].content).toBe(warning.content)
    expect(rows[0].severity).toBe('medium')
  })

  test('seedRun inserts a system agent run', () => {
    const run = seedRun(db)

    const rows = db.select().from(schema.system_agent_runs).where(eq(schema.system_agent_runs.id, run.id)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].agent_type).toBe('shepherd')
    expect(rows[0].status).toBe('running')
  })

  test('multiple seeds work together', () => {
    seedTask(db, { title: 'Task A' })
    seedTask(db, { title: 'Task B' })
    seedRepo(db)

    const tasks = db.select().from(schema.tasks).all()
    const repos = db.select().from(schema.repos).all()

    expect(tasks).toHaveLength(2)
    expect(repos).toHaveLength(1)
  })

  test('cleanupTestDb allows creating fresh database', () => {
    seedTask(db)
    cleanupTestDb()

    db = createTestDb()
    const tasks = db.select().from(schema.tasks).all()
    expect(tasks).toHaveLength(0)
  })
})

// =============================================================================
// Mock Tests
// =============================================================================

describe('mocks', () => {
  test('mockSpawn returns configurable output', async () => {
    const spawn = mockSpawn()
    spawn.setResult({ stdout: 'hello world', exitCode: 0 })

    const proc = spawn.fn({ cmd: ['echo'] })
    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(output).toBe('hello world')
    expect(exitCode).toBe(0)
  })

  test('mockSpawn tracks calls', () => {
    const spawn = mockSpawn()
    spawn.fn({ cmd: ['test1'] })
    spawn.fn({ cmd: ['test2'] })

    expect(spawn.getCalls()).toHaveLength(2)
  })

  test('mockSpawn supports multiple results', async () => {
    const spawn = mockSpawn()
    spawn.setResults([
      { stdout: 'first', exitCode: 0 },
      { stdout: 'second', exitCode: 1 },
    ])

    const proc1 = spawn.fn({ cmd: ['test'] })
    expect(await new Response(proc1.stdout).text()).toBe('first')

    const proc2 = spawn.fn({ cmd: ['test'] })
    expect(await new Response(proc2.stdout).text()).toBe('second')
  })

  test('mockSSE captures broadcast events', () => {
    const sse = mockSSE()
    sse.fn('task:completed', { task_id: '123' })
    sse.fn('task:failed', { task_id: '456', error: 'boom' })

    expect(sse.getEvents()).toHaveLength(2)
    expect(sse.hasEvent('task:completed')).toBe(true)
    expect(sse.hasEvent('task:started')).toBe(false)
    expect(sse.getEventsOfType('task:failed')).toHaveLength(1)
  })

  test('mockTelegram captures sent messages', async () => {
    const telegram = mockTelegram()

    expect(telegram.service.isConnected()).toBe(true)

    await telegram.service.sendMessage('Hello from test')
    expect(telegram.getMessages()).toEqual(['Hello from test'])
  })

  test('mockTelegram respects connected state', () => {
    const telegram = mockTelegram()
    telegram.setConnected(false)
    expect(telegram.service.isConnected()).toBe(false)
  })

  test('mockOpenRouterApi returns credits', async () => {
    const api = mockOpenRouterApi()
    api.setCredits({ remaining: 5.0, limit: 10.0 })

    const result = await api.fn()
    expect(result).not.toBeNull()
    expect(result!.remaining).toBe(5.0)
    expect(result!.limit).toBe(10.0)
  })

  test('mockOpenRouterApi can be set unavailable', async () => {
    const api = mockOpenRouterApi()
    api.setUnavailable()

    const result = await api.fn()
    expect(result).toBeNull()
  })

  test('mockDispatch returns configurable results', async () => {
    const dispatch = mockDispatch()
    dispatch.setResult({ success: true, output: 'all done', duration_seconds: 45 })

    const result = await dispatch.fn({ agent: 'claude', prompt: 'test', cwd: '/tmp' })
    expect(result.success).toBe(true)
    expect(result.output).toBe('all done')
    expect(result.duration_seconds).toBe(45)
  })

  test('mockDispatch calls onStart and onOutput', async () => {
    const dispatch = mockDispatch()
    let startPid: number | undefined
    let outputChunks: string[] = []

    await dispatch.fn({
      agent: 'claude',
      prompt: 'test',
      cwd: '/tmp',
      onStart: (pid: number) => { startPid = pid },
      onOutput: (chunk: string) => { outputChunks.push(chunk) },
    })

    expect(startPid).toBe(99999)
    expect(outputChunks).toHaveLength(1)
  })

  test('mockDispatch setFailure', async () => {
    const dispatch = mockDispatch()
    dispatch.setFailure('Quota exceeded')

    const result = await dispatch.fn({ agent: 'claude', prompt: 'test', cwd: '/tmp' })
    expect(result.success).toBe(false)
    expect(result.output).toBe('Quota exceeded')
  })

  test('mockWorkspace returns expected paths', async () => {
    const workspace = mockWorkspace()

    const result = await workspace.prepare('abc12345-uuid', '/home/test/repo')
    expect(result.worktreePath).toContain('task-abc12345')
    expect(result.branchName).toContain('mycel/task-abc12345')
  })

  test('mockLogs tracks append calls', () => {
    const logs = mockLogs()
    logs.start('task-1')
    logs.append('task-1', 'output line', 'stdout')
    logs.complete('task-1')

    expect(logs.start).toHaveBeenCalledTimes(1)
    expect(logs.append).toHaveBeenCalledTimes(1)
    expect(logs.complete).toHaveBeenCalledTimes(1)

    const entries = logs.getEntries('task-1')
    expect(entries).toHaveLength(1)
    expect(entries![0].chunk).toBe('output line')
  })

  test('mock reset clears state', () => {
    const sse = mockSSE()
    sse.fn('test:event', {})
    expect(sse.getEvents()).toHaveLength(1)

    sse.reset()
    expect(sse.getEvents()).toHaveLength(0)
  })
})

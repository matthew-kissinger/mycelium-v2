/**
 * In-memory SQLite test database helpers.
 *
 * Creates a fresh in-memory database with the full schema applied,
 * and provides seed helpers to insert test data directly.
 */

import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'
import { runMigrations } from '../../db/migrate'
import {
  taskFixture,
  repoFixture,
  patternFixture,
  warningFixture,
  runFixture,
  shepherdEvalFixture,
  type TaskFixture,
  type RepoFixture,
  type PatternFixture,
  type WarningFixture,
  type RunFixture,
  type ShepherdEvalFixture,
} from './fixtures'

// =============================================================================
// Test Database Setup
// =============================================================================

let testSqlite: Database | null = null
let testDb: BunSQLiteDatabase<typeof schema> | null = null

/**
 * Create a fresh in-memory SQLite database with all tables.
 * Returns the drizzle DB instance for use in tests.
 *
 * Call cleanupTestDb() in afterEach to tear down.
 */
export function createTestDb(): BunSQLiteDatabase<typeof schema> {
  // Close previous if exists
  if (testSqlite) {
    testSqlite.close()
  }

  testSqlite = new Database(':memory:')
  testSqlite.exec('PRAGMA journal_mode = WAL')

  testDb = drizzle(testSqlite, { schema })

  // Apply all migrations + indexes + seed (same as production startup)
  runMigrations(testDb, testSqlite)
  return testDb
}

/**
 * Get the current test database instance.
 * Throws if createTestDb() hasn't been called.
 */
export function getTestDb(): BunSQLiteDatabase<typeof schema> {
  if (!testDb) {
    throw new Error('Test database not initialized. Call createTestDb() first.')
  }
  return testDb
}

/**
 * Get the raw SQLite database handle (for direct SQL when needed).
 */
export function getTestSqlite(): Database {
  if (!testSqlite) {
    throw new Error('Test database not initialized. Call createTestDb() first.')
  }
  return testSqlite
}

/**
 * Tear down the test database.
 * Call in afterEach/afterAll to clean up.
 */
export function cleanupTestDb(): void {
  if (testSqlite) {
    testSqlite.close()
    testSqlite = null
  }
  testDb = null
}

// =============================================================================
// Seed Helpers
// =============================================================================

/**
 * Insert a task into the test database with sensible defaults.
 * Returns the inserted task row.
 */
export function seedTask(
  db: BunSQLiteDatabase<typeof schema>,
  overrides: Partial<TaskFixture> = {},
): TaskFixture {
  const task = taskFixture(overrides)

  db.insert(schema.tasks).values({
    id: task.id,
    title: task.title,
    status: task.status,
    agent: task.agent,
    model: task.model,
    provider: task.provider,
    repo_path: task.repo_path,
    prompt: task.prompt,
    depends_on: task.depends_on,
    sequenced: task.sequenced,
    branch_name: task.branch_name,
    spec_context: task.spec_context,
    retry_context: task.retry_context,
    timeout_seconds: task.timeout_seconds,
    result: task.result,
    error: task.error,
    cost_usd: task.cost_usd,
    duration_seconds: task.duration_seconds,
    created_at: task.created_at,
    started_at: task.started_at,
    completed_at: task.completed_at,
    worktree_path: task.worktree_path,
    skills: task.skills,
    shepherd_evaluated_at: task.shepherd_evaluated_at,
    armory_reviewed_at: task.armory_reviewed_at,
  }).run()

  return task
}

/**
 * Insert a repo into the test database with sensible defaults.
 * Returns the inserted repo row.
 */
export function seedRepo(
  db: BunSQLiteDatabase<typeof schema>,
  overrides: Partial<RepoFixture> = {},
): RepoFixture {
  const repo = repoFixture(overrides)

  db.insert(schema.repos).values({
    id: repo.id,
    path: repo.path,
    name: repo.name,
    description: repo.description,
    language: repo.language,
    mode: repo.mode,
    weight: repo.weight,
    skills: repo.skills,
    is_public: repo.is_public,
    created_at: repo.created_at,
    last_scanned_at: repo.last_scanned_at,
  }).run()

  return repo
}

/**
 * Insert a memory pattern into the test database.
 */
export function seedPattern(
  db: BunSQLiteDatabase<typeof schema>,
  overrides: Partial<PatternFixture> = {},
): PatternFixture {
  const pattern = patternFixture(overrides)

  db.insert(schema.memory_patterns).values({
    id: pattern.id,
    content: pattern.content,
    source: pattern.source,
    task_id: pattern.task_id,
    repo_path: pattern.repo_path,
    tags: pattern.tags,
    created_at: pattern.created_at,
  }).run()

  return pattern
}

/**
 * Insert a memory warning into the test database.
 */
export function seedWarning(
  db: BunSQLiteDatabase<typeof schema>,
  overrides: Partial<WarningFixture> = {},
): WarningFixture {
  const warning = warningFixture(overrides)

  db.insert(schema.memory_warnings).values({
    id: warning.id,
    content: warning.content,
    severity: warning.severity,
    task_id: warning.task_id,
    repo_path: warning.repo_path,
    created_at: warning.created_at,
  }).run()

  return warning
}

/**
 * Insert a system agent run into the test database.
 */
export function seedRun(
  db: BunSQLiteDatabase<typeof schema>,
  overrides: Partial<RunFixture> = {},
): RunFixture {
  const run = runFixture(overrides)

  db.insert(schema.system_agent_runs).values({
    id: run.id,
    agent_type: run.agent_type,
    status: run.status,
    repo_path: run.repo_path,
    context: run.context,
    output: run.output,
    error: run.error,
    started_at: run.started_at,
    completed_at: run.completed_at,
  }).run()

  return run
}

/**
 * Insert a shepherd evaluation into the test database.
 */
export function seedShepherdEval(
  db: BunSQLiteDatabase<typeof schema>,
  overrides: Partial<ShepherdEvalFixture> = {},
): ShepherdEvalFixture {
  const evaluation = shepherdEvalFixture(overrides)

  db.insert(schema.shepherd_evaluations).values({
    id: evaluation.id,
    repo_path: evaluation.repo_path,
    evaluated_at: evaluation.evaluated_at,
    tasks_evaluated: evaluation.tasks_evaluated,
    health: evaluation.health,
    headline: evaluation.headline,
    concerns: evaluation.concerns,
    wins: evaluation.wins,
    recommendation: evaluation.recommendation,
    global_patterns: evaluation.global_patterns,
    global_warnings: evaluation.global_warnings,
    branch_evaluations: evaluation.branch_evaluations,
    raw_response: evaluation.raw_response,
  }).run()

  return evaluation
}

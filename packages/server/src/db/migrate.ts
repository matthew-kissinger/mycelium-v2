/**
 * Database migration module.
 *
 * Uses Drizzle's migrate() to apply SQL migrations from the drizzle/ directory.
 * After schema migrations, runs post-migration steps:
 * - Extra DDL for columns not yet in schema.ts (health columns on agent_stats)
 * - Performance indexes
 * - Registry seed data
 *
 * Handles the transition from the old raw-SQL initDb() approach:
 * - Existing databases may have a subset of the tables (no migration tracking)
 * - The initial migration (0000) uses CREATE TABLE IF NOT EXISTS for safety
 * - Subsequent migrations use standard Drizzle migrate()
 */

import { migrate as drizzleMigrate } from 'drizzle-orm/bun-sqlite/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { join, dirname } from 'path'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { Database } from 'bun:sqlite'
import { seedRegistry, mergeCompatibleAgents } from './seed-registry'

/**
 * Resolve the migrations folder relative to this file's location.
 */
function getMigrationsFolder(): string {
  const thisDir = dirname(new URL(import.meta.url).pathname)
  return join(thisDir, '..', '..', 'drizzle')
}

/**
 * Apply the initial migration (0000) safely using CREATE TABLE IF NOT EXISTS.
 * This handles the transition from the old initDb() approach where tables
 * may partially exist without Drizzle migration tracking.
 */
function applyInitialMigrationSafe(sqlite: Database, migrationsFolder: string): void {
  // Create migration tracking table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `)

  // Check if initial migration is already recorded
  const entryCount = (sqlite.prepare(
    `SELECT COUNT(*) as c FROM __drizzle_migrations`
  ).get() as any)?.c ?? 0

  if (entryCount > 0) {
    // Migrations already applied - nothing to do here
    return
  }

  // Read migration files
  const migrations = readMigrationFiles({ migrationsFolder })
  if (migrations.length === 0) return

  const initial = migrations[0]

  // Apply each statement from migration 0000, converting CREATE TABLE to IF NOT EXISTS
  for (let stmt of initial.sql) {
    stmt = stmt.trim()
    if (!stmt) continue

    // Convert "CREATE TABLE `x`" to "CREATE TABLE IF NOT EXISTS `x`"
    stmt = stmt.replace(
      /CREATE TABLE (`[^`]+`)/g,
      'CREATE TABLE IF NOT EXISTS $1'
    )

    // Convert "CREATE UNIQUE INDEX `x`" to "CREATE UNIQUE INDEX IF NOT EXISTS `x`"
    stmt = stmt.replace(
      /CREATE (UNIQUE )?INDEX (`[^`]+`)/g,
      'CREATE $1INDEX IF NOT EXISTS $2'
    )

    try {
      sqlite.exec(stmt)
    } catch (error) {
      // Log but don't fail - the table/index might already exist with a different schema
      console.warn('[Migration] Statement warning:', (error as Error).message)
    }
  }

  // Record migration 0000 as applied
  sqlite.prepare(
    `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`
  ).run(initial.hash, initial.folderMillis)

  console.log('[Migration] Initial migration applied (safe mode)')
}

/**
 * Run Drizzle schema migrations, then apply post-migration DDL and seed data.
 */
export function runMigrations(db: BunSQLiteDatabase<any>, sqlite: Database): void {
  const migrationsFolder = getMigrationsFolder()

  // Apply migration 0000 safely (handles pre-existing tables)
  applyInitialMigrationSafe(sqlite, migrationsFolder)

  // Apply any subsequent migrations via standard Drizzle migrate
  // (0000 is already stamped, so Drizzle will skip it and only run newer ones)
  drizzleMigrate(db, { migrationsFolder })

  // Post-migration: columns used by health.ts/registry-queries.ts but not yet in schema.ts
  const agentStatsExtras = [
    `ALTER TABLE agent_stats ADD COLUMN model TEXT;`,
    `ALTER TABLE agent_stats ADD COLUMN provider TEXT;`,
    `ALTER TABLE agent_stats ADD COLUMN status TEXT DEFAULT 'healthy';`,
    `ALTER TABLE agent_stats ADD COLUMN quota_reset_at TEXT;`,
    `ALTER TABLE agent_stats ADD COLUMN last_error TEXT;`,
    `ALTER TABLE agent_stats ADD COLUMN last_error_at TEXT;`,
    `ALTER TABLE agent_stats ADD COLUMN last_success_at TEXT;`,
    `ALTER TABLE agent_stats ADD COLUMN error_count_recent INTEGER DEFAULT 0;`,
  ]
  for (const ddl of agentStatsExtras) {
    try { sqlite.exec(ddl) } catch { /* column already exists */ }
  }

  // Performance indexes (idempotent)
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_repo_status ON tasks(repo_path, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_task ON fruiting_sessions(task_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON system_agent_runs(status, started_at);
    CREATE INDEX IF NOT EXISTS idx_patterns_repo ON memory_patterns(repo_path);
    CREATE INDEX IF NOT EXISTS idx_warnings_repo ON memory_warnings(repo_path);
    CREATE INDEX IF NOT EXISTS idx_history_key ON config_history(config_key, changed_at);
    CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
    CREATE INDEX IF NOT EXISTS idx_agent_stats_status ON agent_stats(updated_at);
  `)

  // Seed registry tables (INSERT OR IGNORE - manual edits preserved)
  try {
    seedRegistry(sqlite)
    mergeCompatibleAgents(sqlite)
  } catch (error) {
    console.error('[Registry] Seed failed:', error)
  }

  console.log('Database migrations applied')
}

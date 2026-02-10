import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'
import { getDatabasePath, getConfigDir, ensureDir } from '../platform'

// Use platform module for cross-platform paths (respects DATABASE_PATH, MYCELIUM_DATA_DIR, XDG)
const DB_PATH = getDatabasePath()

// Ensure config directory exists
ensureDir(getConfigDir())

// Initialize SQLite with Bun's built-in driver
const sqlite = new Database(DB_PATH)
sqlite.exec('PRAGMA journal_mode = WAL')

// Create Drizzle instance
export const db = drizzle(sqlite, { schema })

// Export schema for use elsewhere
export { schema }
export type DB = typeof db

// Export query functions
export * from './queries'

/**
 * Get raw SQLite connection for DDL operations.
 */
export function getRawSqlite(): Database {
  return sqlite
}

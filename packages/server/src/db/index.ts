import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync, existsSync } from 'fs'

// Config directory
const CONFIG_DIR = join(homedir(), '.config', 'mycelium-v2')
const DB_PATH = join(CONFIG_DIR, 'mycelium.db')

// Ensure config directory exists
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true })
}

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

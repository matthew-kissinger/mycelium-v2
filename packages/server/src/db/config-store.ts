/**
 * Config Store - DB-first config storage with file fallback and history tracking
 *
 * Load order: DB override -> file override -> code default
 * All saves go to DB + record history
 * One-time file import on first DB read (if DB empty but file exists)
 */

import { db, schema } from '.'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

// =============================================================================
// Config Overrides
// =============================================================================

/**
 * Get a config override from DB.
 */
export function getConfigOverride(key: string): string | undefined {
  const row = db.select().from(schema.config_overrides)
    .where(eq(schema.config_overrides.key, key))
    .get()
  return row?.value
}

/**
 * Save a config override to DB and record history.
 */
export function saveConfigOverride(
  key: string,
  value: string,
  changedBy = 'api',
  oldValue?: string,
  field?: string
): void {
  const now = new Date().toISOString()

  // Upsert override
  const existing = getConfigOverride(key)
  if (existing) {
    db.update(schema.config_overrides)
      .set({ value, updated_at: now, updated_by: changedBy })
      .where(eq(schema.config_overrides.key, key))
      .run()
  } else {
    db.insert(schema.config_overrides).values({
      key,
      value,
      updated_at: now,
      updated_by: changedBy,
    }).run()
  }

  // Record history
  db.insert(schema.config_history).values({
    id: randomUUID(),
    config_key: key,
    field,
    old_value: oldValue ?? existing ?? null,
    new_value: value,
    changed_at: now,
    changed_by: changedBy,
  }).run()
}

/**
 * Import a file-based config into DB (one-time migration).
 * Only imports if DB has no override for this key.
 */
export function importFileConfig(key: string, fileContent: string): void {
  const existing = getConfigOverride(key)
  if (!existing) {
    saveConfigOverride(key, fileContent, 'import')
    console.log(`[ConfigStore] Imported ${key} from file to DB`)
  }
}

// =============================================================================
// Prompt Overrides
// =============================================================================

/**
 * Get a prompt override from DB.
 */
export function getPromptOverride(promptId: string): string | undefined {
  const row = db.select().from(schema.prompt_overrides)
    .where(eq(schema.prompt_overrides.prompt_id, promptId))
    .get()
  return row?.content
}

/**
 * Save a prompt override to DB and record history.
 */
export function savePromptOverride(
  promptId: string,
  content: string,
  changedBy = 'api'
): void {
  const now = new Date().toISOString()
  const existing = getPromptOverride(promptId)

  if (existing) {
    db.update(schema.prompt_overrides)
      .set({ content, updated_at: now })
      .where(eq(schema.prompt_overrides.prompt_id, promptId))
      .run()
  } else {
    db.insert(schema.prompt_overrides).values({
      prompt_id: promptId,
      content,
      updated_at: now,
    }).run()
  }

  // Record history
  db.insert(schema.config_history).values({
    id: randomUUID(),
    config_key: `prompt:${promptId}`,
    old_value: existing ?? null,
    new_value: content,
    changed_at: now,
    changed_by: changedBy,
  }).run()
}

/**
 * Delete a prompt override from DB and record history.
 */
export function deletePromptOverride(promptId: string): void {
  const existing = getPromptOverride(promptId)
  if (existing) {
    db.delete(schema.prompt_overrides)
      .where(eq(schema.prompt_overrides.prompt_id, promptId))
      .run()

    db.insert(schema.config_history).values({
      id: randomUUID(),
      config_key: `prompt:${promptId}`,
      old_value: existing,
      new_value: null,
      changed_at: new Date().toISOString(),
      changed_by: 'api',
    }).run()
  }
}

/**
 * Import a file-based prompt override into DB (one-time migration).
 */
export function importFilePrompt(promptId: string, content: string): void {
  const existing = getPromptOverride(promptId)
  if (!existing) {
    const now = new Date().toISOString()
    db.insert(schema.prompt_overrides).values({
      prompt_id: promptId,
      content,
      updated_at: now,
    }).run()
    console.log(`[ConfigStore] Imported prompt ${promptId} from file to DB`)
  }
}

// =============================================================================
// History
// =============================================================================

/**
 * Get config change history.
 */
export function getConfigHistory(options?: {
  key?: string
  limit?: number
  offset?: number
}): Array<{
  id: string
  config_key: string
  field: string | null
  old_value: string | null
  new_value: string | null
  changed_at: string
  changed_by: string | null
}> {
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0

  if (options?.key) {
    return db.select().from(schema.config_history)
      .where(eq(schema.config_history.config_key, options.key))
      .orderBy(schema.config_history.changed_at)
      .limit(limit)
      .offset(offset)
      .all()
      .reverse() // Most recent first
  }

  return db.select().from(schema.config_history)
    .orderBy(schema.config_history.changed_at)
    .limit(limit)
    .offset(offset)
    .all()
    .reverse()
}

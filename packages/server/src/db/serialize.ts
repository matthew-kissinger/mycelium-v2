/**
 * Centralized JSON field serialization helpers.
 *
 * Every JSON column in the DB is stored as TEXT and needs
 * JSON.parse on read / JSON.stringify on write.  These helpers
 * eliminate the scattered try/catch-less parse calls.
 */

import { and, type SQL } from 'drizzle-orm'

/** Safely parse a JSON text column, returning fallback on null/undefined/error. */
export function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** Stringify a value for a JSON text column, returning null when input is nullish. */
export function serializeJsonColumn(value: unknown): string | null {
  if (value == null) return null
  return JSON.stringify(value)
}

/** Build an AND where clause from optional conditions (filters out undefined). */
export function buildWhere(...conditions: (SQL | undefined)[]): SQL | undefined {
  const valid = conditions.filter((c): c is SQL => c !== undefined)
  if (valid.length === 0) return undefined
  if (valid.length === 1) return valid[0]
  return and(...valid)
}

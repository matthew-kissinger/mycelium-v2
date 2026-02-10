import { eq, and, desc, isNull, sql } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'
import { parseJsonColumn, buildWhere } from '../serialize'

// ============================================================================
// Pattern Types
// ============================================================================

export interface PatternCreateInput {
  content: string
  source: string
  task_id?: string
  repo_path?: string
  tags?: string[]
}

// ============================================================================
// Pattern CRUD
// ============================================================================

export async function getPatterns(options?: { repo_path?: string; limit?: number }) {
  const { repo_path, limit = 100 } = options ?? {}

  if (repo_path) {
    return db.select().from(schema.memory_patterns)
      .where(eq(schema.memory_patterns.repo_path, repo_path))
      .orderBy(desc(schema.memory_patterns.created_at))
      .limit(limit)
  }

  return db.select().from(schema.memory_patterns)
    .orderBy(desc(schema.memory_patterns.created_at))
    .limit(limit)
}

export async function getGlobalPatterns(limit = 100) {
  return db.select().from(schema.memory_patterns)
    .where(isNull(schema.memory_patterns.repo_path))
    .orderBy(desc(schema.memory_patterns.created_at))
    .limit(limit)
}

export async function createPattern(input: PatternCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const pattern = {
    id,
    content: input.content,
    source: input.source,
    task_id: input.task_id ?? null,
    repo_path: input.repo_path ?? null,
    tags: JSON.stringify(input.tags ?? []),
    created_at: now,
  }

  await db.insert(schema.memory_patterns).values(pattern)
  return pattern
}

export async function deletePattern(id: string) {
  await db.delete(schema.memory_patterns).where(eq(schema.memory_patterns.id, id))
}

export async function updatePattern(id: string, updates: { content?: string; repo_path?: string | null; tags?: string[] }) {
  const updateData: Record<string, unknown> = {}
  if (updates.content !== undefined) updateData.content = updates.content
  if (updates.repo_path !== undefined) updateData.repo_path = updates.repo_path
  if (updates.tags !== undefined) updateData.tags = JSON.stringify(updates.tags)

  if (Object.keys(updateData).length > 0) {
    await db.update(schema.memory_patterns).set(updateData).where(eq(schema.memory_patterns.id, id))
  }
}

export function parsePattern(pattern: typeof schema.memory_patterns.$inferSelect) {
  return {
    ...pattern,
    tags: parseJsonColumn<string[]>(pattern.tags, []),
  }
}

export async function getAllPatterns(limit = 500) {
  return db.select().from(schema.memory_patterns)
    .orderBy(desc(schema.memory_patterns.created_at))
    .limit(limit)
}

// ============================================================================
// Warning Types
// ============================================================================

export interface WarningCreateInput {
  content: string
  severity?: string
  task_id?: string
  repo_path?: string
}

// ============================================================================
// Warning CRUD
// ============================================================================

export async function getWarnings(options?: { repo_path?: string; severity?: string; limit?: number }) {
  const { repo_path, severity, limit = 100 } = options ?? {}

  const where = buildWhere(
    repo_path ? eq(schema.memory_warnings.repo_path, repo_path) : undefined,
    severity ? eq(schema.memory_warnings.severity, severity) : undefined,
  )

  if (where) {
    return db.select().from(schema.memory_warnings)
      .where(where)
      .orderBy(desc(schema.memory_warnings.created_at))
      .limit(limit)
  }

  return db.select().from(schema.memory_warnings)
    .orderBy(desc(schema.memory_warnings.created_at))
    .limit(limit)
}

export async function getGlobalWarnings(limit = 100) {
  return db.select().from(schema.memory_warnings)
    .where(isNull(schema.memory_warnings.repo_path))
    .orderBy(desc(schema.memory_warnings.created_at))
    .limit(limit)
}

export async function createWarning(input: WarningCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const warning = {
    id,
    content: input.content,
    severity: input.severity ?? 'medium',
    task_id: input.task_id ?? null,
    repo_path: input.repo_path ?? null,
    created_at: now,
  }

  await db.insert(schema.memory_warnings).values(warning)
  return warning
}

export async function deleteWarning(id: string) {
  await db.delete(schema.memory_warnings).where(eq(schema.memory_warnings.id, id))
}

export async function updateWarning(id: string, updates: { content?: string; severity?: string }) {
  const updateData: Record<string, unknown> = {}
  if (updates.content !== undefined) updateData.content = updates.content
  if (updates.severity !== undefined) updateData.severity = updates.severity

  if (Object.keys(updateData).length > 0) {
    await db.update(schema.memory_warnings).set(updateData).where(eq(schema.memory_warnings.id, id))
  }
}

export async function getAllWarnings(limit = 500) {
  return db.select().from(schema.memory_warnings)
    .orderBy(desc(schema.memory_warnings.created_at))
    .limit(limit)
}

// ============================================================================
// Cross-domain helpers
// ============================================================================

export async function getReposWithMemory() {
  const patternRepos = await db.selectDistinct({ repo_path: schema.memory_patterns.repo_path })
    .from(schema.memory_patterns)
    .where(sql`${schema.memory_patterns.repo_path} IS NOT NULL`)

  const warningRepos = await db.selectDistinct({ repo_path: schema.memory_warnings.repo_path })
    .from(schema.memory_warnings)
    .where(sql`${schema.memory_warnings.repo_path} IS NOT NULL`)

  const allRepos = new Set<string>()
  for (const r of patternRepos) {
    if (r.repo_path) allRepos.add(r.repo_path)
  }
  for (const r of warningRepos) {
    if (r.repo_path) allRepos.add(r.repo_path)
  }

  return Array.from(allRepos).sort()
}

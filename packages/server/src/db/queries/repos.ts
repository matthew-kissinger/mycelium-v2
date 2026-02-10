import { eq } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'

// ============================================================================
// Types
// ============================================================================

export interface RepoCreateInput {
  path: string
  name: string
  description?: string
  language?: string
  mode?: string
}

export interface RepoUpdateInput {
  description?: string
  language?: string
  mode?: string
  skills?: string[]
  last_scanned_at?: string
  github_owner?: string
  github_repo?: string
  github_default_branch?: string
  is_public?: number | null
}

// ============================================================================
// CRUD
// ============================================================================

export async function getRepos() {
  return db.select().from(schema.repos)
}

export async function getRepo(id: string) {
  const rows = await db.select().from(schema.repos).where(eq(schema.repos.id, id))
  return rows[0] ?? null
}

export async function getRepoByPath(path: string) {
  const rows = await db.select().from(schema.repos).where(eq(schema.repos.path, path))
  return rows[0] ?? null
}

export async function createRepo(input: RepoCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const repo = {
    id,
    path: input.path,
    name: input.name,
    description: input.description ?? null,
    language: input.language ?? null,
    mode: input.mode ?? 'align',
    created_at: now,
  }

  await db.insert(schema.repos).values(repo)
  return repo
}

export async function updateRepo(id: string, input: RepoUpdateInput) {
  const updates: Record<string, unknown> = {}

  if (input.description !== undefined) updates.description = input.description
  if (input.language !== undefined) updates.language = input.language
  if (input.mode !== undefined) updates.mode = input.mode
  if (input.skills !== undefined) updates.skills = JSON.stringify(input.skills)
  if (input.last_scanned_at !== undefined) updates.last_scanned_at = input.last_scanned_at
  if (input.github_owner !== undefined) updates.github_owner = input.github_owner
  if (input.github_repo !== undefined) updates.github_repo = input.github_repo
  if (input.github_default_branch !== undefined) updates.github_default_branch = input.github_default_branch
  if (input.is_public !== undefined) updates.is_public = input.is_public

  await db.update(schema.repos).set(updates).where(eq(schema.repos.id, id))

  return getRepo(id)
}

export async function deleteRepo(id: string) {
  await db.delete(schema.repos).where(eq(schema.repos.id, id))
}

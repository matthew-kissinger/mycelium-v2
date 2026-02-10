import { eq, desc } from 'drizzle-orm'
import { db } from '../index'
import * as schema from '../schema'
import { parseJsonColumn } from '../serialize'

// ============================================================================
// Types
// ============================================================================

export interface ShepherdEvaluationCreateInput {
  repo_path: string
  tasks_evaluated: string[]
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  concerns?: string[]
  wins?: string[]
  recommendation?: string
  global_patterns?: object[]
  global_warnings?: object[]
  branch_evaluations?: object[]
  raw_response?: string
}

// ============================================================================
// CRUD
// ============================================================================

export async function getShepherdEvaluations(options?: { repo_path?: string; limit?: number }) {
  const { repo_path, limit = 50 } = options ?? {}

  if (repo_path) {
    return db.select().from(schema.shepherd_evaluations)
      .where(eq(schema.shepherd_evaluations.repo_path, repo_path))
      .orderBy(desc(schema.shepherd_evaluations.evaluated_at))
      .limit(limit)
  }

  return db.select().from(schema.shepherd_evaluations)
    .orderBy(desc(schema.shepherd_evaluations.evaluated_at))
    .limit(limit)
}

export async function getShepherdEvaluation(id: string) {
  const rows = await db.select().from(schema.shepherd_evaluations).where(eq(schema.shepherd_evaluations.id, id))
  return rows[0] ?? null
}

export async function createShepherdEvaluation(input: ShepherdEvaluationCreateInput) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const evaluation = {
    id,
    repo_path: input.repo_path,
    evaluated_at: now,
    tasks_evaluated: JSON.stringify(input.tasks_evaluated),
    health: input.health,
    headline: input.headline,
    concerns: input.concerns ? JSON.stringify(input.concerns) : null,
    wins: input.wins ? JSON.stringify(input.wins) : null,
    recommendation: input.recommendation ?? null,
    global_patterns: input.global_patterns ? JSON.stringify(input.global_patterns) : null,
    global_warnings: input.global_warnings ? JSON.stringify(input.global_warnings) : null,
    branch_evaluations: input.branch_evaluations ? JSON.stringify(input.branch_evaluations) : null,
    raw_response: input.raw_response ?? null,
  }

  await db.insert(schema.shepherd_evaluations).values(evaluation)
  return evaluation
}

export function parseShepherdEvaluation(evaluation: typeof schema.shepherd_evaluations.$inferSelect) {
  return {
    ...evaluation,
    tasks_evaluated: parseJsonColumn<string[]>(evaluation.tasks_evaluated, []),
    concerns: parseJsonColumn<string[] | null>(evaluation.concerns, null),
    wins: parseJsonColumn<string[] | null>(evaluation.wins, null),
    global_patterns: parseJsonColumn<object[] | null>(evaluation.global_patterns, null),
    global_warnings: parseJsonColumn<object[] | null>(evaluation.global_warnings, null),
    branch_evaluations: parseJsonColumn<object[] | null>(evaluation.branch_evaluations, null),
  }
}

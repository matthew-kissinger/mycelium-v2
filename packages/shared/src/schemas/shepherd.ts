import { z } from 'zod'

// Health status for Shepherd report
export const ShepherdHealth = z.enum(['good', 'concerning', 'critical'])
export type ShepherdHealth = z.infer<typeof ShepherdHealth>

// Merge decision enum
export const MergeDecision = z.enum(['merge', 'reject', 'defer'])
export type MergeDecision = z.infer<typeof MergeDecision>

// Individual branch evaluation
export const BranchEvaluation = z.object({
  branch_name: z.string(),
  task_id: z.string().uuid(),
  decision: MergeDecision,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  patterns_found: z.array(z.string()).default([]),
  warnings_found: z.array(z.string()).default([]),
})
export type BranchEvaluation = z.infer<typeof BranchEvaluation>

// Human-readable summary for Telegram notification
export const HumanReport = z.object({
  health: ShepherdHealth,
  headline: z.string(),
  concerns: z.array(z.string()).default([]),
  wins: z.array(z.string()).default([]),
  recommendation: z.string(),
})
export type HumanReport = z.infer<typeof HumanReport>

// Full Shepherd evaluation output
export const ShepherdEvaluation = z.object({
  id: z.string().uuid(),
  repo_path: z.string(),
  evaluated_at: z.string().datetime(),
  tasks_evaluated: z.number().int().nonnegative(),
  branch_evaluations: z.array(BranchEvaluation).default([]),
  global_patterns: z.array(z.string()).default([]),
  global_warnings: z.array(z.string()).default([]),
  memory_updates: z.record(z.string(), z.unknown()).default({}),
  human_report: HumanReport.optional(),
  raw_response: z.string().optional(),
})
export type ShepherdEvaluation = z.infer<typeof ShepherdEvaluation>

// Shepherd configuration
export const ShepherdConfig = z.object({
  batch_size: z.number().int().positive().default(5),
  agent: z.string().default('claude'),
  model: z.string().default('opus'),
})
export type ShepherdConfig = z.infer<typeof ShepherdConfig>

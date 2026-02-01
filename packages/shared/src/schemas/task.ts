import { z } from 'zod'

// Task status enum
export const TaskStatus = z.enum(['pending', 'running', 'done', 'failed', 'cancelled'])
export type TaskStatus = z.infer<typeof TaskStatus>

// Agent types we support
export const AgentType = z.enum(['claude', 'codex', 'gemini', 'cline', 'cursor'])
export type AgentType = z.infer<typeof AgentType>

// Parsed result from agent execution
export const ParsedResult = z.object({
  summary: z.string().optional(),
  files_modified: z.array(z.string()).default([]),
  files_created: z.array(z.string()).default([]),
  tests_passed: z.boolean().optional(),
  commit_hash: z.string().optional(),
})
export type ParsedResult = z.infer<typeof ParsedResult>

// Error details
export const ErrorDetails = z.object({
  error_type: z.string(),
  stderr: z.string().optional(),
  exit_code: z.number().optional(),
})
export type ErrorDetails = z.infer<typeof ErrorDetails>

// Core task schema
export const Task = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: TaskStatus,
  agent: AgentType.optional(),
  model: z.string().optional(),
  repo_path: z.string(),
  prompt: z.string().optional(),

  // Dependency management
  depends_on: z.array(z.string().uuid()).default([]),
  sequenced: z.boolean().default(false),

  // Execution results
  result: z.string().optional(),
  parsed_result: ParsedResult.optional(),
  error: z.string().optional(),
  error_details: ErrorDetails.optional(),

  // Metrics
  cost_usd: z.number().default(0),
  duration_seconds: z.number().optional(),

  // Timestamps
  created_at: z.string().datetime(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),

  // Evaluation tracking
  shepherd_evaluated_at: z.string().datetime().optional(),
  armory_reviewed_at: z.string().datetime().optional(),
})
export type Task = z.infer<typeof Task>

// Task creation input
export const TaskCreate = z.object({
  title: z.string().min(1),
  repo_path: z.string().min(1),
  prompt: z.string().optional(),
  agent: AgentType.optional(),
  model: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
})
export type TaskCreate = z.infer<typeof TaskCreate>

// Task update input
export const TaskUpdate = z.object({
  status: TaskStatus.optional(),
  agent: AgentType.optional(),
  model: z.string().optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  sequenced: z.boolean().optional(),
})
export type TaskUpdate = z.infer<typeof TaskUpdate>

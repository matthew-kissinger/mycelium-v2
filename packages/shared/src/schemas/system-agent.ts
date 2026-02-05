import { z } from 'zod'

// System agent types
export const SystemAgentType = z.enum([
  'discovery',
  'shepherd',
  'genesis',
  'armory',
  'digest',
  'compaction',
])
export type SystemAgentType = z.infer<typeof SystemAgentType>

// System agent run status
export const SystemAgentStatus = z.enum(['running', 'completed', 'failed', 'blocked'])
export type SystemAgentStatus = z.infer<typeof SystemAgentStatus>

// System agent run tracking
export const SystemAgentRun = z.object({
  id: z.string().uuid(),
  agent_type: SystemAgentType,
  status: SystemAgentStatus.default('running'),

  // Context
  repo_path: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),

  // Result
  result: z.string().optional(),
  error: z.string().optional(),
  blocked_reason: z.string().optional(),

  // Timestamps
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
})
export type SystemAgentRun = z.infer<typeof SystemAgentRun>

// System agent run creation
export const SystemAgentRunCreate = z.object({
  agent_type: SystemAgentType,
  repo_path: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})
export type SystemAgentRunCreate = z.infer<typeof SystemAgentRunCreate>

// System agent run update
export const SystemAgentRunUpdate = z.object({
  status: SystemAgentStatus.optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  blocked_reason: z.string().optional(),
})
export type SystemAgentRunUpdate = z.infer<typeof SystemAgentRunUpdate>

// System agent configuration (per agent type)
export const SystemAgentConfig = z.object({
  enabled: z.boolean().default(true),
  agent: z.string().default('claude'),
  model: z.string().default('sonnet'),
  timeout_seconds: z.number().int().positive().default(1800),
})
export type SystemAgentConfig = z.infer<typeof SystemAgentConfig>

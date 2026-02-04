import { z } from 'zod'
import { TaskStatus, AgentType } from './task'
import { SignalStatus } from './signal'
import { RepoMode } from './repo'
import { SystemAgentType, SystemAgentStatus } from './system-agent'

// =============================================================================
// Generic API Response
// =============================================================================

export const ApiError = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})
export type ApiError = z.infer<typeof ApiError>

export const ApiSuccess = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    message: z.string().optional(),
  })

// =============================================================================
// Task API Schemas
// =============================================================================

// List tasks query params
export const TaskListParams = z.object({
  status: TaskStatus.optional(),
  repo_path: z.string().optional(),
  agent: AgentType.optional(),
  sequenced: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
})
export type TaskListParams = z.infer<typeof TaskListParams>

// Create task request
export const TaskCreateRequest = z.object({
  title: z.string().min(1),
  repo_path: z.string().min(1),
  prompt: z.string().optional(),
  agent: AgentType.optional(),
  model: z.string().optional(),
  depends_on: z.array(z.string().uuid()).default([]),
  sequenced: z.boolean().default(false),
})
export type TaskCreateRequest = z.infer<typeof TaskCreateRequest>

// Update task request
export const TaskUpdateRequest = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
  status: TaskStatus.optional(),
  agent: AgentType.optional(),
  model: z.string().optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  depends_on: z.array(z.string().uuid()).optional(),
  sequenced: z.boolean().optional(),
  clear_deps: z.boolean().optional(),
})
export type TaskUpdateRequest = z.infer<typeof TaskUpdateRequest>

// Run task request
export const TaskRunRequest = z.object({
  agent: AgentType.optional(),
  model: z.string().optional(),
})
export type TaskRunRequest = z.infer<typeof TaskRunRequest>

// Task graph response
export const TaskGraphNode = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: TaskStatus,
  depends_on: z.array(z.string().uuid()),
})
export type TaskGraphNode = z.infer<typeof TaskGraphNode>

export const TaskGraphResponse = z.object({
  nodes: z.array(TaskGraphNode),
})
export type TaskGraphResponse = z.infer<typeof TaskGraphResponse>

// =============================================================================
// Signal API Schemas
// =============================================================================

// List signals query params
export const SignalListParams = z.object({
  status: SignalStatus.optional(),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
})
export type SignalListParams = z.infer<typeof SignalListParams>

// Create signal request
export const SignalCreateRequest = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).optional(),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
  wait: z.boolean().default(false),
  timeout_seconds: z.number().int().positive().default(300),
})
export type SignalCreateRequest = z.infer<typeof SignalCreateRequest>

// Respond to signal request
export const SignalRespondRequest = z.object({
  response: z.string().min(1),
})
export type SignalRespondRequest = z.infer<typeof SignalRespondRequest>

// =============================================================================
// Memory API Schemas
// =============================================================================

// Add memory pattern request
export const MemoryPatternCreateRequest = z.object({
  content: z.string().min(1),
  source: z.enum(['shepherd', 'manual', 'discovery']).default('manual'),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
  tags: z.array(z.string()).default([]),
})
export type MemoryPatternCreateRequest = z.infer<typeof MemoryPatternCreateRequest>

// Add memory warning request
export const MemoryWarningCreateRequest = z.object({
  content: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  task_id: z.string().uuid().optional(),
  repo_path: z.string().optional(),
})
export type MemoryWarningCreateRequest = z.infer<typeof MemoryWarningCreateRequest>

// Memory write request (generic)
export const MemoryWriteRequest = z.object({
  type: z.enum(['pattern', 'warning']),
  content: z.string().min(1),
  repo_path: z.string().optional(),
  task_id: z.string().uuid().optional(),
  // Pattern-specific
  source: z.enum(['shepherd', 'manual', 'discovery']).optional(),
  tags: z.array(z.string()).optional(),
  // Warning-specific
  severity: z.enum(['low', 'medium', 'high']).optional(),
})
export type MemoryWriteRequest = z.infer<typeof MemoryWriteRequest>

// Compact memory request
export const MemoryCompactRequest = z.object({
  repo_path: z.string().optional(),
})
export type MemoryCompactRequest = z.infer<typeof MemoryCompactRequest>

// =============================================================================
// Repo API Schemas
// =============================================================================

// Create repo request
export const RepoCreateRequest = z.object({
  path: z.string().min(1),
  description: z.string().optional(),
  mode: RepoMode.default('align'),
  weight: z.number().int().min(0).max(100).default(50),
  auto_create: z.boolean().default(false),
})
export type RepoCreateRequest = z.infer<typeof RepoCreateRequest>

// Update repo request
export const RepoUpdateRequest = z.object({
  description: z.string().optional(),
  mode: RepoMode.optional(),
  weight: z.number().int().min(0).max(100).optional(),
})
export type RepoUpdateRequest = z.infer<typeof RepoUpdateRequest>

// Discover repos request
export const RepoDiscoverRequest = z.object({
  paths: z.array(z.string()).default([]),
})
export type RepoDiscoverRequest = z.infer<typeof RepoDiscoverRequest>

// Repo health response
export const RepoHealthItem = z.object({
  path: z.string(),
  name: z.string(),
  pending_tasks: z.number().int().nonnegative(),
  running_tasks: z.number().int().nonnegative(),
  completed_tasks: z.number().int().nonnegative(),
  failed_tasks: z.number().int().nonnegative(),
  last_activity: z.string().datetime().optional(),
  health_score: z.number().min(0).max(100),
})
export type RepoHealthItem = z.infer<typeof RepoHealthItem>

export const RepoHealthResponse = z.object({
  repos: z.array(RepoHealthItem),
  overall_health: z.number().min(0).max(100),
})
export type RepoHealthResponse = z.infer<typeof RepoHealthResponse>

// =============================================================================
// System Agent API Schemas
// =============================================================================

// List system agent runs query params
export const SystemAgentRunListParams = z.object({
  agent_type: SystemAgentType.optional(),
  status: SystemAgentStatus.optional(),
  repo_path: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
})
export type SystemAgentRunListParams = z.infer<typeof SystemAgentRunListParams>

// Trigger system agent request
export const SystemAgentTriggerRequest = z.object({
  repo_path: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})
export type SystemAgentTriggerRequest = z.infer<typeof SystemAgentTriggerRequest>

// =============================================================================
// Notification API Schemas
// =============================================================================

// Send notification request
export const NotifyRequest = z.object({
  message: z.string().min(1),
  screenshot_path: z.string().optional(),
  file_path: z.string().optional(),
})
export type NotifyRequest = z.infer<typeof NotifyRequest>

// Notify response
export const NotifyResponse = z.object({
  success: z.boolean(),
  message_id: z.number().optional(),
  error: z.string().optional(),
})
export type NotifyResponse = z.infer<typeof NotifyResponse>

// Inbox message
export const InboxMessage = z.object({
  update_id: z.number(),
  message_id: z.number(),
  text: z.string(),
  timestamp: z.string().datetime(),
  chat_id: z.number(),
  has_file: z.boolean().default(false),
})
export type InboxMessage = z.infer<typeof InboxMessage>

// Inbox list params
export const InboxListParams = z.object({
  limit: z.number().int().positive().max(100).default(20),
})
export type InboxListParams = z.infer<typeof InboxListParams>

// =============================================================================
// Stats API Schemas
// =============================================================================

export const StatsResponse = z.object({
  total_tasks: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total_cost_usd: z.number().nonnegative(),
  per_use_cost_usd: z.number().nonnegative().optional(),
  subscription_task_count: z.number().int().nonnegative().optional(),
  unsequenced: z.number().int().nonnegative().optional(),
  waiting: z.number().int().nonnegative().optional(),
  ready: z.number().int().nonnegative().optional(),
})
export type StatsResponse = z.infer<typeof StatsResponse>

// =============================================================================
// Health API Schemas
// =============================================================================

export const HealthResponse = z.object({
  backend: z.boolean(),
  scheduler: z.boolean(),
  database: z.boolean(),
  uptime_seconds: z.number().nonnegative(),
})
export type HealthResponse = z.infer<typeof HealthResponse>

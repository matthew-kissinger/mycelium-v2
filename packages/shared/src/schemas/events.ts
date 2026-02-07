import { z } from 'zod'
import { Task, TaskStatus } from './task'
import { Signal, SignalStatus } from './signal'
import { Repo } from './repo'
import { SystemAgentRun, SystemAgentType, SystemAgentStatus } from './system-agent'

// =============================================================================
// SSE Event Types
// =============================================================================

// Event type enum
export const SSEEventType = z.enum([
  // Task events
  'task:created',
  'task:updated',
  'task:started',
  'task:completed',
  'task:failed',
  'task:cancelled',
  'task:retrying',
  'task:output',
  'task:deleted',
  'task:skipped',

  // Signal events
  'signal:created',
  'signal:responded',
  'signal:expired',

  // Repo events
  'repo:added',
  'repo:updated',
  'repo:removed',

  // Memory events
  'memory:pattern_created',
  'memory:warning_created',
  'memory:pattern_deleted',
  'memory:warning_deleted',
  'memory:compaction_completed',

  // System agent events
  'agent:started',
  'agent:completed',
  'agent:failed',
  'agent:blocked',
  'agent:output',
  'agent:quota_exceeded',
  'agent:quota_reset',

  // Notification events
  'notification:sent',

  // Scheduler events
  'scheduler:started',
  'scheduler:stopped',
  'scheduler:cycle:started',
  'scheduler:cycle:completed',

  // GitHub events
  'github:push',
  'github:pr_created',
  'github:pr_merged',
  'github:pr_closed',
  'github:check_status',

  // Device events
  'device:status',
  'device:added',
  'device:updated',
  'device:removed',

  // System events
  'system:heartbeat',
  'system:error',
])
export type SSEEventType = z.infer<typeof SSEEventType>

// =============================================================================
// Task Events
// =============================================================================

export const TaskCreatedEvent = z.object({
  type: z.literal('task:created'),
  task: Task,
  timestamp: z.string().datetime(),
})
export type TaskCreatedEvent = z.infer<typeof TaskCreatedEvent>

export const TaskUpdatedEvent = z.object({
  type: z.literal('task:updated'),
  task_id: z.string().uuid(),
  changes: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime(),
})
export type TaskUpdatedEvent = z.infer<typeof TaskUpdatedEvent>

export const TaskStartedEvent = z.object({
  type: z.literal('task:started'),
  task_id: z.string().uuid(),
  agent: z.string(),
  model: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type TaskStartedEvent = z.infer<typeof TaskStartedEvent>

export const TaskCompletedEvent = z.object({
  type: z.literal('task:completed'),
  task_id: z.string().uuid(),
  duration_seconds: z.number(),
  cost_usd: z.number().optional(),
  timestamp: z.string().datetime(),
})
export type TaskCompletedEvent = z.infer<typeof TaskCompletedEvent>

export const TaskFailedEvent = z.object({
  type: z.literal('task:failed'),
  task_id: z.string().uuid(),
  error: z.string(),
  error_type: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type TaskFailedEvent = z.infer<typeof TaskFailedEvent>

export const TaskCancelledEvent = z.object({
  type: z.literal('task:cancelled'),
  task_id: z.string().uuid(),
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type TaskCancelledEvent = z.infer<typeof TaskCancelledEvent>

export const TaskOutputEvent = z.object({
  type: z.literal('task:output'),
  task_id: z.string().uuid(),
  chunk: z.string(),
  stream: z.enum(['stdout', 'stderr']).optional(),
  timestamp: z.string().datetime(),
})
export type TaskOutputEvent = z.infer<typeof TaskOutputEvent>

export const TaskRetryingEvent = z.object({
  type: z.literal('task:retrying'),
  task_id: z.string().uuid(),
  retry_count: z.number().optional(),
  next_model: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type TaskRetryingEvent = z.infer<typeof TaskRetryingEvent>

export const TaskDeletedEvent = z.object({
  type: z.literal('task:deleted'),
  task_id: z.string().uuid(),
  timestamp: z.string().datetime(),
})
export type TaskDeletedEvent = z.infer<typeof TaskDeletedEvent>

export const TaskSkippedEvent = z.object({
  type: z.literal('task:skipped'),
  task_id: z.string().uuid(),
  agent: z.string(),
  reason: z.string(),
  timestamp: z.string().datetime(),
})
export type TaskSkippedEvent = z.infer<typeof TaskSkippedEvent>

// Union of all task events
export const TaskEvent = z.discriminatedUnion('type', [
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  TaskRetryingEvent,
  TaskOutputEvent,
  TaskDeletedEvent,
  TaskSkippedEvent,
])
export type TaskEvent = z.infer<typeof TaskEvent>

// =============================================================================
// Signal Events
// =============================================================================

export const SignalCreatedEvent = z.object({
  type: z.literal('signal:created'),
  signal: Signal,
  timestamp: z.string().datetime(),
})
export type SignalCreatedEvent = z.infer<typeof SignalCreatedEvent>

export const SignalRespondedEvent = z.object({
  type: z.literal('signal:responded'),
  signal_id: z.string().uuid(),
  response: z.string(),
  timestamp: z.string().datetime(),
})
export type SignalRespondedEvent = z.infer<typeof SignalRespondedEvent>

export const SignalExpiredEvent = z.object({
  type: z.literal('signal:expired'),
  signal_id: z.string().uuid(),
  timestamp: z.string().datetime(),
})
export type SignalExpiredEvent = z.infer<typeof SignalExpiredEvent>

// Union of all signal events
export const SignalEvent = z.discriminatedUnion('type', [
  SignalCreatedEvent,
  SignalRespondedEvent,
  SignalExpiredEvent,
])
export type SignalEvent = z.infer<typeof SignalEvent>

// =============================================================================
// Repo Events
// =============================================================================

export const RepoAddedEvent = z.object({
  type: z.literal('repo:added'),
  repo: Repo,
  timestamp: z.string().datetime(),
})
export type RepoAddedEvent = z.infer<typeof RepoAddedEvent>

export const RepoUpdatedEvent = z.object({
  type: z.literal('repo:updated'),
  repo: Repo,
  timestamp: z.string().datetime(),
})
export type RepoUpdatedEvent = z.infer<typeof RepoUpdatedEvent>

export const RepoRemovedEvent = z.object({
  type: z.literal('repo:removed'),
  repo_id: z.string().uuid(),
  path: z.string(),
  timestamp: z.string().datetime(),
})
export type RepoRemovedEvent = z.infer<typeof RepoRemovedEvent>

// Union of all repo events
export const RepoEvent = z.discriminatedUnion('type', [
  RepoAddedEvent,
  RepoUpdatedEvent,
  RepoRemovedEvent,
])
export type RepoEvent = z.infer<typeof RepoEvent>

// =============================================================================
// Memory Events
// =============================================================================

export const MemoryPatternCreatedEvent = z.object({
  type: z.literal('memory:pattern_created'),
  pattern_id: z.string().uuid(),
  content: z.string(),
  repo_path: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type MemoryPatternCreatedEvent = z.infer<typeof MemoryPatternCreatedEvent>

export const MemoryWarningCreatedEvent = z.object({
  type: z.literal('memory:warning_created'),
  warning_id: z.string().uuid(),
  content: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  repo_path: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type MemoryWarningCreatedEvent = z.infer<typeof MemoryWarningCreatedEvent>

export const MemoryPatternDeletedEvent = z.object({
  type: z.literal('memory:pattern_deleted'),
  pattern_id: z.string().uuid(),
  timestamp: z.string().datetime(),
})
export type MemoryPatternDeletedEvent = z.infer<typeof MemoryPatternDeletedEvent>

export const MemoryWarningDeletedEvent = z.object({
  type: z.literal('memory:warning_deleted'),
  warning_id: z.string().uuid(),
  timestamp: z.string().datetime(),
})
export type MemoryWarningDeletedEvent = z.infer<typeof MemoryWarningDeletedEvent>

export const MemoryCompactionCompletedEvent = z.object({
  type: z.literal('memory:compaction_completed'),
  patterns_before: z.number(),
  patterns_after: z.number(),
  warnings_before: z.number(),
  warnings_after: z.number(),
  timestamp: z.string().datetime(),
})
export type MemoryCompactionCompletedEvent = z.infer<typeof MemoryCompactionCompletedEvent>

// Union of all memory events
export const MemoryEvent = z.discriminatedUnion('type', [
  MemoryPatternCreatedEvent,
  MemoryWarningCreatedEvent,
  MemoryPatternDeletedEvent,
  MemoryWarningDeletedEvent,
  MemoryCompactionCompletedEvent,
])
export type MemoryEvent = z.infer<typeof MemoryEvent>

// =============================================================================
// System Agent Events
// =============================================================================

export const AgentStartedEvent = z.object({
  type: z.literal('agent:started'),
  run_id: z.string().uuid(),
  agent_type: SystemAgentType,
  repo_path: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type AgentStartedEvent = z.infer<typeof AgentStartedEvent>

export const AgentCompletedEvent = z.object({
  type: z.literal('agent:completed'),
  run_id: z.string().uuid(),
  agent_type: SystemAgentType,
  duration_seconds: z.number(),
  timestamp: z.string().datetime(),
})
export type AgentCompletedEvent = z.infer<typeof AgentCompletedEvent>

export const AgentFailedEvent = z.object({
  type: z.literal('agent:failed'),
  run_id: z.string().uuid(),
  agent_type: SystemAgentType,
  error: z.string(),
  timestamp: z.string().datetime(),
})
export type AgentFailedEvent = z.infer<typeof AgentFailedEvent>

export const AgentBlockedEvent = z.object({
  type: z.literal('agent:blocked'),
  run_id: z.string().uuid(),
  agent_type: SystemAgentType,
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type AgentBlockedEvent = z.infer<typeof AgentBlockedEvent>

export const AgentOutputEvent = z.object({
  type: z.literal('agent:output'),
  run_id: z.string().uuid(),
  agent_type: SystemAgentType,
  chunk: z.string(),
  stream: z.enum(['stdout', 'stderr']).optional(),
  timestamp: z.string().datetime(),
})
export type AgentOutputEvent = z.infer<typeof AgentOutputEvent>

export const AgentQuotaExceededEvent = z.object({
  type: z.literal('agent:quota_exceeded'),
  agent: z.string(),
  model: z.string().optional(),
  error: z.string(),
  reset_at: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type AgentQuotaExceededEvent = z.infer<typeof AgentQuotaExceededEvent>

export const AgentQuotaResetEvent = z.object({
  type: z.literal('agent:quota_reset'),
  agent: z.string(),
  model: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type AgentQuotaResetEvent = z.infer<typeof AgentQuotaResetEvent>

// Union of all agent events
export const SystemAgentEvent = z.discriminatedUnion('type', [
  AgentStartedEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  AgentBlockedEvent,
  AgentOutputEvent,
  AgentQuotaExceededEvent,
  AgentQuotaResetEvent,
])
export type SystemAgentEvent = z.infer<typeof SystemAgentEvent>

// =============================================================================
// Notification Events
// =============================================================================

export const NotificationSentEvent = z.object({
  type: z.literal('notification:sent'),
  message: z.string(),
  message_id: z.number().optional(),
  timestamp: z.string().datetime(),
})
export type NotificationSentEvent = z.infer<typeof NotificationSentEvent>

// Union of all notification events
export const NotificationEvent = z.discriminatedUnion('type', [
  NotificationSentEvent,
])
export type NotificationEvent = z.infer<typeof NotificationEvent>

// =============================================================================
// Scheduler Events
// =============================================================================

export const SchedulerStartedEvent = z.object({
  type: z.literal('scheduler:started'),
  timestamp: z.string().datetime(),
})
export type SchedulerStartedEvent = z.infer<typeof SchedulerStartedEvent>

export const SchedulerStoppedEvent = z.object({
  type: z.literal('scheduler:stopped'),
  timestamp: z.string().datetime(),
})
export type SchedulerStoppedEvent = z.infer<typeof SchedulerStoppedEvent>

export const SchedulerCycleStartedEvent = z.object({
  type: z.literal('scheduler:cycle:started'),
  cycle: z.string(),
  timestamp: z.string().datetime(),
})
export type SchedulerCycleStartedEvent = z.infer<typeof SchedulerCycleStartedEvent>

export const SchedulerCycleCompletedEvent = z.object({
  type: z.literal('scheduler:cycle:completed'),
  cycle: z.string(),
  duration_ms: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type SchedulerCycleCompletedEvent = z.infer<typeof SchedulerCycleCompletedEvent>

// Union of all scheduler events
export const SchedulerEvent = z.discriminatedUnion('type', [
  SchedulerStartedEvent,
  SchedulerStoppedEvent,
  SchedulerCycleStartedEvent,
  SchedulerCycleCompletedEvent,
])
export type SchedulerEvent = z.infer<typeof SchedulerEvent>

// =============================================================================
// GitHub Events
// =============================================================================

export const GitHubPushEvent = z.object({
  type: z.literal('github:push'),
  repo_path: z.string(),
  branch: z.string(),
  task_id: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
})
export type GitHubPushEvent = z.infer<typeof GitHubPushEvent>

export const GitHubPRCreatedEvent = z.object({
  type: z.literal('github:pr_created'),
  repo_path: z.string(),
  pr_number: z.number(),
  pr_url: z.string(),
  task_id: z.string().uuid().optional(),
  branch: z.string(),
  title: z.string(),
  timestamp: z.string().datetime(),
})
export type GitHubPRCreatedEvent = z.infer<typeof GitHubPRCreatedEvent>

export const GitHubPRMergedEvent = z.object({
  type: z.literal('github:pr_merged'),
  repo_path: z.string(),
  pr_number: z.number(),
  task_id: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
})
export type GitHubPRMergedEvent = z.infer<typeof GitHubPRMergedEvent>

export const GitHubPRClosedEvent = z.object({
  type: z.literal('github:pr_closed'),
  repo_path: z.string(),
  pr_number: z.number(),
  task_id: z.string().uuid().optional(),
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type GitHubPRClosedEvent = z.infer<typeof GitHubPRClosedEvent>

export const GitHubCheckStatusEvent = z.object({
  type: z.literal('github:check_status'),
  repo_path: z.string(),
  pr_number: z.number().optional(),
  status: z.enum(['pending', 'success', 'failure', 'error']),
  context: z.string(),
  timestamp: z.string().datetime(),
})
export type GitHubCheckStatusEvent = z.infer<typeof GitHubCheckStatusEvent>

// Union of all GitHub events
export const GitHubEvent = z.discriminatedUnion('type', [
  GitHubPushEvent,
  GitHubPRCreatedEvent,
  GitHubPRMergedEvent,
  GitHubPRClosedEvent,
  GitHubCheckStatusEvent,
])
export type GitHubEvent = z.infer<typeof GitHubEvent>

// =============================================================================
// Device Events
// =============================================================================

export const DeviceStatusEvent = z.object({
  type: z.literal('device:status'),
  device_id: z.string(),
  status: z.enum(['online', 'offline', 'unknown']),
  timestamp: z.string().datetime(),
})
export type DeviceStatusEvent = z.infer<typeof DeviceStatusEvent>

export const DeviceAddedEvent = z.object({
  type: z.literal('device:added'),
  device_id: z.string(),
  name: z.string(),
  timestamp: z.string().datetime(),
})
export type DeviceAddedEvent = z.infer<typeof DeviceAddedEvent>

export const DeviceUpdatedEvent = z.object({
  type: z.literal('device:updated'),
  device_id: z.string(),
  changes: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime(),
})
export type DeviceUpdatedEvent = z.infer<typeof DeviceUpdatedEvent>

export const DeviceRemovedEvent = z.object({
  type: z.literal('device:removed'),
  device_id: z.string(),
  timestamp: z.string().datetime(),
})
export type DeviceRemovedEvent = z.infer<typeof DeviceRemovedEvent>

export const DeviceEvent = z.discriminatedUnion('type', [
  DeviceStatusEvent,
  DeviceAddedEvent,
  DeviceUpdatedEvent,
  DeviceRemovedEvent,
])
export type DeviceEvent = z.infer<typeof DeviceEvent>

// =============================================================================
// System Events
// =============================================================================

export const HeartbeatEvent = z.object({
  type: z.literal('system:heartbeat'),
  timestamp: z.string().datetime(),
})
export type HeartbeatEvent = z.infer<typeof HeartbeatEvent>

export const SystemErrorEvent = z.object({
  type: z.literal('system:error'),
  error: z.string(),
  component: z.string().optional(),
  timestamp: z.string().datetime(),
})
export type SystemErrorEvent = z.infer<typeof SystemErrorEvent>

// Union of all system events
export const SystemEvent = z.discriminatedUnion('type', [
  HeartbeatEvent,
  SystemErrorEvent,
])
export type SystemEvent = z.infer<typeof SystemEvent>

// =============================================================================
// Combined SSE Event Union
// =============================================================================

// All possible SSE events
export const SSEEvent = z.union([
  TaskEvent,
  SignalEvent,
  RepoEvent,
  MemoryEvent,
  SystemAgentEvent,
  NotificationEvent,
  SchedulerEvent,
  GitHubEvent,
  DeviceEvent,
  SystemEvent,
])
export type SSEEvent = z.infer<typeof SSEEvent>

// SSE message wrapper (for wire format)
export const SSEMessage = z.object({
  id: z.string().optional(),
  event: SSEEventType,
  data: SSEEvent,
  retry: z.number().optional(),
})
export type SSEMessage = z.infer<typeof SSEMessage>

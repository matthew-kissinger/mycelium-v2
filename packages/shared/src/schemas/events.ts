import { z } from 'zod'
import { Task, TaskStatus } from './task'
import { Signal, SignalStatus } from './signal'
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
  'task:output',

  // Signal events
  'signal:created',
  'signal:responded',
  'signal:expired',

  // System agent events
  'agent:started',
  'agent:completed',
  'agent:failed',
  'agent:blocked',

  // Scheduler events
  'scheduler:started',
  'scheduler:stopped',
  'scheduler:cycle',

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
  timestamp: z.string().datetime(),
})
export type TaskOutputEvent = z.infer<typeof TaskOutputEvent>

// Union of all task events
export const TaskEvent = z.discriminatedUnion('type', [
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  TaskOutputEvent,
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

// Union of all agent events
export const SystemAgentEvent = z.discriminatedUnion('type', [
  AgentStartedEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  AgentBlockedEvent,
])
export type SystemAgentEvent = z.infer<typeof SystemAgentEvent>

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

export const SchedulerCycleEvent = z.object({
  type: z.literal('scheduler:cycle'),
  cycle: z.string(),
  timestamp: z.string().datetime(),
})
export type SchedulerCycleEvent = z.infer<typeof SchedulerCycleEvent>

// Union of all scheduler events
export const SchedulerEvent = z.discriminatedUnion('type', [
  SchedulerStartedEvent,
  SchedulerStoppedEvent,
  SchedulerCycleEvent,
])
export type SchedulerEvent = z.infer<typeof SchedulerEvent>

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
  SystemAgentEvent,
  SchedulerEvent,
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

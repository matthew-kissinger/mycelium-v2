// Re-export inferred types from schemas
export type {
  Task,
  TaskCreate,
  TaskUpdate,
  TaskStatus,
  AgentType,
  ParsedResult,
  ErrorDetails,
} from '../schemas/task'

export type {
  Repo,
  RepoCreate,
  RepoMode,
} from '../schemas/repo'

export type {
  AgentConfig,
  AgentExecuteRequest,
  AgentExecuteResult,
} from '../schemas/agent'

export type {
  Signal,
  SignalCreate,
  SignalStatus,
} from '../schemas/signal'

export type {
  MemoryPattern,
  MemoryWarning,
  RepoMemory,
} from '../schemas/memory'

// Shepherd types
export type {
  ShepherdHealth,
  MergeDecision,
  BranchEvaluation,
  HumanReport,
  ShepherdEvaluation,
  ShepherdConfig,
} from '../schemas/shepherd'

// System agent types
export type {
  SystemAgentType,
  SystemAgentStatus,
  SystemAgentRun,
  SystemAgentRunCreate,
  SystemAgentRunUpdate,
  SystemAgentConfig,
} from '../schemas/system-agent'

// Scheduler types
export type {
  SchedulerConfig,
  CycleState,
  SchedulerStatus,
} from '../schemas/scheduler'

// API request/response types
export type {
  ApiError,
  TaskListParams,
  TaskCreateRequest,
  TaskUpdateRequest,
  TaskRunRequest,
  TaskGraphNode,
  TaskGraphResponse,
  SignalListParams,
  SignalCreateRequest,
  SignalRespondRequest,
  MemoryPatternCreateRequest,
  MemoryWarningCreateRequest,
  MemoryWriteRequest,
  MemoryCompactRequest,
  RepoCreateRequest,
  RepoUpdateRequest,
  RepoDiscoverRequest,
  RepoHealthItem,
  RepoHealthResponse,
  SystemAgentRunListParams,
  SystemAgentTriggerRequest,
  NotifyRequest,
  NotifyResponse,
  InboxMessage,
  InboxListParams,
  StatsResponse,
  HealthResponse,
} from '../schemas/api'

// SSE event types
export type {
  SSEEventType,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  TaskOutputEvent,
  TaskEvent,
  SignalCreatedEvent,
  SignalRespondedEvent,
  SignalExpiredEvent,
  SignalEvent,
  AgentStartedEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  AgentBlockedEvent,
  SystemAgentEvent,
  SchedulerStartedEvent,
  SchedulerStoppedEvent,
  SchedulerCycleEvent,
  SchedulerEvent,
  HeartbeatEvent,
  SystemErrorEvent,
  SystemEvent,
  SSEEvent,
  SSEMessage,
} from '../schemas/events'

// API response wrapper (generic)
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

// SSE topic patterns for subscriptions
// - task:* (all task events)
// - task:{id} (specific task)
// - signal:* (all signals)
// - system:* (system agent events)
// - repo:* (all repo events)
// - repo:{path} (specific repo events)
export type SSETopic = string

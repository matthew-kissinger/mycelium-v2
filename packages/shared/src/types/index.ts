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

// API response types
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

// Stats response
export interface Stats {
  total_tasks: number
  pending: number
  running: number
  done: number
  failed: number
  total_cost_usd: number
}

// Health response
export interface Health {
  backend: boolean
  scheduler: boolean
  poller: boolean
  uptime_seconds: number
}

// SSE event types
export type SSEEventType =
  | 'task:created'
  | 'task:updated'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:output'
  | 'signal:created'
  | 'signal:responded'

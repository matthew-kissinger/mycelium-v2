/**
 * Client-side type definitions
 *
 * Re-exports from @mycelium/shared where compatible,
 * defines client-specific types for UI state.
 */

// Re-export shared types that are used directly
export type {
  AgentType,
  AgentConfig,
  Repo,
  Signal,
  MemoryPattern,
  MemoryWarning,
  RepoMemory,
  TaskStatus,
  SchedulerConfig,
} from '@mycelium/shared'

// Re-export flow types
export type {
  PanelType,
  PanelState,
  AgentSlotData,
  SchedulerNodeData,
  CycleNodeData,
  TaskPoolNodeData,
  AgentSlotsNodeData,
  AlignmentNodeData,
  MemoryNodeData,
} from '../flow/types'

// =============================================================================
// Client-specific types (differ from shared or UI-only)
// =============================================================================

/** Client-side stats (remapped from API StatsResponse) */
export interface Stats {
  total: number
  pending: number
  running: number
  done: number
  failed: number
  cancelled: number
  unsequenced: number
  waiting: number
  ready: number
}

/** Scheduler status as received from API */
export interface SchedulerStatus {
  running: boolean
  started_at?: string
  cycles: CycleStatus[]
}

export interface CycleStatus {
  name: string
  enabled: boolean
  running: boolean
  last_run?: string
  next_run?: string
  runs_completed: number
  errors: number
}

/** Agent config as returned by /api/config/agents */
export interface AgentConfigData {
  type: string
  command: string
  timeout_seconds: number
  max_turns: number
  supports_streaming: boolean
  enabled: boolean
  default_model?: string
  description?: string
}

/** Grouped memory by repo */
export interface GroupedMemory {
  global: {
    patterns: import('@mycelium/shared').MemoryPattern[]
    warnings: import('@mycelium/shared').MemoryWarning[]
  }
  repos: Record<string, {
    patterns: import('@mycelium/shared').MemoryPattern[]
    warnings: import('@mycelium/shared').MemoryWarning[]
  }>
  summary: {
    total_patterns: number
    total_warnings: number
    global_patterns: number
    global_warnings: number
    repos_with_memory: number
  }
}

/** Prompt info from /api/prompts */
export interface PromptInfo {
  id: string
  name: string
  description: string
  agent: string
  templateVariables: string[]
  content: string
  customContent?: string
  effectiveContent?: string
  isCustomized: boolean
  contentLength?: number
}

/** Log entry for task output */
export interface LogEntry {
  chunk: string
  timestamp: string
  stream: 'stdout' | 'stderr'
}

/** Task logs response */
export interface TaskLogs {
  task_id: string
  entries: LogEntry[]
  started_at?: string
  completed_at?: string
  status: string
  from_result?: boolean
}

/** Task for task pool (client representation) */
export interface Task {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  agent?: string
  model?: string
  repo_path: string
  prompt?: string
  depends_on: string[]
  sequenced: boolean
  result?: string
  parsed_result?: {
    summary?: string
    files_modified?: string[]
    files_created?: string[]
    tests_passed?: boolean
    commit_hash?: string
  }
  error?: string
  error_details?: {
    error_type: string
    stderr?: string
    exit_code?: number
  }
  cost_usd: number
  duration_seconds?: number
  created_at: string
  started_at?: string
  completed_at?: string
}

/** Task graph node */
export interface TaskGraphNode {
  id: string
  title: string
  status: string
  repo_path: string
  agent?: string
  sequenced: boolean
  depends_on: string[]
  created_at: string
}

/** Task graph edge */
export interface TaskGraphEdge {
  source: string
  target: string
}

/** Task filters for list queries */
export interface TaskFilters {
  status?: string
  repo_path?: string
  agent?: string
  limit?: number
  offset?: number
}

/** Directory browser result */
export interface BrowseDirectory {
  name: string
  path: string
  isGitRepo: boolean
  isHidden: boolean
}

export interface BrowseResult {
  current: string
  parent: string | null
  directories: BrowseDirectory[]
  isGitRepo: boolean
}

/** Inventory data */
export interface Skill {
  name: string
  description: string
  path: string
}

export interface McpServer {
  name: string
  command: string
  args?: string[]
}

export interface Inventory {
  skills: Skill[]
  mcps: McpServer[]
  skills_count: number
  mcps_count: number
}

/** Running system agent info */
export interface RunningSystemAgent {
  id: string
  agent_type: 'discovery' | 'sequencer' | 'shepherd' | 'armory'
  repo_path: string | null
  started_at: string
}

/** Shepherd status from /api/shepherd/status */
export interface ShepherdStatus {
  batch_size: number
  repos: Record<string, { unevaluated: number; last_evaluation?: string }>
  ready_repos: Array<{ path: string; unevaluated: number; last_evaluation?: string }>
  total_unevaluated: number
}

/** Toast notification */
export interface Toast {
  id: string
  type: 'info' | 'success' | 'error'
  message: string
  createdAt: number
}

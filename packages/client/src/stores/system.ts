/**
 * System store - manages scheduler and system state
 */

import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type {
  SchedulerNodeData,
  CycleNodeData,
  TaskPoolNodeData,
  AgentSlotsNodeData,
  AlignmentNodeData,
  MemoryNodeData,
  PanelState,
  AgentSlotData,
} from '../flow/types'
import {
  getVisibleNodes,
  getVisibleEdges,
  updateNodeData,
} from '../flow/architecture'

// =============================================================================
// Types
// =============================================================================

interface SchedulerStatus {
  running: boolean
  started_at?: string
  cycles: Array<{
    name: string
    enabled: boolean
    running: boolean
    last_run?: string
    next_run?: string
    runs_completed: number
    errors: number
  }>
}

interface SchedulerConfig {
  dispatcher_enabled: boolean
  dispatcher_interval_sec: number
  max_concurrent_tasks: number
  min_concurrent_tasks: number
  max_concurrent_ceiling: number
  blocked_task_timeout_sec: number
  blocked_check_enabled: boolean
  orphan_cancel_timeout_sec: number
  discovery_enabled: boolean
  discovery_interval_sec: number
  discovery_repos: string[]
  discovery_auto_create: string[]
  sequencer_enabled: boolean
  sequencer_interval_sec: number
  shepherd_enabled: boolean
  shepherd_batch_size: number
  armory_enabled: boolean
  armory_batch_size: number
  digest_enabled: boolean
  digest_interval_sec: number
  compaction_enabled: boolean
  compaction_day: number
  compaction_hour: number
  auto_prune_enabled: boolean
  auto_prune_threshold: number
  auto_prune_keep: number
}

interface Stats {
  total: number
  pending: number
  running: number
  done: number
  failed: number
  cancelled: number
}

// Signal data
interface Signal {
  id: string
  question: string
  options: string[]
  status: 'pending' | 'responded' | 'expired'
  response?: string
  task_id?: string
  repo_path?: string
  created_at: string
  responded_at?: string
}

// Agent config data
interface AgentConfigData {
  type: string
  command: string
  timeout_seconds: number
  max_turns: number
  supports_streaming: boolean
  enabled: boolean
  default_model?: string
  description?: string
}

// Memory data
interface MemoryPattern {
  id: string
  content: string
  source: string
  task_id?: string
  repo_path?: string
  tags: string[]
  created_at: string
}

interface MemoryWarning {
  id: string
  content: string
  severity: string
  task_id?: string
  repo_path?: string
  created_at: string
}

// Grouped memory by repo
interface RepoMemory {
  patterns: MemoryPattern[]
  warnings: MemoryWarning[]
}

interface GroupedMemory {
  global: RepoMemory
  repos: Record<string, RepoMemory>
  summary: {
    total_patterns: number
    total_warnings: number
    global_patterns: number
    global_warnings: number
    repos_with_memory: number
  }
}

// Prompt info
interface PromptInfo {
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

// Log entry
interface LogEntry {
  chunk: string
  timestamp: string
  stream: 'stdout' | 'stderr'
}

// Task logs response
interface TaskLogs {
  task_id: string
  entries: LogEntry[]
  started_at?: string
  completed_at?: string
  status: string
  from_result?: boolean
}

// Task for task pool
interface Task {
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

// Task graph node
interface TaskGraphNode {
  id: string
  title: string
  status: string
  repo_path: string
  agent?: string
  sequenced: boolean
  depends_on: string[]
  created_at: string
}

// Task graph edge
interface TaskGraphEdge {
  source: string
  target: string
}

// Task filters
interface TaskFilters {
  status?: string
  repo_path?: string
  agent?: string
  limit?: number
  offset?: number
}

// Repo data
interface Repo {
  id: string
  path: string
  name: string
  description?: string
  language?: string
  mode: 'auto' | 'align'
  weight: number
  created_at: string
  last_scanned_at?: string
}

// Directory browser result
interface BrowseDirectory {
  name: string
  path: string
  isGitRepo: boolean
  isHidden: boolean
}

interface BrowseResult {
  current: string
  parent: string | null
  directories: BrowseDirectory[]
  isGitRepo: boolean
}

// Inventory data
interface Skill {
  name: string
  description: string
  path: string
}

interface McpServer {
  name: string
  command: string
  args?: string[]
}

interface Inventory {
  skills: Skill[]
  mcps: McpServer[]
  skills_count: number
  mcps_count: number
}

// Running system agent info
interface RunningSystemAgent {
  id: string
  agent_type: 'discovery' | 'sequencer' | 'shepherd' | 'armory'
  repo_path: string | null
  started_at: string
}

interface SystemState {
  // Nodes and edges
  nodes: Node[]
  edges: Edge[]

  // Scheduler status
  scheduler: SchedulerStatus | null
  schedulerLoading: boolean
  schedulerError: string | null

  // Running system agents
  runningSystemAgents: RunningSystemAgent[]

  // Scheduler config
  schedulerConfig: SchedulerConfig | null
  schedulerConfigLoading: boolean

  // Task stats
  stats: Stats | null

  // Running tasks
  runningTasks: AgentSlotData[]

  // Signals
  signals: Signal[]
  signalsLoading: boolean
  pendingSignalCount: number
  totalSignalCount: number

  // Agent configs
  agentConfigs: Record<string, AgentConfigData>
  agentConfigsLoading: boolean

  // Memory
  patterns: MemoryPattern[]
  warnings: MemoryWarning[]
  memoryLoading: boolean
  patternCount: number
  warningCount: number
  reposWithMemory: number
  groupedMemory: GroupedMemory | null

  // Prompts
  prompts: PromptInfo[]
  promptsLoading: boolean
  selectedPrompt: PromptInfo | null
  selectedPromptLoading: boolean

  // Task logs
  taskLogs: Record<string, LogEntry[]>
  taskLogsLoading: Record<string, boolean>

  // Tasks list
  tasks: Task[]
  tasksTotal: number
  tasksLoading: boolean
  taskFilters: TaskFilters
  selectedTask: Task | null
  selectedTaskLoading: boolean
  taskGraph: { nodes: TaskGraphNode[], edges: TaskGraphEdge[] } | null
  taskGraphLoading: boolean

  // Panel state
  panel: PanelState

  // Repos
  repos: Repo[]
  reposLoading: boolean

  // Inventory
  inventory: Inventory | null
  inventoryLoading: boolean

  // SSE connection
  connected: boolean
  eventSource: EventSource | null

  // Actions
  initializeNodes: () => void
  updateSchedulerStatus: (status: SchedulerStatus) => void
  updateStats: (stats: Stats) => void
  updateRunningTasks: (tasks: AgentSlotData[]) => void
  updateSignalCounts: (pending: number, total: number) => void
  updateMemoryCounts: (patterns: number, warnings: number, repos: number) => void

  // Panel actions
  openPanel: (type: PanelState['type'], nodeId: string, data?: Record<string, unknown>) => void
  closePanel: () => void

  // Scheduler actions
  startScheduler: () => Promise<void>
  stopScheduler: () => Promise<void>
  triggerCycle: (cycleName: string) => Promise<void>
  fetchSchedulerConfig: () => Promise<void>
  updateSchedulerConfig: (updates: Partial<SchedulerConfig>) => Promise<void>

  // Data fetching
  fetchSchedulerStatus: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchRunningTasks: () => Promise<void>
  fetchSignals: () => Promise<void>
  fetchMemory: () => Promise<void>
  fetchRunningSystemAgents: () => Promise<void>
  refreshAll: () => Promise<void>

  // Signal actions
  respondToSignal: (signalId: string, response: string) => Promise<void>
  deleteSignal: (signalId: string) => Promise<void>

  // Agent config actions
  fetchAgentConfigs: () => Promise<void>
  updateAgentConfig: (agentName: string, updates: Partial<AgentConfigData>) => Promise<void>

  // Memory actions
  fetchMemoryDetails: () => Promise<void>
  deletePattern: (id: string) => Promise<void>
  deleteWarning: (id: string) => Promise<void>

  // Prompt actions
  fetchPrompts: () => Promise<void>
  fetchPrompt: (id: string) => Promise<void>
  updatePrompt: (id: string, content: string) => Promise<void>
  resetPrompt: (id: string) => Promise<void>

  // Task log actions
  fetchTaskLogs: (taskId: string) => Promise<void>
  appendTaskLog: (taskId: string, entry: LogEntry) => void
  clearTaskLogs: (taskId: string) => void

  // Task pool actions
  fetchTasks: (filters?: TaskFilters) => Promise<void>
  setTaskFilters: (filters: TaskFilters) => void
  fetchTask: (id: string) => Promise<void>
  runTask: (id: string, options?: { agent?: string; model?: string }) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  cloneTask: (id: string) => Promise<void>
  retryTask: (id: string) => Promise<void>
  fetchTaskGraph: (filters?: { repo_path?: string; status?: string }) => Promise<void>
  clearSelectedTask: () => void

  // SSE
  connectSSE: () => void
  disconnectSSE: () => void

  // Repos actions
  fetchRepos: () => Promise<void>
  updateRepo: (id: string, updates: { description?: string; mode?: 'auto' | 'align'; weight?: number }) => Promise<void>
  deleteRepo: (id: string) => Promise<void>
  addRepo: (path: string, description?: string) => Promise<void>
  browseDirectory: (path?: string) => Promise<BrowseResult>

  // Inventory actions
  fetchInventory: () => Promise<void>
  triggerArmory: (force?: boolean) => Promise<void>
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '/api'

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }
  return res.json()
}

// =============================================================================
// Store
// =============================================================================

export const useSystemStore = create<SystemState>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  scheduler: null,
  schedulerLoading: false,
  schedulerError: null,
  runningSystemAgents: [],
  schedulerConfig: null,
  schedulerConfigLoading: false,
  stats: null,
  runningTasks: [],
  signals: [],
  signalsLoading: false,
  pendingSignalCount: 0,
  totalSignalCount: 0,
  agentConfigs: {},
  agentConfigsLoading: false,
  patterns: [],
  warnings: [],
  memoryLoading: false,
  patternCount: 0,
  warningCount: 0,
  reposWithMemory: 0,
  groupedMemory: null,
  prompts: [],
  promptsLoading: false,
  selectedPrompt: null,
  selectedPromptLoading: false,
  taskLogs: {},
  taskLogsLoading: {},
  tasks: [],
  tasksTotal: 0,
  tasksLoading: false,
  taskFilters: { limit: 50, offset: 0 },
  selectedTask: null,
  selectedTaskLoading: false,
  taskGraph: null,
  taskGraphLoading: false,
  panel: { type: null, nodeId: null },
  repos: [],
  reposLoading: false,
  inventory: null,
  inventoryLoading: false,
  connected: false,
  eventSource: null,

  // Initialize nodes from architecture
  initializeNodes: () => {
    set({
      nodes: getVisibleNodes(),
      edges: getVisibleEdges(),
    })
  },

  // Update scheduler status and sync to nodes
  updateSchedulerStatus: (status) => {
    set((state) => {
      let nodes = state.nodes

      // Update scheduler node
      nodes = updateNodeData<SchedulerNodeData>(nodes, 'scheduler', {
        running: status.running,
        started_at: status.started_at,
      })

      // Update cycle nodes
      for (const cycle of status.cycles) {
        const nodeId = cycle.name === 'blocked_check' ? 'blocked-check' : cycle.name
        nodes = updateNodeData<CycleNodeData>(nodes, nodeId, {
          enabled: cycle.enabled,
          running: cycle.running,
          last_run: cycle.last_run,
          next_run: cycle.next_run,
          runs_completed: cycle.runs_completed,
          errors: cycle.errors,
        })
      }

      return { scheduler: status, nodes }
    })
  },

  // Update task stats and sync to nodes
  updateStats: (stats) => {
    set((state) => {
      const nodes = updateNodeData<TaskPoolNodeData>(state.nodes, 'task-pool', {
        counts: {
          pending: stats.pending,
          running: stats.running,
          done: stats.done,
          failed: stats.failed,
          cancelled: stats.cancelled,
        },
        total: stats.total,
      })

      return { stats, nodes }
    })
  },

  // Update running tasks and sync to agent slots node
  updateRunningTasks: (tasks) => {
    set((state) => {
      const nodes = updateNodeData<AgentSlotsNodeData>(state.nodes, 'agent-slots', {
        slots: tasks,
        active_count: tasks.length,
      })

      return { runningTasks: tasks, nodes }
    })
  },

  // Update signal counts
  updateSignalCounts: (pending, total) => {
    set((state) => {
      const nodes = updateNodeData<AlignmentNodeData>(state.nodes, 'alignment', {
        pending_count: pending,
        total_signals: total,
      })

      return { pendingSignalCount: pending, totalSignalCount: total, nodes }
    })
  },

  // Update memory counts
  updateMemoryCounts: (patterns, warnings, repos) => {
    set((state) => {
      const nodes = updateNodeData<MemoryNodeData>(state.nodes, 'memory', {
        pattern_count: patterns,
        warning_count: warnings,
        repos_with_memory: repos,
      })

      return { patternCount: patterns, warningCount: warnings, reposWithMemory: repos, nodes }
    })
  },

  // Panel actions
  openPanel: (type, nodeId, data) => {
    set({ panel: { type, nodeId, data } })
  },

  closePanel: () => {
    set({ panel: { type: null, nodeId: null } })
  },

  // Scheduler actions
  startScheduler: async () => {
    try {
      set({ schedulerLoading: true, schedulerError: null })
      const status = await fetchAPI<SchedulerStatus>('/scheduler/start', { method: 'POST' })
      get().updateSchedulerStatus(status)
    } catch (error) {
      set({ schedulerError: (error as Error).message })
    } finally {
      set({ schedulerLoading: false })
    }
  },

  stopScheduler: async () => {
    try {
      set({ schedulerLoading: true, schedulerError: null })
      const status = await fetchAPI<SchedulerStatus>('/scheduler/stop', { method: 'POST' })
      get().updateSchedulerStatus(status)
    } catch (error) {
      set({ schedulerError: (error as Error).message })
    } finally {
      set({ schedulerLoading: false })
    }
  },

  triggerCycle: async (cycleName) => {
    try {
      // Map cycle name to API endpoint
      const endpoints: Record<string, string> = {
        discovery: '/discovery/trigger',
        sequencer: '/sequencer/trigger',
        shepherd: '/shepherd/trigger',
        armory: '/inventory/armory',
        dispatcher: '/queue/run-next',
      }

      const endpoint = endpoints[cycleName]
      if (endpoint) {
        await fetchAPI(endpoint, { method: 'POST', body: JSON.stringify({}) })
        // Refresh status after trigger
        await get().fetchSchedulerStatus()
      }
    } catch (error) {
      console.error(`Failed to trigger ${cycleName}:`, error)
    }
  },

  fetchSchedulerConfig: async () => {
    try {
      set({ schedulerConfigLoading: true })
      const response = await fetchAPI<{ config: SchedulerConfig }>('/config/scheduler')
      set({ schedulerConfig: response.config })
    } catch (error) {
      console.error('Failed to fetch scheduler config:', error)
    } finally {
      set({ schedulerConfigLoading: false })
    }
  },

  updateSchedulerConfig: async (updates) => {
    try {
      set({ schedulerConfigLoading: true })
      const response = await fetchAPI<{ config: SchedulerConfig }>('/config/scheduler', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      set({ schedulerConfig: response.config })
    } catch (error) {
      console.error('Failed to update scheduler config:', error)
      throw error
    } finally {
      set({ schedulerConfigLoading: false })
    }
  },

  // Data fetching
  fetchSchedulerStatus: async () => {
    try {
      const status = await fetchAPI<SchedulerStatus>('/scheduler/status')
      get().updateSchedulerStatus(status)
    } catch (error) {
      console.error('Failed to fetch scheduler status:', error)
    }
  },

  fetchStats: async () => {
    try {
      const response = await fetchAPI<{ total_tasks: number; pending: number; running: number; done: number; failed: number; cancelled?: number }>('/stats')
      const stats: Stats = {
        total: response.total_tasks,
        pending: response.pending,
        running: response.running,
        done: response.done,
        failed: response.failed,
        cancelled: response.cancelled || 0,
      }
      get().updateStats(stats)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  },

  fetchRunningTasks: async () => {
    try {
      const response = await fetchAPI<{ tasks: Array<{
        id: string
        title: string
        agent: string
        model: string
        repo_path: string
        started_at: string
      }> }>('/tasks?status=running')

      const slots: AgentSlotData[] = (response.tasks || []).map(t => ({
        task_id: t.id,
        task_title: t.title,
        agent: t.agent || 'unknown',
        model: t.model || 'unknown',
        repo_path: t.repo_path,
        started_at: t.started_at,
      }))

      get().updateRunningTasks(slots)
    } catch (error) {
      console.error('Failed to fetch running tasks:', error)
    }
  },

  fetchSignals: async () => {
    try {
      set({ signalsLoading: true })
      const signals = await fetchAPI<Signal[]>('/signals')
      const pending = signals.filter(s => s.status === 'pending').length
      set({ signals })
      get().updateSignalCounts(pending, signals.length)
    } catch (error) {
      console.error('Failed to fetch signals:', error)
    } finally {
      set({ signalsLoading: false })
    }
  },

  fetchMemory: async () => {
    try {
      const memory = await fetchAPI<{ patterns: unknown[], warnings: unknown[] }>('/memory/global')
      // For repos with memory, we'd need another API call
      get().updateMemoryCounts(
        memory.patterns?.length || 0,
        memory.warnings?.length || 0,
        0 // TODO: fetch repos with memory
      )
    } catch (error) {
      console.error('Failed to fetch memory:', error)
    }
  },

  // Fetch running system agents from health endpoint
  fetchRunningSystemAgents: async () => {
    try {
      const health = await fetchAPI<{
        running_system_agents: RunningSystemAgent[]
      }>('/health')

      const agents = health.running_system_agents || []
      set((state) => {
        // Update cycle nodes with running state
        let nodes = state.nodes
        const runningTypes = new Set(agents.map(a => a.agent_type))

        // Update each cycle node
        for (const cycleType of ['discovery', 'sequencer', 'shepherd', 'armory'] as const) {
          const nodeId = cycleType
          const isRunning = runningTypes.has(cycleType)
          nodes = updateNodeData<CycleNodeData>(nodes, nodeId, {
            running: isRunning,
          })
        }

        return { runningSystemAgents: agents, nodes }
      })
    } catch (error) {
      console.error('Failed to fetch running system agents:', error)
    }
  },

  refreshAll: async () => {
    await Promise.all([
      get().fetchSchedulerStatus(),
      get().fetchStats(),
      get().fetchRunningTasks(),
      get().fetchSignals(),
      get().fetchMemory(),
      get().fetchRunningSystemAgents(),
    ])
  },

  // Signal actions
  respondToSignal: async (signalId, response) => {
    try {
      await fetchAPI(`/signals/${signalId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ response }),
      })
      // Refresh signals after responding
      await get().fetchSignals()
    } catch (error) {
      console.error('Failed to respond to signal:', error)
      throw error
    }
  },

  deleteSignal: async (signalId) => {
    try {
      await fetchAPI(`/signals/${signalId}`, {
        method: 'DELETE',
      })
      // Refresh signals after deleting
      await get().fetchSignals()
    } catch (error) {
      console.error('Failed to delete signal:', error)
      throw error
    }
  },

  // Agent config actions
  fetchAgentConfigs: async () => {
    try {
      set({ agentConfigsLoading: true })
      const response = await fetchAPI<{ agents: Record<string, AgentConfigData> }>('/config/agents')
      set({ agentConfigs: response.agents })
    } catch (error) {
      console.error('Failed to fetch agent configs:', error)
    } finally {
      set({ agentConfigsLoading: false })
    }
  },

  updateAgentConfig: async (agentName, updates) => {
    try {
      set({ agentConfigsLoading: true })
      await fetchAPI(`/config/agents/${agentName}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      // Refresh configs after update
      await get().fetchAgentConfigs()
    } catch (error) {
      console.error('Failed to update agent config:', error)
      throw error
    } finally {
      set({ agentConfigsLoading: false })
    }
  },

  // Memory actions
  fetchMemoryDetails: async () => {
    try {
      set({ memoryLoading: true })
      const grouped = await fetchAPI<GroupedMemory>('/memory/all')

      // Flatten for backward compatibility
      const allPatterns = [
        ...grouped.global.patterns,
        ...Object.values(grouped.repos).flatMap(r => r.patterns),
      ]
      const allWarnings = [
        ...grouped.global.warnings,
        ...Object.values(grouped.repos).flatMap(r => r.warnings),
      ]

      set({
        patterns: allPatterns,
        warnings: allWarnings,
        patternCount: grouped.summary.total_patterns,
        warningCount: grouped.summary.total_warnings,
        reposWithMemory: grouped.summary.repos_with_memory,
        groupedMemory: grouped,
      })
      get().updateMemoryCounts(
        grouped.summary.total_patterns,
        grouped.summary.total_warnings,
        grouped.summary.repos_with_memory
      )
    } catch (error) {
      console.error('Failed to fetch memory details:', error)
    } finally {
      set({ memoryLoading: false })
    }
  },

  deletePattern: async (id) => {
    try {
      await fetchAPI(`/memory/patterns/${id}`, { method: 'DELETE' })
      await get().fetchMemoryDetails()
    } catch (error) {
      console.error('Failed to delete pattern:', error)
      throw error
    }
  },

  deleteWarning: async (id) => {
    try {
      await fetchAPI(`/memory/warnings/${id}`, { method: 'DELETE' })
      await get().fetchMemoryDetails()
    } catch (error) {
      console.error('Failed to delete warning:', error)
      throw error
    }
  },

  // Prompt actions
  fetchPrompts: async () => {
    try {
      set({ promptsLoading: true })
      const response = await fetchAPI<{ prompts: PromptInfo[] }>('/prompts')
      set({ prompts: response.prompts || [] })
    } catch (error) {
      console.error('Failed to fetch prompts:', error)
    } finally {
      set({ promptsLoading: false })
    }
  },

  fetchPrompt: async (id) => {
    try {
      set({ selectedPromptLoading: true })
      const prompt = await fetchAPI<PromptInfo>(`/prompts/${id}`)
      set({ selectedPrompt: prompt })
    } catch (error) {
      console.error('Failed to fetch prompt:', error)
      throw error
    } finally {
      set({ selectedPromptLoading: false })
    }
  },

  updatePrompt: async (id, content) => {
    try {
      set({ selectedPromptLoading: true })
      await fetchAPI(`/prompts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      // Refresh prompt after update
      await get().fetchPrompt(id)
      await get().fetchPrompts()
    } catch (error) {
      console.error('Failed to update prompt:', error)
      throw error
    } finally {
      set({ selectedPromptLoading: false })
    }
  },

  resetPrompt: async (id) => {
    try {
      set({ selectedPromptLoading: true })
      await fetchAPI(`/prompts/${id}/reset`, { method: 'POST' })
      // Refresh prompt after reset
      await get().fetchPrompt(id)
      await get().fetchPrompts()
    } catch (error) {
      console.error('Failed to reset prompt:', error)
      throw error
    } finally {
      set({ selectedPromptLoading: false })
    }
  },

  // Task log actions
  fetchTaskLogs: async (taskId) => {
    try {
      set((state) => ({
        taskLogsLoading: { ...state.taskLogsLoading, [taskId]: true },
      }))
      const response = await fetchAPI<TaskLogs>(`/tasks/${taskId}/logs`)
      set((state) => ({
        taskLogs: { ...state.taskLogs, [taskId]: response.entries || [] },
      }))
    } catch (error) {
      console.error('Failed to fetch task logs:', error)
    } finally {
      set((state) => ({
        taskLogsLoading: { ...state.taskLogsLoading, [taskId]: false },
      }))
    }
  },

  appendTaskLog: (taskId, entry) => {
    set((state) => ({
      taskLogs: {
        ...state.taskLogs,
        [taskId]: [...(state.taskLogs[taskId] || []), entry],
      },
    }))
  },

  clearTaskLogs: (taskId) => {
    set((state) => {
      const { [taskId]: _, ...rest } = state.taskLogs
      return { taskLogs: rest }
    })
  },

  // Task pool actions
  fetchTasks: async (filters) => {
    const currentFilters = filters ?? get().taskFilters
    try {
      set({ tasksLoading: true })
      const params = new URLSearchParams()
      if (currentFilters.status) params.set('status', currentFilters.status)
      if (currentFilters.repo_path) params.set('repo_path', currentFilters.repo_path)
      if (currentFilters.limit) params.set('limit', String(currentFilters.limit))
      if (currentFilters.offset) params.set('offset', String(currentFilters.offset))

      const response = await fetchAPI<{ tasks: Task[], total: number }>(`/tasks?${params}`)
      set({
        tasks: response.tasks || [],
        tasksTotal: response.total || 0,
        taskFilters: currentFilters,
      })
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      set({ tasksLoading: false })
    }
  },

  setTaskFilters: (filters) => {
    set({ taskFilters: filters })
  },

  fetchTask: async (id) => {
    try {
      set({ selectedTaskLoading: true })
      const response = await fetchAPI<{ task: Task }>(`/tasks/${id}`)
      set({ selectedTask: response.task })
    } catch (error) {
      console.error('Failed to fetch task:', error)
      throw error
    } finally {
      set({ selectedTaskLoading: false })
    }
  },

  runTask: async (id, options) => {
    try {
      await fetchAPI(`/tasks/${id}/run`, {
        method: 'POST',
        body: options ? JSON.stringify(options) : undefined,
      })
      // Refresh tasks and stats
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to run task:', error)
      throw error
    }
  },

  cancelTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}/cancel`, { method: 'POST' })
      // Refresh tasks and stats
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to cancel task:', error)
      throw error
    }
  },

  deleteTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}`, { method: 'DELETE' })
      // Clear selected if deleted
      if (get().selectedTask?.id === id) {
        set({ selectedTask: null })
      }
      // Refresh tasks and stats
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to delete task:', error)
      throw error
    }
  },

  cloneTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}/clone`, { method: 'POST' })
      // Refresh tasks and stats
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to clone task:', error)
      throw error
    }
  },

  retryTask: async (id) => {
    try {
      // Clone and immediately run
      const response = await fetchAPI<{ task: Task }>(`/tasks/${id}/clone`, { method: 'POST' })
      if (response.task) {
        await fetchAPI(`/tasks/${response.task.id}/run`, { method: 'POST' })
      }
      // Refresh tasks and stats
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to retry task:', error)
      throw error
    }
  },

  fetchTaskGraph: async (filters) => {
    try {
      set({ taskGraphLoading: true })
      const params = new URLSearchParams()
      if (filters?.repo_path) params.set('repo_path', filters.repo_path)
      if (filters?.status) params.set('status', filters.status)

      const graph = await fetchAPI<{ nodes: TaskGraphNode[], edges: TaskGraphEdge[] }>(`/tasks/graph?${params}`)
      set({ taskGraph: graph })
    } catch (error) {
      console.error('Failed to fetch task graph:', error)
    } finally {
      set({ taskGraphLoading: false })
    }
  },

  clearSelectedTask: () => {
    set({ selectedTask: null })
  },

  // SSE connection
  connectSSE: () => {
    const state = get()
    if (state.eventSource) return

    const eventSource = new EventSource('/api/events')

    eventSource.addEventListener('connected', () => {
      set({ connected: true })
      console.log('[SSE] Connected to system events')
    })

    // Handle scheduler events
    eventSource.addEventListener('scheduler:started', () => {
      get().fetchSchedulerStatus()
    })

    eventSource.addEventListener('scheduler:stopped', () => {
      get().fetchSchedulerStatus()
    })

    eventSource.addEventListener('scheduler:cycle', () => {
      get().fetchSchedulerStatus()
    })

    // Handle task events
    eventSource.addEventListener('task:started', () => {
      get().fetchRunningTasks()
      get().fetchStats()
    })

    eventSource.addEventListener('task:completed', () => {
      get().fetchRunningTasks()
      get().fetchStats()
    })

    eventSource.addEventListener('task:failed', () => {
      get().fetchRunningTasks()
      get().fetchStats()
    })

    eventSource.addEventListener('task:created', () => {
      get().fetchStats()
    })

    // Handle task output events (for live logs)
    eventSource.addEventListener('task:output', (event) => {
      try {
        const data = JSON.parse(event.data)
        const taskId = data.task_id || data.id
        if (taskId && data.chunk) {
          get().appendTaskLog(taskId, {
            chunk: data.chunk,
            timestamp: data.timestamp || new Date().toISOString(),
            stream: data.stream || 'stdout',
          })
        }
      } catch (e) {
        // Ignore parse errors
      }
    })

    // Handle system agent events
    eventSource.addEventListener('system:agent_started', () => {
      get().fetchRunningSystemAgents()
    })

    eventSource.addEventListener('agent:completed', () => {
      get().fetchRunningSystemAgents()
      get().fetchStats() // Tasks may have been created
    })

    eventSource.addEventListener('agent:failed', () => {
      get().fetchRunningSystemAgents()
    })

    // Handle signal events
    eventSource.addEventListener('signal:created', () => {
      get().fetchSignals()
    })

    eventSource.addEventListener('signal:responded', () => {
      get().fetchSignals()
    })

    // Handle memory events
    eventSource.addEventListener('memory:updated', () => {
      get().fetchMemory()
    })

    // Error handling
    eventSource.onerror = () => {
      console.warn('[SSE] Connection error, reconnecting...')
      set({ connected: false })
    }

    set({ eventSource })
  },

  disconnectSSE: () => {
    const { eventSource } = get()
    if (eventSource) {
      eventSource.close()
      set({ eventSource: null, connected: false })
    }
  },

  // Repos actions
  fetchRepos: async () => {
    try {
      set({ reposLoading: true })
      const repos = await fetchAPI<Repo[]>('/repos')
      set({ repos })
    } catch (error) {
      console.error('Failed to fetch repos:', error)
    } finally {
      set({ reposLoading: false })
    }
  },

  updateRepo: async (id, updates) => {
    try {
      set({ reposLoading: true })
      await fetchAPI(`/repos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      // Refresh repos after update
      await get().fetchRepos()
    } catch (error) {
      console.error('Failed to update repo:', error)
      throw error
    } finally {
      set({ reposLoading: false })
    }
  },

  deleteRepo: async (id) => {
    try {
      await fetchAPI(`/repos/${id}`, { method: 'DELETE' })
      // Refresh repos after delete
      await get().fetchRepos()
    } catch (error) {
      console.error('Failed to delete repo:', error)
      throw error
    }
  },

  addRepo: async (path, description) => {
    try {
      set({ reposLoading: true })
      await fetchAPI('/repos', {
        method: 'POST',
        body: JSON.stringify({ path, description }),
      })
      // Refresh repos after add
      await get().fetchRepos()
    } catch (error) {
      console.error('Failed to add repo:', error)
      throw error
    } finally {
      set({ reposLoading: false })
    }
  },

  browseDirectory: async (path) => {
    const url = path ? `/repos/browse?path=${encodeURIComponent(path)}` : '/repos/browse'
    return fetchAPI<BrowseResult>(url)
  },

  // Inventory actions
  fetchInventory: async () => {
    try {
      set({ inventoryLoading: true })
      const inventory = await fetchAPI<Inventory>('/inventory')
      set({ inventory })
    } catch (error) {
      console.error('Failed to fetch inventory:', error)
    } finally {
      set({ inventoryLoading: false })
    }
  },

  triggerArmory: async (force = false) => {
    try {
      await fetchAPI(`/inventory/armory${force ? '?force=true' : ''}`, {
        method: 'POST',
      })
    } catch (error) {
      console.error('Failed to trigger armory:', error)
      throw error
    }
  },
}))

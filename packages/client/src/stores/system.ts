/**
 * System store - facade re-exporting from domain stores
 *
 * Maintained for backward compatibility during migration.
 * New code should import from domain stores directly.
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
import { fetchAPI } from './api'
import { useUIStore } from './uiStore'
import type {
  Stats,
  SchedulerStatus,
  AgentConfigData,
  GroupedMemory,
  PromptInfo,
  LogEntry,
  TaskLogs,
  Task,
  TaskFilters,
  TaskGraphNode,
  TaskGraphEdge,
  RunningSystemAgent,
  Inventory,
  BrowseResult,
  ShepherdStatus,
} from '../types'
import type { MemoryPattern, MemoryWarning, SchedulerConfig } from '@mycelium/shared'

// Re-export domain stores for direct access
export { useUIStore } from './uiStore'
export { useSchedulerStore } from './schedulerStore'
export { useTaskStore } from './taskStore'
export { useSignalStore } from './signalStore'
export { useMemoryStore } from './memoryStore'
export { usePromptStore } from './promptStore'
export { useRepoStore } from './repoStore'
export { useInventoryStore } from './inventoryStore'
export { useAgentStore } from './agentStore'
export { useConnectionStore } from './connectionStore'
export { useFlowStore } from './flowStore'

// =============================================================================
// Legacy combined store - kept for Panel.tsx backward compatibility
// =============================================================================

interface SystemState {
  nodes: Node[]
  edges: Edge[]
  scheduler: SchedulerStatus | null
  schedulerLoading: boolean
  schedulerError: string | null
  runningSystemAgents: RunningSystemAgent[]
  schedulerConfig: SchedulerConfig | null
  schedulerConfigLoading: boolean
  stats: Stats | null
  runningTasks: AgentSlotData[]
  signals: import('@mycelium/shared').Signal[]
  signalsLoading: boolean
  pendingSignalCount: number
  totalSignalCount: number
  agentConfigs: Record<string, AgentConfigData>
  agentConfigsLoading: boolean
  patterns: MemoryPattern[]
  warnings: MemoryWarning[]
  memoryLoading: boolean
  patternCount: number
  warningCount: number
  reposWithMemory: number
  groupedMemory: GroupedMemory | null
  prompts: PromptInfo[]
  promptsLoading: boolean
  selectedPrompt: PromptInfo | null
  selectedPromptLoading: boolean
  taskLogs: Record<string, LogEntry[]>
  taskLogsLoading: Record<string, boolean>
  tasks: Task[]
  tasksTotal: number
  tasksLoading: boolean
  taskFilters: TaskFilters
  selectedTask: Task | null
  selectedTaskLoading: boolean
  taskGraph: { nodes: TaskGraphNode[]; edges: TaskGraphEdge[] } | null
  taskGraphLoading: boolean
  panel: PanelState
  repos: import('@mycelium/shared').Repo[]
  reposLoading: boolean
  inventory: Inventory | null
  inventoryLoading: boolean
  shepherdStatus: ShepherdStatus | null
  connected: boolean
  eventSource: EventSource | null

  initializeNodes: () => void
  updateSchedulerStatus: (status: SchedulerStatus) => void
  updateStats: (stats: Stats) => void
  updateRunningTasks: (tasks: AgentSlotData[]) => void
  updateSignalCounts: (pending: number, total: number) => void
  updateMemoryCounts: (patterns: number, warnings: number, repos: number) => void

  openPanel: (type: PanelState['type'], nodeId: string, data?: Record<string, unknown>) => void
  closePanel: () => void

  startScheduler: () => Promise<void>
  stopScheduler: () => Promise<void>
  triggerCycle: (cycleName: string) => Promise<void>
  fetchSchedulerConfig: () => Promise<void>
  updateSchedulerConfig: (updates: Partial<SchedulerConfig>) => Promise<void>

  fetchSchedulerStatus: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchRunningTasks: () => Promise<void>
  fetchSignals: () => Promise<void>
  fetchMemory: () => Promise<void>
  fetchRunningSystemAgents: () => Promise<void>
  refreshAll: () => Promise<void>

  respondToSignal: (signalId: string, response: string) => Promise<void>
  deleteSignal: (signalId: string) => Promise<void>

  fetchAgentConfigs: () => Promise<void>
  updateAgentConfig: (agentName: string, updates: Partial<AgentConfigData>) => Promise<void>

  fetchMemoryDetails: () => Promise<void>
  deletePattern: (id: string) => Promise<void>
  deleteWarning: (id: string) => Promise<void>

  fetchPrompts: () => Promise<void>
  fetchPrompt: (id: string) => Promise<void>
  updatePrompt: (id: string, content: string) => Promise<void>
  resetPrompt: (id: string) => Promise<void>

  fetchTaskLogs: (taskId: string) => Promise<void>
  appendTaskLog: (taskId: string, entry: LogEntry) => void
  clearTaskLogs: (taskId: string) => void

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

  connectSSE: () => void
  disconnectSSE: () => void

  fetchRepos: () => Promise<void>
  updateRepo: (id: string, updates: { description?: string; mode?: 'auto' | 'align'; weight?: number }) => Promise<void>
  deleteRepo: (id: string) => Promise<void>
  addRepo: (path: string, description?: string) => Promise<void>
  browseDirectory: (path?: string) => Promise<BrowseResult>

  fetchInventory: () => Promise<void>
  triggerArmory: (force?: boolean) => Promise<void>
  fetchShepherdStatus: () => Promise<void>
}

export const useSystemStore = create<SystemState>((set, get) => ({
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
  shepherdStatus: null,
  connected: false,
  eventSource: null,

  initializeNodes: () => {
    set({
      nodes: getVisibleNodes(),
      edges: getVisibleEdges(),
    })
  },

  updateSchedulerStatus: (status) => {
    set((state) => {
      let nodes = state.nodes
      nodes = updateNodeData<SchedulerNodeData>(nodes, 'scheduler', {
        running: status.running,
        started_at: status.started_at,
      })
      for (const cycle of status.cycles) {
        const nodeId = cycle.name === 'blocked_check' ? 'blocked-check'
          : cycle.name === 'health_check' ? 'health-check'
          : cycle.name
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

  updateStats: (stats) => {
    set((state) => {
      const nodes = updateNodeData<TaskPoolNodeData>(state.nodes, 'task-pool', {
        counts: {
          pending: stats.pending,
          unsequenced: stats.unsequenced,
          waiting: stats.waiting,
          ready: stats.ready,
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

  updateRunningTasks: (tasks) => {
    set((state) => {
      const nodes = updateNodeData<AgentSlotsNodeData>(state.nodes, 'agent-slots', {
        slots: tasks,
        active_count: tasks.length,
      })
      return { runningTasks: tasks, nodes }
    })
  },

  updateSignalCounts: (pending, total) => {
    set((state) => {
      const nodes = updateNodeData<AlignmentNodeData>(state.nodes, 'alignment', {
        pending_count: pending,
        total_signals: total,
      })
      return { pendingSignalCount: pending, totalSignalCount: total, nodes }
    })
  },

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

  openPanel: (type, nodeId, data) => {
    set({ panel: { type, nodeId, data } })
    // Also update uiStore so RightPanel in three-column layout works
    useUIStore.getState().openPanel(type!, nodeId, data)
  },

  closePanel: () => {
    set({ panel: { type: null, nodeId: null } })
    useUIStore.getState().closePanel()
  },

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
      const response = await fetchAPI<{
        total_tasks: number; pending: number; running: number; done: number; failed: number;
        cancelled?: number; unsequenced?: number; waiting?: number; ready?: number
      }>('/stats')
      const stats: Stats = {
        total: response.total_tasks,
        pending: response.pending,
        running: response.running,
        done: response.done,
        failed: response.failed,
        cancelled: response.cancelled ?? 0,
        unsequenced: response.unsequenced ?? 0,
        waiting: response.waiting ?? 0,
        ready: response.ready ?? 0,
      }
      get().updateStats(stats)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  },

  fetchRunningTasks: async () => {
    try {
      const response = await fetchAPI<{ tasks: Array<{
        id: string; title: string; agent: string; model: string; repo_path: string; started_at: string
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
      const signals = await fetchAPI<import('@mycelium/shared').Signal[]>('/signals')
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
      const grouped = await fetchAPI<GroupedMemory>('/memory/all')
      set({ groupedMemory: grouped })
      get().updateMemoryCounts(
        grouped.summary.total_patterns,
        grouped.summary.total_warnings,
        grouped.summary.repos_with_memory
      )
    } catch (error) {
      console.error('Failed to fetch memory:', error)
    }
  },

  fetchRunningSystemAgents: async () => {
    try {
      const health = await fetchAPI<{ running_system_agents: RunningSystemAgent[] }>('/health')
      const agents = health.running_system_agents || []
      set((state) => {
        let nodes = state.nodes
        const runningTypes = new Set(agents.map(a => a.agent_type))
        for (const cycleType of ['discovery', 'sequencer', 'shepherd', 'armory'] as const) {
          nodes = updateNodeData<CycleNodeData>(nodes, cycleType, {
            running: runningTypes.has(cycleType),
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
      get().fetchShepherdStatus(),
    ])
  },

  respondToSignal: async (signalId, response) => {
    try {
      await fetchAPI(`/signals/${signalId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ response }),
      })
      await get().fetchSignals()
    } catch (error) {
      console.error('Failed to respond to signal:', error)
      throw error
    }
  },

  deleteSignal: async (signalId) => {
    try {
      await fetchAPI(`/signals/${signalId}`, { method: 'DELETE' })
      await get().fetchSignals()
    } catch (error) {
      console.error('Failed to delete signal:', error)
      throw error
    }
  },

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
      await get().fetchAgentConfigs()
    } catch (error) {
      console.error('Failed to update agent config:', error)
      throw error
    } finally {
      set({ agentConfigsLoading: false })
    }
  },

  fetchMemoryDetails: async () => {
    try {
      set({ memoryLoading: true })
      const grouped = await fetchAPI<GroupedMemory>('/memory/all')
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
      await get().fetchPrompt(id)
      await get().fetchPrompts()
    } catch (error) {
      console.error('Failed to reset prompt:', error)
      throw error
    } finally {
      set({ selectedPromptLoading: false })
    }
  },

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

  fetchTasks: async (filters) => {
    const currentFilters = filters ?? get().taskFilters
    try {
      set({ tasksLoading: true })
      const params = new URLSearchParams()
      if (currentFilters.status) params.set('status', currentFilters.status)
      if (currentFilters.repo_path) params.set('repo_path', currentFilters.repo_path)
      if (currentFilters.limit) params.set('limit', String(currentFilters.limit))
      if (currentFilters.offset) params.set('offset', String(currentFilters.offset))
      const response = await fetchAPI<{ tasks: Task[]; total: number }>(`/tasks?${params}`)
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
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to run task:', error)
      throw error
    }
  },

  cancelTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}/cancel`, { method: 'POST' })
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to cancel task:', error)
      throw error
    }
  },

  deleteTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}`, { method: 'DELETE' })
      if (get().selectedTask?.id === id) {
        set({ selectedTask: null })
      }
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to delete task:', error)
      throw error
    }
  },

  cloneTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}/clone`, { method: 'POST' })
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to clone task:', error)
      throw error
    }
  },

  retryTask: async (id) => {
    try {
      const response = await fetchAPI<{ task: Task }>(`/tasks/${id}/clone`, { method: 'POST' })
      if (response.task) {
        await fetchAPI(`/tasks/${response.task.id}/run`, { method: 'POST' })
      }
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
      const graph = await fetchAPI<{ nodes: TaskGraphNode[]; edges: TaskGraphEdge[] }>(`/tasks/graph?${params}`)
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

  connectSSE: () => {
    const state = get()
    if (state.eventSource) return
    const eventSource = new EventSource('/api/events')

    eventSource.addEventListener('connected', () => {
      set({ connected: true })
    })
    eventSource.addEventListener('scheduler:started', () => { get().fetchSchedulerStatus() })
    eventSource.addEventListener('scheduler:stopped', () => { get().fetchSchedulerStatus() })
    eventSource.addEventListener('scheduler:cycle', () => { get().fetchSchedulerStatus() })
    eventSource.addEventListener('task:started', () => { get().fetchRunningTasks(); get().fetchStats() })
    eventSource.addEventListener('task:completed', () => { get().fetchRunningTasks(); get().fetchStats() })
    eventSource.addEventListener('task:failed', () => { get().fetchRunningTasks(); get().fetchStats() })
    eventSource.addEventListener('task:created', () => { get().fetchStats() })
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
      } catch { /* ignore */ }
    })
    eventSource.addEventListener('system:agent_started', () => { get().fetchRunningSystemAgents() })
    eventSource.addEventListener('agent:completed', () => { get().fetchRunningSystemAgents(); get().fetchStats() })
    eventSource.addEventListener('agent:failed', () => { get().fetchRunningSystemAgents() })
    eventSource.addEventListener('signal:created', () => { get().fetchSignals() })
    eventSource.addEventListener('signal:responded', () => { get().fetchSignals() })
    eventSource.addEventListener('memory:updated', () => { get().fetchMemory() })
    eventSource.onerror = () => { set({ connected: false }) }

    set({ eventSource })
  },

  disconnectSSE: () => {
    const { eventSource } = get()
    if (eventSource) {
      eventSource.close()
      set({ eventSource: null, connected: false })
    }
  },

  fetchRepos: async () => {
    try {
      set({ reposLoading: true })
      const repos = await fetchAPI<import('@mycelium/shared').Repo[]>('/repos')
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
      await fetchAPI(`/repos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })
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
      await get().fetchRepos()
    } catch (error) {
      console.error('Failed to delete repo:', error)
      throw error
    }
  },

  addRepo: async (path, description) => {
    try {
      set({ reposLoading: true })
      await fetchAPI('/repos', { method: 'POST', body: JSON.stringify({ path, description }) })
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
      await fetchAPI(`/inventory/armory${force ? '?force=true' : ''}`, { method: 'POST' })
    } catch (error) {
      console.error('Failed to trigger armory:', error)
      throw error
    }
  },

  fetchShepherdStatus: async () => {
    try {
      const status = await fetchAPI<ShepherdStatus>('/shepherd/status')
      set({ shepherdStatus: status })
    } catch (error) {
      console.error('Failed to fetch shepherd status:', error)
    }
  },
}))

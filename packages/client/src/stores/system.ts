/**
 * System store - thin facade that delegates to domain stores.
 *
 * No own state. No own SSE connection.
 * All callers should migrate to domain stores directly; this exists
 * only for backward compatibility during migration.
 */

import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type {
  PanelState,
  AgentSlotData,
} from '../flow/types'
import type {
  Stats,
  SchedulerStatus,
  AgentConfigData,
  GroupedMemory,
  PromptInfo,
  LogEntry,
  Task,
  TaskFilters,
  TaskGraphNode,
  TaskGraphEdge,
  RunningSystemAgent,
  Inventory,
  BrowseResult,
  ShepherdStatus,
} from '../types'
import type { AgentHealthEntry, ClineInfo, AgentStatsResponse } from './agentStore'
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

// Import domain stores for delegation
import { useUIStore } from './uiStore'
import { useSchedulerStore } from './schedulerStore'
import { useTaskStore } from './taskStore'
import { useSignalStore } from './signalStore'
import { useMemoryStore } from './memoryStore'
import { usePromptStore } from './promptStore'
import { useRepoStore } from './repoStore'
import { useInventoryStore } from './inventoryStore'
import { useAgentStore } from './agentStore'
import { useConnectionStore } from './connectionStore'
import { useFlowStore } from './flowStore'

// =============================================================================
// Thin facade store - delegates all state and actions to domain stores.
// No own state. Callers should migrate to domain stores directly.
// =============================================================================

interface SystemState {
  // All getters delegate to domain stores via get()
  readonly nodes: Node[]
  readonly edges: Edge[]
  readonly scheduler: SchedulerStatus | null
  readonly schedulerLoading: boolean
  readonly schedulerError: string | null
  readonly runningSystemAgents: RunningSystemAgent[]
  readonly schedulerConfig: SchedulerConfig | null
  readonly schedulerConfigLoading: boolean
  readonly stats: Stats | null
  readonly runningTasks: AgentSlotData[]
  readonly signals: import('@mycelium/shared').Signal[]
  readonly signalsLoading: boolean
  readonly pendingSignalCount: number
  readonly totalSignalCount: number
  readonly agentConfigs: Record<string, AgentConfigData>
  readonly agentConfigsLoading: boolean
  readonly agentHealth: Record<string, AgentHealthEntry>
  readonly clineInfo: ClineInfo | null
  readonly agentStats: AgentStatsResponse | null
  readonly agentStatsLoading: boolean
  readonly patterns: MemoryPattern[]
  readonly warnings: MemoryWarning[]
  readonly memoryLoading: boolean
  readonly patternCount: number
  readonly warningCount: number
  readonly reposWithMemory: number
  readonly groupedMemory: GroupedMemory | null
  readonly prompts: PromptInfo[]
  readonly promptsLoading: boolean
  readonly selectedPrompt: PromptInfo | null
  readonly selectedPromptLoading: boolean
  readonly taskLogs: Record<string, LogEntry[]>
  readonly taskLogsLoading: Record<string, boolean>
  readonly tasks: Task[]
  readonly tasksTotal: number
  readonly tasksLoading: boolean
  readonly taskFilters: TaskFilters
  readonly selectedTask: Task | null
  readonly selectedTaskLoading: boolean
  readonly taskGraph: { nodes: TaskGraphNode[]; edges: TaskGraphEdge[] } | null
  readonly taskGraphLoading: boolean
  readonly panel: PanelState
  readonly repos: import('@mycelium/shared').Repo[]
  readonly reposLoading: boolean
  readonly inventory: Inventory | null
  readonly inventoryLoading: boolean
  readonly shepherdStatus: ShepherdStatus | null
  readonly connected: boolean

  // Actions - delegate to domain stores
  initializeNodes: () => void
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
  fetchAgentHealth: () => Promise<void>
  fetchAgentStats: () => Promise<void>
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

/**
 * Snapshot all domain stores into a flat object.
 * Called on every useSystemStore() render to provide current values.
 */
function snapshotDomainStores() {
  const sched = useSchedulerStore.getState()
  const task = useTaskStore.getState()
  const signal = useSignalStore.getState()
  const mem = useMemoryStore.getState()
  const prompt = usePromptStore.getState()
  const repo = useRepoStore.getState()
  const inv = useInventoryStore.getState()
  const agent = useAgentStore.getState()
  const conn = useConnectionStore.getState()
  const flow = useFlowStore.getState()
  const ui = useUIStore.getState()

  return {
    // Flow
    nodes: flow.nodes,
    edges: flow.edges,

    // Scheduler
    scheduler: sched.scheduler,
    schedulerLoading: sched.schedulerLoading,
    schedulerError: sched.schedulerError,
    runningSystemAgents: sched.runningSystemAgents,
    schedulerConfig: sched.schedulerConfig,
    schedulerConfigLoading: sched.schedulerConfigLoading,
    shepherdStatus: sched.shepherdStatus,

    // Tasks
    stats: task.stats,
    runningTasks: task.runningTasks,
    tasks: task.tasks,
    tasksTotal: task.tasksTotal,
    tasksLoading: task.tasksLoading,
    taskFilters: task.taskFilters,
    selectedTask: task.selectedTask,
    selectedTaskLoading: task.selectedTaskLoading,
    taskGraph: task.taskGraph,
    taskGraphLoading: task.taskGraphLoading,
    taskLogs: task.taskLogs,
    taskLogsLoading: task.taskLogsLoading,

    // Signals
    signals: signal.signals,
    signalsLoading: signal.signalsLoading,
    pendingSignalCount: signal.pendingSignalCount,
    totalSignalCount: signal.totalSignalCount,

    // Memory
    patterns: mem.patterns,
    warnings: mem.warnings,
    memoryLoading: mem.memoryLoading,
    patternCount: mem.patternCount,
    warningCount: mem.warningCount,
    reposWithMemory: mem.reposWithMemory,
    groupedMemory: mem.groupedMemory,

    // Prompts
    prompts: prompt.prompts,
    promptsLoading: prompt.promptsLoading,
    selectedPrompt: prompt.selectedPrompt,
    selectedPromptLoading: prompt.selectedPromptLoading,

    // Agents
    agentConfigs: agent.agentConfigs,
    agentConfigsLoading: agent.agentConfigsLoading,
    agentHealth: agent.agentHealth,
    clineInfo: agent.clineInfo,
    agentStats: agent.agentStats,
    agentStatsLoading: agent.agentStatsLoading,

    // Repos
    repos: repo.repos,
    reposLoading: repo.reposLoading,

    // Inventory
    inventory: inv.inventory,
    inventoryLoading: inv.inventoryLoading,

    // Connection
    connected: conn.connected,

    // UI
    panel: ui.panel,
  }
}

export const useSystemStore = create<SystemState>()((set) => {
  // Subscribe to all domain stores and sync snapshot into this store.
  // This ensures React components re-render when domain state changes.
  const stores = [
    useSchedulerStore, useTaskStore, useSignalStore, useMemoryStore,
    usePromptStore, useRepoStore, useInventoryStore, useAgentStore,
    useConnectionStore, useFlowStore, useUIStore,
  ]
  for (const store of stores) {
    store.subscribe(() => {
      set(snapshotDomainStores())
    })
  }

  return {
    // Initial snapshot
    ...snapshotDomainStores(),

    // Flow actions
    initializeNodes: () => useFlowStore.getState().initializeNodes(),

    // UI actions
    openPanel: (type, nodeId, data) => useUIStore.getState().openPanel(type!, nodeId, data),
    closePanel: () => useUIStore.getState().closePanel(),

    // Scheduler actions
    startScheduler: () => useSchedulerStore.getState().startScheduler(),
    stopScheduler: () => useSchedulerStore.getState().stopScheduler(),
    triggerCycle: (cycleName) => useSchedulerStore.getState().triggerCycle(cycleName),
    fetchSchedulerConfig: () => useSchedulerStore.getState().fetchSchedulerConfig(),
    updateSchedulerConfig: (updates) => useSchedulerStore.getState().updateSchedulerConfig(updates),
    fetchSchedulerStatus: () => useSchedulerStore.getState().fetchSchedulerStatus(),
    fetchRunningSystemAgents: () => useSchedulerStore.getState().fetchRunningSystemAgents(),
    fetchShepherdStatus: () => useSchedulerStore.getState().fetchShepherdStatus(),

    // Task actions
    fetchStats: () => useTaskStore.getState().fetchStats(),
    fetchRunningTasks: () => useTaskStore.getState().fetchRunningTasks(),
    fetchTasks: (filters) => useTaskStore.getState().fetchTasks(filters),
    setTaskFilters: (filters) => useTaskStore.getState().setTaskFilters(filters),
    fetchTask: (id) => useTaskStore.getState().fetchTask(id),
    runTask: (id, options) => useTaskStore.getState().runTask(id, options),
    cancelTask: (id) => useTaskStore.getState().cancelTask(id),
    deleteTask: (id) => useTaskStore.getState().deleteTask(id),
    cloneTask: (id) => useTaskStore.getState().cloneTask(id),
    retryTask: (id) => useTaskStore.getState().retryTask(id),
    fetchTaskGraph: (filters) => useTaskStore.getState().fetchTaskGraph(filters),
    clearSelectedTask: () => useTaskStore.getState().clearSelectedTask(),
    fetchTaskLogs: (taskId) => useTaskStore.getState().fetchTaskLogs(taskId),
    appendTaskLog: (taskId, entry) => useTaskStore.getState().appendTaskLog(taskId, entry),
    clearTaskLogs: (taskId) => useTaskStore.getState().clearTaskLogs(taskId),

    // Signal actions
    fetchSignals: () => useSignalStore.getState().fetchSignals(),
    respondToSignal: (signalId, response) => useSignalStore.getState().respondToSignal(signalId, response),
    deleteSignal: (signalId) => useSignalStore.getState().deleteSignal(signalId),

    // Memory actions
    fetchMemory: () => useMemoryStore.getState().fetchMemory(),
    fetchMemoryDetails: () => useMemoryStore.getState().fetchMemoryDetails(),
    deletePattern: (id) => useMemoryStore.getState().deletePattern(id),
    deleteWarning: (id) => useMemoryStore.getState().deleteWarning(id),

    // Prompt actions
    fetchPrompts: () => usePromptStore.getState().fetchPrompts(),
    fetchPrompt: (id) => usePromptStore.getState().fetchPrompt(id),
    updatePrompt: (id, content) => usePromptStore.getState().updatePrompt(id, content),
    resetPrompt: (id) => usePromptStore.getState().resetPrompt(id),

    // Agent actions
    fetchAgentConfigs: () => useAgentStore.getState().fetchAgentConfigs(),
    updateAgentConfig: (agentName, updates) => useAgentStore.getState().updateAgentConfig(agentName, updates),
    fetchAgentHealth: () => useAgentStore.getState().fetchHealth(),
    fetchAgentStats: () => useAgentStore.getState().fetchAgentStats(),

    // Repo actions
    fetchRepos: () => useRepoStore.getState().fetchRepos(),
    updateRepo: (id, updates) => useRepoStore.getState().updateRepo(id, updates),
    deleteRepo: (id) => useRepoStore.getState().deleteRepo(id),
    addRepo: (path, description) => useRepoStore.getState().addRepo(path, description),
    browseDirectory: (path) => useRepoStore.getState().browseDirectory(path),

    // Inventory actions
    fetchInventory: () => useInventoryStore.getState().fetchInventory(),
    triggerArmory: (force) => useInventoryStore.getState().triggerArmory(force),

    // Connection actions (delegate to connectionStore)
    connectSSE: () => useConnectionStore.getState().connectSSE(),
    disconnectSSE: () => useConnectionStore.getState().disconnectSSE(),

    // Composite actions
    refreshAll: async () => {
      await Promise.all([
        useSchedulerStore.getState().fetchSchedulerStatus(),
        useTaskStore.getState().fetchStats(),
        useTaskStore.getState().fetchRunningTasks(),
        useSignalStore.getState().fetchSignals(),
        useMemoryStore.getState().fetchMemory(),
        useSchedulerStore.getState().fetchRunningSystemAgents(),
        useSchedulerStore.getState().fetchShepherdStatus(),
        useRepoStore.getState().fetchRepos(),
      ])
    },
  }
})

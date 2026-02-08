/**
 * Task Store - tasks, logs, graph, filters, stats, running tasks
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import { useUIStore } from './uiStore'
import { useFlowStore } from './flowStore'
import type {
  Stats,
  Task,
  TaskFilters,
  TaskGraphNode,
  TaskGraphEdge,
  LogEntry,
  TaskLogs,
  AgentSlotData,
} from '../types'

interface TaskState {
  // Stats
  stats: Stats | null

  // Running tasks (agent slots)
  runningTasks: AgentSlotData[]

  // Tasks list
  tasks: Task[]
  tasksTotal: number
  tasksLoading: boolean
  taskFilters: TaskFilters
  selectedTask: Task | null
  selectedTaskLoading: boolean

  // Task graph
  taskGraph: { nodes: TaskGraphNode[]; edges: TaskGraphEdge[] } | null
  taskGraphLoading: boolean

  // Task logs
  taskLogs: Record<string, LogEntry[]>
  taskLogsLoading: Record<string, boolean>

  // Actions
  fetchStats: () => Promise<void>
  fetchRunningTasks: () => Promise<void>
  fetchTasks: (filters?: TaskFilters) => Promise<void>
  setTaskFilters: (filters: TaskFilters) => void
  fetchTask: (id: string) => Promise<void>
  createTask: (data: {
    title: string
    repo_path: string
    agent?: string
    model?: string
    prompt?: string
    depends_on?: string[]
    timeout_seconds?: number
  }) => Promise<Task>
  runTask: (id: string, options?: { agent?: string; model?: string }) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  cloneTask: (id: string) => Promise<void>
  retryTask: (id: string) => Promise<void>
  fetchTaskGraph: (filters?: { repo_path?: string; status?: string }) => Promise<void>
  clearSelectedTask: () => void

  // Log actions
  fetchTaskLogs: (taskId: string) => Promise<void>
  appendTaskLog: (taskId: string, entry: LogEntry) => void
  clearTaskLogs: (taskId: string) => void
}

export const useTaskStore = create<TaskState>((set, get) => ({
  stats: null,
  runningTasks: [],
  tasks: [],
  tasksTotal: 0,
  tasksLoading: false,
  taskFilters: { limit: 50, offset: 0 },
  selectedTask: null,
  selectedTaskLoading: false,
  taskGraph: null,
  taskGraphLoading: false,
  taskLogs: {},
  taskLogsLoading: {},

  fetchStats: async () => {
    try {
      const response = await fetchAPI<{
        total_tasks: number
        pending: number
        running: number
        done: number
        failed: number
        cancelled?: number
        unsequenced?: number
        waiting?: number
        ready?: number
      }>('/stats')
      const stats: Stats = {
        total: response.total_tasks,
        pending: response.pending,
        running: response.running,
        done: response.done,
        failed: response.failed,
        cancelled: response.cancelled || 0,
        unsequenced: response.unsequenced || 0,
        waiting: response.waiting || 0,
        ready: response.ready || 0,
      }
      set({ stats })
      useFlowStore.getState().updateStatsNodes(stats)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  },

  fetchRunningTasks: async () => {
    try {
      const response = await fetchAPI<{
        tasks: Array<{
          id: string
          title: string
          agent: string
          model: string
          repo_path: string
          started_at: string
        }>
      }>('/tasks?status=running')

      const slots: AgentSlotData[] = (response.tasks || []).map((t) => ({
        task_id: t.id,
        task_title: t.title,
        agent: t.agent || 'unknown',
        model: t.model || 'unknown',
        repo_path: t.repo_path,
        started_at: t.started_at,
      }))

      set({ runningTasks: slots })
      useFlowStore.getState().updateRunningTaskNodes(slots)
    } catch (error) {
      console.error('Failed to fetch running tasks:', error)
    }
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

  createTask: async (data) => {
    const response = await fetchAPI<{ task: Task }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    // Refresh tasks and stats
    await Promise.all([get().fetchTasks(), get().fetchStats()])
    return response.task
  },

  runTask: async (id, options) => {
    try {
      await fetchAPI(`/tasks/${id}/run`, {
        method: 'POST',
        body: options ? JSON.stringify(options) : undefined,
      })
      useUIStore.getState().addToast('success', 'Task started')
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to run task:', error)
      useUIStore.getState().addToast('error', `Failed to run task: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  },

  cancelTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}/cancel`, { method: 'POST' })
      useUIStore.getState().addToast('info', 'Task cancelled')
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to cancel task:', error)
      useUIStore.getState().addToast('error', `Failed to cancel task: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  },

  deleteTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}`, { method: 'DELETE' })
      if (get().selectedTask?.id === id) {
        set({ selectedTask: null })
      }
      useUIStore.getState().addToast('info', 'Task deleted')
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to delete task:', error)
      useUIStore.getState().addToast('error', `Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  },

  cloneTask: async (id) => {
    try {
      await fetchAPI(`/tasks/${id}/clone`, { method: 'POST' })
      useUIStore.getState().addToast('success', 'Task cloned')
      await Promise.all([get().fetchTasks(), get().fetchStats()])
    } catch (error) {
      console.error('Failed to clone task:', error)
      useUIStore.getState().addToast('error', `Failed to clone task: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      const graph = await fetchAPI<{ nodes: TaskGraphNode[]; edges: TaskGraphEdge[] }>(
        `/tasks/graph?${params}`
      )
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
}))

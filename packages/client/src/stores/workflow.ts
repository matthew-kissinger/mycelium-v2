import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { Task, TaskStatus } from '@mycelium/shared'

interface WorkflowState {
  // Connection status
  connected: boolean
  setConnected: (connected: boolean) => void

  // Nodes and edges (for React Flow)
  nodes: Node[]
  edges: Edge[]
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: Node) => void
  removeNode: (nodeId: string) => void
  updateNode: (nodeId: string, data: Partial<Node['data']>) => void

  // SSE event source
  eventSource: EventSource | null
  setEventSource: (source: EventSource | null) => void

  // Tasks state
  tasks: Task[]
  selectedTaskId: string | null
  taskFilter: TaskStatus | 'all'
  tasksLoading: boolean
  tasksError: string | null

  // Task actions
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  selectTask: (id: string | null) => void
  setTaskFilter: (filter: TaskStatus | 'all') => void
  setTasksLoading: (loading: boolean) => void
  setTasksError: (error: string | null) => void

  // Task computed helpers
  getFilteredTasks: () => Task[]
  getTaskById: (id: string) => Task | undefined
  getSelectedTask: () => Task | undefined
  getStatusCounts: () => Record<TaskStatus, number>
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Connection status
  connected: false,
  setConnected: (connected) => set({ connected }),

  // Nodes and edges
  nodes: [],
  edges: [],
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  addNode: (node) =>
    set((state) => ({ nodes: [...state.nodes, node] })),
  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
    })),
  updateNode: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
    })),

  // SSE event source
  eventSource: null,
  setEventSource: (source) => set({ eventSource: source }),

  // Tasks state
  tasks: [],
  selectedTaskId: null,
  taskFilter: 'all',
  tasksLoading: false,
  tasksError: null,

  // Task actions
  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({ tasks: [task, ...state.tasks] })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    })),

  selectTask: (id) => set({ selectedTaskId: id }),

  setTaskFilter: (filter) => set({ taskFilter: filter }),

  setTasksLoading: (loading) => set({ tasksLoading: loading }),

  setTasksError: (error) => set({ tasksError: error }),

  // Task computed helpers
  getFilteredTasks: () => {
    const { tasks, taskFilter } = get()
    if (taskFilter === 'all') return tasks
    return tasks.filter((t) => t.status === taskFilter)
  },

  getTaskById: (id) => get().tasks.find((t) => t.id === id),

  getSelectedTask: () => {
    const { tasks, selectedTaskId } = get()
    if (!selectedTaskId) return undefined
    return tasks.find((t) => t.id === selectedTaskId)
  },

  getStatusCounts: () => {
    const { tasks } = get()
    return {
      pending: tasks.filter((t) => t.status === 'pending').length,
      running: tasks.filter((t) => t.status === 'running').length,
      done: tasks.filter((t) => t.status === 'done').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      cancelled: tasks.filter((t) => t.status === 'cancelled').length,
    }
  },
}))

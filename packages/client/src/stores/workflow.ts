import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { Task, TaskStatus, Repo, Signal, SSEEvent } from '@mycelium/shared'

// =============================================================================
// Types
// =============================================================================

/** Node data for task nodes - with index signature for React Flow compatibility */
export interface TaskNodeData extends Record<string, unknown> {
  id: string
  title: string
  status: TaskStatus
  agent?: string
  model?: string
  repo_path: string
  depends_on: string[]
  sequenced: boolean
  cost_usd?: number
  duration_seconds?: number
  error?: string
}

/** Node data for agent/system nodes - with index signature for React Flow compatibility */
export interface AgentNodeData extends Record<string, unknown> {
  label: string
  agentType: 'system' | 'task'
  status: 'idle' | 'running' | 'error'
}

/** Unified node data type */
export type WorkflowNodeData = TaskNodeData | AgentNodeData

/** Connection status for SSE */
export interface ConnectionStatus {
  connected: boolean
  clientId?: string
  reconnectAttempts: number
  lastConnected?: Date
  lastError?: string
}

// =============================================================================
// Store Interface
// =============================================================================

interface WorkflowState {
  // Nodes and edges for React Flow
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]

  // Connection status
  connected: boolean
  connection: ConnectionStatus
  eventSource: EventSource | null

  // Entity data (source of truth)
  tasks: Task[]
  repos: Map<string, Repo>
  signals: Map<string, Signal>

  // UI state for tasks
  selectedTaskId: string | null
  taskFilter: TaskStatus | 'all'
  tasksLoading: boolean
  tasksError: string | null

  // Connection actions
  setConnected: (connected: boolean) => void
  setEventSource: (source: EventSource | null) => void

  // Node/Edge actions
  setNodes: (nodes: Node<WorkflowNodeData>[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: Node<WorkflowNodeData>) => void
  updateNode: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  removeNode: (nodeId: string) => void

  // Task actions
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  selectTask: (id: string | null) => void
  setTaskFilter: (filter: TaskStatus | 'all') => void
  setTasksLoading: (loading: boolean) => void
  setTasksError: (error: string | null) => void

  // Repo actions
  setRepos: (repos: Repo[]) => void
  updateRepo: (repo: Repo) => void
  removeRepo: (id: string) => void

  // Signal actions
  setSignals: (signals: Signal[]) => void
  updateSignal: (signal: Signal) => void
  removeSignal: (id: string) => void

  // SSE actions
  connect: (topics?: string[]) => void
  disconnect: () => void
  handleEvent: (event: SSEEvent) => void

  // Layout actions
  autoLayout: () => void
  syncNodesFromTasks: () => void

  // Task computed helpers
  getFilteredTasks: () => Task[]
  getTaskById: (id: string) => Task | undefined
  getSelectedTask: () => Task | undefined
  getStatusCounts: () => Record<TaskStatus, number>

  // Additional selectors
  getRepoByPath: (path: string) => Repo | undefined
  getTasksByRepo: (repoPath: string) => Task[]
  getPendingTasks: () => Task[]
  getRunningTasks: () => Task[]
  getPendingSignals: () => Signal[]
}

// =============================================================================
// Helpers
// =============================================================================

/** Convert a Task to a React Flow Node */
function taskToNode(task: Task, position?: { x: number; y: number }): Node<TaskNodeData> {
  return {
    id: task.id,
    type: 'task',
    position: position ?? { x: 0, y: 0 },
    data: {
      id: task.id,
      title: task.title,
      status: task.status,
      agent: task.agent,
      model: task.model,
      repo_path: task.repo_path,
      depends_on: task.depends_on ?? [],
      sequenced: task.sequenced ?? false,
      cost_usd: task.cost_usd,
      duration_seconds: task.duration_seconds,
      error: task.error,
    },
  }
}

/** Generate edges from task dependencies */
function generateEdgesFromTasks(tasks: Task[]): Edge[] {
  const edges: Edge[] = []
  const taskIds = new Set(tasks.map(t => t.id))

  for (const task of tasks) {
    const deps = task.depends_on ?? []
    for (const depId of deps) {
      // Only create edge if dependency exists in our task list
      if (taskIds.has(depId)) {
        edges.push({
          id: `e-${depId}-${task.id}`,
          source: depId,
          target: task.id,
          animated: task.status === 'running',
          style: { stroke: task.status === 'pending' ? '#888' : '#0ea5e9' },
        })
      }
    }
  }

  return edges
}

/** Simple auto-layout using dagre-like positioning */
function layoutNodes(nodes: Node<WorkflowNodeData>[], edges: Edge[]): Node<WorkflowNodeData>[] {
  if (nodes.length === 0) return nodes

  // Build adjacency map
  const dependencies = new Map<string, string[]>()

  for (const edge of edges) {
    if (!dependencies.has(edge.target)) {
      dependencies.set(edge.target, [])
    }
    dependencies.get(edge.target)!.push(edge.source)
  }

  // Calculate levels (topological sort)
  const levels = new Map<string, number>()
  const nodeIds = nodes.map(n => n.id)

  function getLevel(nodeId: string, visited: Set<string> = new Set()): number {
    if (visited.has(nodeId)) return 0 // Cycle protection
    if (levels.has(nodeId)) return levels.get(nodeId)!

    visited.add(nodeId)
    const deps = dependencies.get(nodeId) ?? []
    if (deps.length === 0) {
      levels.set(nodeId, 0)
      return 0
    }

    const maxDepLevel = Math.max(...deps.map(d => getLevel(d, new Set(visited))))
    const level = maxDepLevel + 1
    levels.set(nodeId, level)
    return level
  }

  for (const nodeId of nodeIds) {
    getLevel(nodeId)
  }

  // Group nodes by level
  const nodesByLevel = new Map<number, string[]>()
  for (const nodeId of nodeIds) {
    const level = levels.get(nodeId) ?? 0
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, [])
    }
    nodesByLevel.get(level)!.push(nodeId)
  }

  // Position nodes
  const HORIZONTAL_SPACING = 300
  const VERTICAL_SPACING = 150
  const nodePositions = new Map<string, { x: number; y: number }>()

  const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b)
  for (const level of sortedLevels) {
    const nodesAtLevel = nodesByLevel.get(level) ?? []
    const totalHeight = nodesAtLevel.length * VERTICAL_SPACING
    const startY = -totalHeight / 2 + VERTICAL_SPACING / 2

    nodesAtLevel.forEach((nodeId, index) => {
      nodePositions.set(nodeId, {
        x: level * HORIZONTAL_SPACING + 100,
        y: startY + index * VERTICAL_SPACING + 100,
      })
    })
  }

  // Apply positions
  return nodes.map(node => ({
    ...node,
    position: nodePositions.get(node.id) ?? node.position,
  }))
}

// =============================================================================
// Store
// =============================================================================

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  connected: false,
  connection: {
    connected: false,
    reconnectAttempts: 0,
  },
  eventSource: null,

  // Entity state
  tasks: [],
  repos: new Map(),
  signals: new Map(),

  // UI state
  selectedTaskId: null,
  taskFilter: 'all',
  tasksLoading: false,
  tasksError: null,

  // ==========================================================================
  // Connection Actions
  // ==========================================================================

  setConnected: (connected) => set({ connected }),
  setEventSource: (source) => set({ eventSource: source }),

  // ==========================================================================
  // Node/Edge Actions
  // ==========================================================================

  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node],
  })),

  updateNode: (nodeId, data) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } as WorkflowNodeData } : n
    ),
  })),

  removeNode: (nodeId) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== nodeId),
    edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  })),

  // ==========================================================================
  // Task Actions
  // ==========================================================================

  setTasks: (tasks) => {
    set({ tasks })
    get().syncNodesFromTasks()
  },

  addTask: (task) => {
    set((state) => ({ tasks: [task, ...state.tasks] }))

    // Add node for new task
    const node = taskToNode(task)
    get().addNode(node)

    // Add edges for dependencies
    const deps = task.depends_on ?? []
    const newEdges = deps.map(depId => ({
      id: `e-${depId}-${task.id}`,
      source: depId,
      target: task.id,
      animated: task.status === 'running',
    }))

    if (newEdges.length > 0) {
      set((state) => ({
        edges: [...state.edges, ...newEdges],
      }))
    }

    // Re-layout
    get().autoLayout()
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))

    // Update corresponding node
    const task = get().tasks.find(t => t.id === id)
    if (task) {
      get().updateNode(id, {
        title: task.title,
        status: task.status,
        agent: task.agent,
        model: task.model,
        depends_on: task.depends_on ?? [],
        sequenced: task.sequenced ?? false,
        cost_usd: task.cost_usd,
        duration_seconds: task.duration_seconds,
        error: task.error,
      } as Partial<TaskNodeData>)

      // Update edge animation for running tasks
      set((state) => ({
        edges: state.edges.map(e =>
          e.target === id
            ? { ...e, animated: task.status === 'running' }
            : e
        ),
      }))
    }
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    }))
    get().removeNode(id)
  },

  selectTask: (id) => set({ selectedTaskId: id }),

  setTaskFilter: (filter) => set({ taskFilter: filter }),

  setTasksLoading: (loading) => set({ tasksLoading: loading }),

  setTasksError: (error) => set({ tasksError: error }),

  // ==========================================================================
  // Repo Actions
  // ==========================================================================

  setRepos: (repos) => {
    set({ repos: new Map(repos.map(r => [r.id, r])) })
  },

  updateRepo: (repo) => {
    set((state) => {
      const newRepos = new Map(state.repos)
      newRepos.set(repo.id, repo)
      return { repos: newRepos }
    })
  },

  removeRepo: (id) => {
    set((state) => {
      const newRepos = new Map(state.repos)
      newRepos.delete(id)
      return { repos: newRepos }
    })
  },

  // ==========================================================================
  // Signal Actions
  // ==========================================================================

  setSignals: (signals) => {
    set({ signals: new Map(signals.map(s => [s.id, s])) })
  },

  updateSignal: (signal) => {
    set((state) => {
      const newSignals = new Map(state.signals)
      newSignals.set(signal.id, signal)
      return { signals: newSignals }
    })
  },

  removeSignal: (id) => {
    set((state) => {
      const newSignals = new Map(state.signals)
      newSignals.delete(id)
      return { signals: newSignals }
    })
  },

  // ==========================================================================
  // SSE Actions
  // ==========================================================================

  connect: (topics = ['*']) => {
    const state = get()

    // Don't reconnect if already connected
    if (state.eventSource) {
      return
    }

    const topicsParam = topics.join(',')
    const url = `/api/events?topics=${encodeURIComponent(topicsParam)}`
    const eventSource = new EventSource(url)

    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        set({
          connected: true,
          connection: {
            connected: true,
            clientId: data.clientId,
            reconnectAttempts: 0,
            lastConnected: new Date(),
          },
        })
        console.log('[SSE] Connected:', data.clientId)
      } catch (err) {
        console.error('[SSE] Failed to parse connected event:', err)
      }
    })

    // Task events
    eventSource.addEventListener('task:created', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().addTask(data.task)
      } catch (err) {
        console.error('[SSE] Failed to parse task:created:', err)
      }
    })

    eventSource.addEventListener('task:updated', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateTask(data.task_id, data.changes)
      } catch (err) {
        console.error('[SSE] Failed to parse task:updated:', err)
      }
    })

    eventSource.addEventListener('task:started', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateTask(data.task_id, { status: 'running', agent: data.agent, model: data.model })
      } catch (err) {
        console.error('[SSE] Failed to parse task:started:', err)
      }
    })

    eventSource.addEventListener('task:completed', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateTask(data.task_id, {
          status: 'done',
          duration_seconds: data.duration_seconds,
          cost_usd: data.cost_usd,
        })
      } catch (err) {
        console.error('[SSE] Failed to parse task:completed:', err)
      }
    })

    eventSource.addEventListener('task:failed', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateTask(data.task_id, { status: 'failed', error: data.error })
      } catch (err) {
        console.error('[SSE] Failed to parse task:failed:', err)
      }
    })

    eventSource.addEventListener('task:cancelled', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateTask(data.task_id, { status: 'cancelled' })
      } catch (err) {
        console.error('[SSE] Failed to parse task:cancelled:', err)
      }
    })

    eventSource.addEventListener('task:deleted', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().removeTask(data.task_id)
      } catch (err) {
        console.error('[SSE] Failed to parse task:deleted:', err)
      }
    })

    // Signal events
    eventSource.addEventListener('signal:created', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateSignal(data.signal)
      } catch (err) {
        console.error('[SSE] Failed to parse signal:created:', err)
      }
    })

    eventSource.addEventListener('signal:responded', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        const existing = get().signals.get(data.signal_id)
        if (existing) {
          get().updateSignal({ ...existing, status: 'responded', response: data.response })
        }
      } catch (err) {
        console.error('[SSE] Failed to parse signal:responded:', err)
      }
    })

    eventSource.addEventListener('signal:expired', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        const existing = get().signals.get(data.signal_id)
        if (existing) {
          get().updateSignal({ ...existing, status: 'expired' })
        }
      } catch (err) {
        console.error('[SSE] Failed to parse signal:expired:', err)
      }
    })

    // Repo events
    eventSource.addEventListener('repo:added', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateRepo(data.repo)
      } catch (err) {
        console.error('[SSE] Failed to parse repo:added:', err)
      }
    })

    eventSource.addEventListener('repo:updated', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().updateRepo(data.repo)
      } catch (err) {
        console.error('[SSE] Failed to parse repo:updated:', err)
      }
    })

    eventSource.addEventListener('repo:removed', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        get().removeRepo(data.repo_id)
      } catch (err) {
        console.error('[SSE] Failed to parse repo:removed:', err)
      }
    })

    // Heartbeat
    eventSource.addEventListener('system:heartbeat', () => {
      set((state) => ({
        connection: { ...state.connection, lastConnected: new Date() },
      }))
    })

    // Error handling with reconnection
    eventSource.onerror = () => {
      console.warn('[SSE] Connection error, will attempt reconnect')

      const state = get()
      const attempts = state.connection.reconnectAttempts + 1

      set({
        connected: false,
        connection: {
          ...state.connection,
          connected: false,
          reconnectAttempts: attempts,
          lastError: 'Connection lost',
        },
        eventSource: null,
      })

      eventSource.close()

      // Attempt reconnect with exponential backoff
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAY_MS * Math.pow(1.5, attempts - 1)
        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS})`)
        setTimeout(() => get().connect(topics), delay)
      } else {
        console.error('[SSE] Max reconnect attempts reached')
      }
    }

    set({ eventSource })
  },

  disconnect: () => {
    const { eventSource } = get()
    if (eventSource) {
      eventSource.close()
      set({
        eventSource: null,
        connected: false,
        connection: {
          connected: false,
          reconnectAttempts: 0,
        },
      })
      console.log('[SSE] Disconnected')
    }
  },

  handleEvent: (event) => {
    // Route events to appropriate handlers based on type
    const type = event.type

    if (type.startsWith('task:')) {
      if (type === 'task:created' && 'task' in event) {
        get().addTask(event.task)
      } else if (type === 'task:deleted' && 'task_id' in event) {
        get().removeTask(event.task_id)
      }
    } else if (type.startsWith('signal:')) {
      if (type === 'signal:created' && 'signal' in event) {
        get().updateSignal(event.signal)
      }
    } else if (type.startsWith('repo:')) {
      if (type === 'repo:added' && 'repo' in event) {
        get().updateRepo(event.repo)
      } else if (type === 'repo:removed' && 'repo_id' in event) {
        get().removeRepo(event.repo_id)
      }
    }
  },

  // ==========================================================================
  // Layout Actions
  // ==========================================================================

  autoLayout: () => {
    set((state) => ({
      nodes: layoutNodes(state.nodes, state.edges),
    }))
  },

  syncNodesFromTasks: () => {
    const tasks = get().tasks
    const nodes = tasks.map(t => taskToNode(t))
    const edges = generateEdgesFromTasks(tasks)

    // Apply layout
    const layoutedNodes = layoutNodes(nodes, edges)

    set({ nodes: layoutedNodes, edges })
  },

  // ==========================================================================
  // Task Computed Helpers
  // ==========================================================================

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

  // ==========================================================================
  // Additional Selectors
  // ==========================================================================

  getRepoByPath: (path) => {
    for (const repo of get().repos.values()) {
      if (repo.path === path) return repo
    }
    return undefined
  },

  getTasksByRepo: (repoPath) => {
    return get().tasks.filter(t => t.repo_path === repoPath)
  },

  getPendingTasks: () => {
    return get().tasks.filter(t => t.status === 'pending')
  },

  getRunningTasks: () => {
    return get().tasks.filter(t => t.status === 'running')
  },

  getPendingSignals: () => {
    const signals: Signal[] = []
    for (const signal of get().signals.values()) {
      if (signal.status === 'pending') {
        signals.push(signal)
      }
    }
    return signals
  },
}))

import { useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Dagre from '@dagrejs/dagre'
import { nodeTypes } from './nodes'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import type {
  Stats,
  Task,
  Repo,
  Signal,
  RepoMemory,
  SSEEvent,
} from '@mycelium/shared'

// =============================================================================
// Layout Configuration
// =============================================================================

const NODE_WIDTH = 220
const NODE_HEIGHT = 120
const RANK_SEP = 100 // Vertical spacing between ranks
const NODE_SEP = 50 // Horizontal spacing between nodes

// Layout direction - TB = top to bottom, LR = left to right
type LayoutDirection = 'TB' | 'LR'

// =============================================================================
// Dagre Layout Function
// =============================================================================

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))

  g.setGraph({
    rankdir: direction,
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 50,
    marginy: 50,
  })

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  Dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks')
  if (!res.ok) throw new Error('Failed to fetch tasks')
  return res.json()
}

async function fetchRepos(): Promise<Repo[]> {
  const res = await fetch('/api/repos')
  if (!res.ok) throw new Error('Failed to fetch repos')
  return res.json()
}

async function fetchSignals(): Promise<Signal[]> {
  const res = await fetch('/api/signals')
  if (!res.ok) throw new Error('Failed to fetch signals')
  return res.json()
}

async function fetchGlobalMemory(): Promise<RepoMemory> {
  const res = await fetch('/api/memory/global')
  if (!res.ok) throw new Error('Failed to fetch memory')
  return res.json()
}

async function fetchStats(): Promise<Stats> {
  const res = await fetch('/api/stats')
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

// =============================================================================
// Node Conversion Functions
// =============================================================================

function tasksToNodes(tasks: Task[]): Node[] {
  return tasks.map((task) => ({
    id: `task-${task.id}`,
    type: 'task',
    position: { x: 0, y: 0 }, // Will be set by layout
    data: {
      id: task.id,
      title: task.title,
      status: task.status === 'done' ? 'completed' : task.status,
      agent: task.agent,
      model: task.model,
      repo_path: task.repo_path,
      depends_on: task.depends_on || [],
    },
  }))
}

function reposToNodes(repos: Repo[]): Node[] {
  return repos.map((repo) => ({
    id: `repo-${repo.id}`,
    type: 'repo',
    position: { x: 0, y: 0 }, // Will be set by layout
    data: {
      id: repo.id,
      name: repo.name,
      path: repo.path,
      mode: repo.mode,
      language: repo.language,
      description: repo.description,
    },
  }))
}

function signalsToNodes(signals: Signal[]): Node[] {
  return signals.map((signal) => ({
    id: `signal-${signal.id}`,
    type: 'signal',
    position: { x: 0, y: 0 }, // Will be set by layout
    data: {
      id: signal.id,
      question: signal.question,
      status: signal.status,
      options: signal.options,
      response: signal.response,
      created_at: signal.created_at,
      responded_at: signal.responded_at,
    },
  }))
}

function memoryToNodes(memory: RepoMemory | undefined): Node[] {
  if (!memory) return []

  // Only show global memory if it has patterns or warnings
  if (memory.patterns.length === 0 && memory.warnings.length === 0) return []

  return [
    {
      id: 'memory-global',
      type: 'memory',
      position: { x: 0, y: 0 }, // Will be set by layout
      data: {
        repo_path: memory.repo_path || undefined,
        patterns: memory.patterns.map((p) => ({
          id: p.id,
          content: p.content,
          tags: p.tags,
        })),
        warnings: memory.warnings.map((w) => ({
          id: w.id,
          content: w.content,
          severity: w.severity,
        })),
      },
    },
  ]
}

// =============================================================================
// Edge Building
// =============================================================================

function buildEdgesFromTasks(tasks: Task[]): Edge[] {
  const edges: Edge[] = []
  const taskIds = new Set(tasks.map((t) => t.id))

  tasks.forEach((task) => {
    if (task.depends_on && task.depends_on.length > 0) {
      task.depends_on.forEach((depId) => {
        // Only create edge if dependency exists in our task list
        if (taskIds.has(depId)) {
          edges.push({
            id: `e-${depId}-${task.id}`,
            source: `task-${depId}`,
            target: `task-${task.id}`,
            animated: task.status === 'running',
          })
        }
      })
    }
  })

  return edges
}

// =============================================================================
// SSE Event Hook
// =============================================================================

function useSSE(onEvent: (event: SSEEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Connect to SSE endpoint
    const eventSource = new EventSource('/api/events')
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent
        onEvent(data)
      } catch (e) {
        console.error('Failed to parse SSE event:', e)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      // EventSource will automatically reconnect
    }

    return () => {
      eventSource.close()
    }
  }, [onEvent])
}

// =============================================================================
// Main App Component
// =============================================================================

export default function App() {
  const queryClient = useQueryClient()

  // Fetch data
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    refetchInterval: 30000, // Refresh every 30s as backup
  })

  const { data: repos = [] } = useQuery<Repo[]>({
    queryKey: ['repos'],
    queryFn: fetchRepos,
    refetchInterval: 60000,
  })

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ['signals'],
    queryFn: fetchSignals,
    refetchInterval: 30000,
  })

  const { data: memory } = useQuery<RepoMemory>({
    queryKey: ['memory', 'global'],
    queryFn: fetchGlobalMemory,
    refetchInterval: 60000,
  })

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 5000,
  })

  // Handle SSE events
  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      // Invalidate relevant queries based on event type
      if ('type' in event) {
        const eventType = event.type

        // Task events
        if (eventType.startsWith('task:')) {
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          queryClient.invalidateQueries({ queryKey: ['stats'] })
        }

        // Signal events
        if (eventType.startsWith('signal:')) {
          queryClient.invalidateQueries({ queryKey: ['signals'] })
        }

        // Repo events
        if (eventType.startsWith('repo:')) {
          queryClient.invalidateQueries({ queryKey: ['repos'] })
        }

        // Memory events
        if (eventType.startsWith('memory:')) {
          queryClient.invalidateQueries({ queryKey: ['memory'] })
        }
      }
    },
    [queryClient]
  )

  useSSE(handleSSEEvent)

  // Convert data to nodes
  const rawNodes = useMemo(() => {
    const taskNodes = tasksToNodes(tasks)
    const repoNodes = reposToNodes(repos)
    const signalNodes = signalsToNodes(signals)
    const memoryNodes = memoryToNodes(memory)

    return [...taskNodes, ...repoNodes, ...signalNodes, ...memoryNodes]
  }, [tasks, repos, signals, memory])

  // Build edges from task dependencies
  const rawEdges = useMemo(() => {
    return buildEdgesFromTasks(tasks)
  }, [tasks])

  // Apply layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    if (rawNodes.length === 0) {
      return { nodes: [], edges: [] }
    }
    return getLayoutedElements(rawNodes, rawEdges, 'TB')
  }, [rawNodes, rawEdges])

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  // Update nodes and edges when layout changes
  useEffect(() => {
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges]
  )

  return (
    <div className="flex h-screen flex-col">
      <Header stats={stats} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="hsl(0 0% 20%)" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                switch (node.type) {
                  case 'agent':
                    return 'hsl(260 50% 50%)' // Purple for agents
                  case 'task':
                    return 'hsl(150 50% 50%)' // Green for tasks
                  case 'repo':
                    return 'hsl(210 50% 50%)' // Blue for repos
                  case 'signal':
                    return 'hsl(45 50% 50%)' // Yellow for signals
                  case 'memory':
                    return 'hsl(30 50% 50%)' // Orange for memory
                  default:
                    return 'hsl(0 0% 50%)'
                }
              }}
            />
          </ReactFlow>
        </main>
      </div>
    </div>
  )
}

import { useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
const HORIZONTAL_GAP = 50
const VERTICAL_GAP = 80

// =============================================================================
// Simple Grid Layout
// =============================================================================

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges }

  // Group nodes by type
  const nodesByType: Record<string, Node[]> = {}
  nodes.forEach((node) => {
    const type = node.type || 'default'
    if (!nodesByType[type]) nodesByType[type] = []
    nodesByType[type].push(node)
  })

  // Define row order for node types
  const typeOrder = ['task', 'repo', 'signal', 'memory']
  const layoutedNodes: Node[] = []
  let currentY = 50

  typeOrder.forEach((type) => {
    const typeNodes = nodesByType[type] || []
    if (typeNodes.length === 0) return

    // Calculate row width and starting X
    const rowWidth = typeNodes.length * (NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP
    let startX = 50

    // Center the row
    if (typeNodes.length > 1) {
      startX = Math.max(50, (1200 - rowWidth) / 2)
    }

    typeNodes.forEach((node, index) => {
      layoutedNodes.push({
        ...node,
        position: {
          x: startX + index * (NODE_WIDTH + HORIZONTAL_GAP),
          y: currentY,
        },
      })
    })

    currentY += NODE_HEIGHT + VERTICAL_GAP
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
    position: { x: 0, y: 0 },
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
    position: { x: 0, y: 0 },
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
    position: { x: 0, y: 0 },
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
  if (memory.patterns.length === 0 && memory.warnings.length === 0) return []

  return [
    {
      id: 'memory-global',
      type: 'memory',
      position: { x: 0, y: 0 },
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
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const eventSource = new EventSource('/api/events')
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent
        onEventRef.current(data)
      } catch (e) {
        console.error('Failed to parse SSE event:', e)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
    }

    return () => {
      eventSource.close()
    }
  }, [])
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
    refetchInterval: 30000,
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
      if ('type' in event) {
        const eventType = event.type
        if (eventType.startsWith('task:')) {
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          queryClient.invalidateQueries({ queryKey: ['stats'] })
        }
        if (eventType.startsWith('signal:')) {
          queryClient.invalidateQueries({ queryKey: ['signals'] })
        }
        if (eventType.startsWith('repo:')) {
          queryClient.invalidateQueries({ queryKey: ['repos'] })
        }
        if (eventType.startsWith('memory:')) {
          queryClient.invalidateQueries({ queryKey: ['memory'] })
        }
      }
    },
    [queryClient]
  )

  useSSE(handleSSEEvent)

  // Build nodes and edges - memoized to prevent unnecessary recalculations
  const { nodes, edges } = useMemo(() => {
    const taskNodes = tasksToNodes(tasks)
    const repoNodes = reposToNodes(repos)
    const signalNodes = signalsToNodes(signals)
    const memoryNodes = memoryToNodes(memory)

    const allNodes = [...taskNodes, ...repoNodes, ...signalNodes, ...memoryNodes]
    const allEdges = buildEdgesFromTasks(tasks)

    return getLayoutedElements(allNodes, allEdges)
  }, [tasks, repos, signals, memory])

  return (
    <div className="flex h-screen flex-col">
      <Header stats={stats} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
                    return 'hsl(260 50% 50%)'
                  case 'task':
                    return 'hsl(150 50% 50%)'
                  case 'repo':
                    return 'hsl(210 50% 50%)'
                  case 'signal':
                    return 'hsl(45 50% 50%)'
                  case 'memory':
                    return 'hsl(30 50% 50%)'
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

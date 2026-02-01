import { useCallback } from 'react'
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
import { useQuery } from '@tanstack/react-query'
import { nodeTypes } from './nodes'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import type { Stats } from '@mycelium/shared'

// Initial nodes for demo - showcasing all node types
const initialNodes: Node[] = [
  // System agent nodes (top row)
  {
    id: 'discovery',
    type: 'agent',
    position: { x: 100, y: 50 },
    data: { label: 'Discovery', agentType: 'discovery', status: 'idle' },
  },
  {
    id: 'sequencer',
    type: 'agent',
    position: { x: 320, y: 50 },
    data: { label: 'Sequencer', agentType: 'sequencer', status: 'running' },
  },
  {
    id: 'shepherd',
    type: 'agent',
    position: { x: 540, y: 50 },
    data: { label: 'Shepherd', agentType: 'shepherd', status: 'idle' },
  },
  {
    id: 'genesis',
    type: 'agent',
    position: { x: 760, y: 50 },
    data: { label: 'Genesis', agentType: 'genesis', status: 'error', description: 'Last run failed' },
  },

  // Task nodes (middle row)
  {
    id: 'task-1',
    type: 'task',
    position: { x: 100, y: 200 },
    data: {
      id: 'task-1',
      title: 'Implement React Flow nodes',
      status: 'completed',
      agent: 'claude',
      model: 'opus',
      repo_path: '/home/user/repos/mycelium-v2',
      depends_on: [],
    },
  },
  {
    id: 'task-2',
    type: 'task',
    position: { x: 350, y: 200 },
    data: {
      id: 'task-2',
      title: 'Add SSE streaming',
      status: 'running',
      agent: 'codex',
      model: 'codex-1',
      repo_path: '/home/user/repos/mycelium-v2',
      depends_on: ['task-1'],
    },
  },
  {
    id: 'task-3',
    type: 'task',
    position: { x: 600, y: 200 },
    data: {
      id: 'task-3',
      title: 'Fix memory leak in scheduler',
      status: 'pending',
      agent: 'gemini',
      repo_path: '/home/user/repos/mycelium-v2',
      depends_on: ['task-1', 'task-2'],
    },
  },
  {
    id: 'task-4',
    type: 'task',
    position: { x: 850, y: 200 },
    data: {
      id: 'task-4',
      title: 'Update documentation',
      status: 'failed',
      repo_path: '/home/user/repos/mycelium-v2',
      depends_on: [],
    },
  },

  // Repo nodes (bottom left)
  {
    id: 'repo-1',
    type: 'repo',
    position: { x: 100, y: 380 },
    data: {
      id: 'repo-1',
      name: 'mycelium-v2',
      path: '/home/user/repos/mycelium-v2',
      mode: 'auto',
      language: 'typescript',
      description: 'Agent orchestration system for managing multi-agent development workflows',
    },
  },
  {
    id: 'repo-2',
    type: 'repo',
    position: { x: 320, y: 380 },
    data: {
      id: 'repo-2',
      name: 'void-scavenger',
      path: '/home/user/repos/void-scavenger',
      mode: 'align',
      language: 'javascript',
      description: 'Three.js time-loop sci-fi game',
    },
  },

  // Signal node (bottom middle)
  {
    id: 'signal-1',
    type: 'signal',
    position: { x: 560, y: 380 },
    data: {
      id: 'signal-1',
      question: 'Should we merge the feature branch with experimental changes?',
      status: 'pending',
      options: ['Yes', 'No', 'Defer'],
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
  },
  {
    id: 'signal-2',
    type: 'signal',
    position: { x: 560, y: 530 },
    data: {
      id: 'signal-2',
      question: 'Create new repo for shared utilities?',
      status: 'responded',
      options: ['Approve', 'Reject'],
      response: 'Approve',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      responded_at: new Date(Date.now() - 82800000).toISOString(),
    },
  },

  // Memory node (bottom right)
  {
    id: 'memory-1',
    type: 'memory',
    position: { x: 850, y: 380 },
    data: {
      repo_path: '/home/user/repos/mycelium-v2',
      patterns: [
        { id: 'p1', content: 'Use conventional commits for all changes', tags: ['git'] },
        { id: 'p2', content: 'Run tests before committing', tags: ['testing'] },
        { id: 'p3', content: 'Prefer Bun over Node.js', tags: ['runtime'] },
      ],
      warnings: [
        { id: 'w1', content: 'Database migrations must be reviewed', severity: 'high' },
        { id: 'w2', content: 'Avoid force pushing to main', severity: 'medium' },
      ],
    },
  },
]

const initialEdges: Edge[] = [
  // Agent flow
  { id: 'e1', source: 'discovery', target: 'sequencer', animated: true },
  { id: 'e2', source: 'sequencer', target: 'shepherd', animated: true },
  // Task dependencies
  { id: 'e3', source: 'task-1', target: 'task-2' },
  { id: 'e4', source: 'task-1', target: 'task-3' },
  { id: 'e5', source: 'task-2', target: 'task-3' },
]

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges]
  )

  // Fetch stats
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats')
      return res.json()
    },
    refetchInterval: 5000,
  })

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
                    return 'hsl(45 50% 50%)'  // Yellow for signals
                  case 'memory':
                    return 'hsl(30 50% 50%)'  // Orange for memory
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

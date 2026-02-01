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

// Initial nodes for demo
const initialNodes: Node[] = [
  {
    id: 'discovery',
    type: 'agent',
    position: { x: 100, y: 100 },
    data: { label: 'Discovery', agentType: 'system', status: 'idle' },
  },
  {
    id: 'sequencer',
    type: 'agent',
    position: { x: 350, y: 100 },
    data: { label: 'Sequencer', agentType: 'system', status: 'idle' },
  },
  {
    id: 'dispatcher',
    type: 'agent',
    position: { x: 600, y: 100 },
    data: { label: 'Dispatcher', agentType: 'system', status: 'idle' },
  },
  {
    id: 'shepherd',
    type: 'agent',
    position: { x: 850, y: 100 },
    data: { label: 'Shepherd', agentType: 'system', status: 'idle' },
  },
]

const initialEdges: Edge[] = [
  { id: 'e1', source: 'discovery', target: 'sequencer', animated: true },
  { id: 'e2', source: 'sequencer', target: 'dispatcher', animated: true },
  { id: 'e3', source: 'dispatcher', target: 'shepherd', animated: true },
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
                switch (node.data?.agentType) {
                  case 'system':
                    return 'hsl(260 50% 50%)'
                  case 'task':
                    return 'hsl(150 50% 50%)'
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

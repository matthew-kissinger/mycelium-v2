/**
 * SystemView - Main orchestration architecture visualization
 *
 * Shows the Mycelium system flow with real-time status updates.
 * Panel rendering has moved to layout/RightPanel.tsx in the three-column layout.
 */

import { useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
} from '@xyflow/react'
import { nodeTypes } from '../nodes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customNodeTypes = nodeTypes as any
import { useSystemStore } from '../stores/system'

export function SystemView() {
  const {
    nodes: systemNodes,
    edges: systemEdges,
    initializeNodes,
    refreshAll,
    connectSSE,
    disconnectSSE,
    openPanel,
  } = useSystemStore()

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(systemNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(systemEdges)

  // Initialize on mount
  useEffect(() => {
    initializeNodes()
    refreshAll()
    connectSSE()

    const pollInterval = setInterval(() => {
      refreshAll()
    }, 5000)

    return () => {
      clearInterval(pollInterval)
      disconnectSSE()
    }
  }, [initializeNodes, refreshAll, connectSSE, disconnectSSE])

  // Sync store nodes to local state
  useEffect(() => {
    setNodes(systemNodes)
  }, [systemNodes, setNodes])

  useEffect(() => {
    setEdges(systemEdges)
  }, [systemEdges, setEdges])

  // Handle node click - opens panel via uiStore (delegated from systemStore)
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const nodeType = node.type

      const panelTypeMap: Record<string, 'scheduler' | 'cycle' | 'taskPool' | 'agent' | 'alignment' | 'memory' | 'repos'> = {
        scheduler: 'scheduler',
        cycle: 'cycle',
        taskPool: 'taskPool',
        agentSlots: 'agent',
        alignment: 'alignment',
        memory: 'memory',
        repos: 'repos',
      }

      const panelType = panelTypeMap[nodeType || '']
      if (panelType) {
        openPanel(panelType, node.id, node.data as Record<string, unknown>)
      }
    },
    [openPanel]
  )

  // MiniMap node colors
  const getNodeColor = (node: Node) => {
    switch (node.type) {
      case 'scheduler':
        return 'hsl(220 60% 50%)'
      case 'cycle':
        return 'hsl(260 50% 50%)'
      case 'taskPool':
        return 'hsl(150 50% 50%)'
      case 'agentSlots':
        return 'hsl(120 50% 50%)'
      case 'alignment':
        return 'hsl(45 60% 50%)'
      case 'memory':
        return 'hsl(30 50% 50%)'
      case 'repos':
        return 'hsl(200 50% 50%)'
      default:
        return 'hsl(0 0% 50%)'
    }
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={customNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
      >
        <Background
          color="hsl(0 0% 20%)"
          gap={20}
          size={1}
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={getNodeColor}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
      </ReactFlow>
    </div>
  )
}

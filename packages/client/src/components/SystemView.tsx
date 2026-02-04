/**
 * SystemView - Main orchestration architecture visualization
 *
 * Shows the Mycelium system flow with real-time status updates.
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
import { Panel } from './Panel'

export function SystemView() {
  // Get system state
  const {
    nodes: systemNodes,
    edges: systemEdges,
    initializeNodes,
    refreshAll,
    connectSSE,
    disconnectSSE,
    openPanel,
    panel,
    closePanel,
  } = useSystemStore()

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(systemNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(systemEdges)

  // Initialize on mount
  useEffect(() => {
    initializeNodes()
    refreshAll()
    connectSSE()

    // Set up polling for real-time updates
    const pollInterval = setInterval(() => {
      refreshAll()
    }, 5000) // Poll every 5 seconds

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

  // Handle node click
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const nodeType = node.type

      // Map node types to panel types
      const panelTypeMap: Record<string, 'scheduler' | 'cycle' | 'taskPool' | 'agent' | 'alignment' | 'memory'> = {
        scheduler: 'scheduler',
        cycle: 'cycle',
        taskPool: 'taskPool',
        agentSlots: 'agent',
        alignment: 'alignment',
        memory: 'memory',
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
      default:
        return 'hsl(0 0% 50%)'
    }
  }

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={customNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
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
        <Controls
          showInteractive={false}
          className="!bg-zinc-800 !border-zinc-700"
        />
        <MiniMap
          nodeColor={getNodeColor}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-zinc-900 !border-zinc-700"
        />
      </ReactFlow>

      {/* Side panel for drill-in */}
      {panel.type && (
        <Panel
          type={panel.type}
          nodeId={panel.nodeId}
          data={panel.data}
          onClose={closePanel}
        />
      )}
    </div>
  )
}

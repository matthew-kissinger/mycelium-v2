/**
 * System architecture - clean ring layout
 *
 * Main loop (8 nodes, clockwise):
 *
 *              [Scheduler]
 *             /            \
 *      [Discovery]    [Sequencer]
 *            \           /
 *   [Memory]    [Task Pool]
 *            \           /
 *      [Shepherd]   [Dispatcher]
 *             \        /
 *           [Agent Slots]
 *
 * Support nodes (hidden, accessible via sidebar):
 *   Alignment, Armory, Blocked Check, Digest, Health Check, Compaction
 */

import type { Node, Edge } from '@xyflow/react'
import type {
  SchedulerNodeData,
  CycleNodeData,
  TaskPoolNodeData,
  AgentSlotsNodeData,
  AlignmentNodeData,
  MemoryNodeData,
} from './types'

const pos = (x: number, y: number) => ({ x, y })

// =============================================================================
// Main ring nodes - spaced for compact cards (~160-200px wide, ~35px tall)
// Viewport approx 1000x700 after sidebar
// =============================================================================

export const schedulerNode: Node<SchedulerNodeData> = {
  id: 'scheduler',
  type: 'scheduler',
  position: pos(380, 0),
  data: {
    label: 'Scheduler',
    description: 'Master orchestration control',
    running: false,
    started_at: undefined,
    config: {
      dispatcher_interval_sec: 60,
      discovery_interval_sec: 900,
      max_concurrent_tasks: 3,
    },
  },
}

export const discoveryNode: Node<CycleNodeData> = {
  id: 'discovery',
  type: 'cycle',
  position: pos(120, 120),
  data: {
    label: 'Discovery',
    description: 'Scans repos, creates tasks',
    cycleType: 'discovery',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
    interval_sec: 900,
  },
}

export const sequencerNode: Node<CycleNodeData> = {
  id: 'sequencer',
  type: 'cycle',
  position: pos(640, 120),
  data: {
    label: 'Sequencer',
    description: 'Wires task dependencies',
    cycleType: 'sequencer',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
    interval_sec: 900,
  },
}

export const taskPoolNode: Node<TaskPoolNodeData> = {
  id: 'task-pool',
  type: 'taskPool',
  position: pos(620, 280),
  data: {
    label: 'Task Pool',
    description: 'All tasks',
    counts: {
      pending: 0,
      unsequenced: 0,
      waiting: 0,
      ready: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    },
    total: 0,
  },
}

export const dispatcherNode: Node<CycleNodeData> = {
  id: 'dispatcher',
  type: 'cycle',
  position: pos(600, 460),
  data: {
    label: 'Dispatcher',
    description: 'Runs sequenced ready tasks',
    cycleType: 'dispatcher',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
    interval_sec: 60,
  },
}

export const agentSlotsNode: Node<AgentSlotsNodeData> = {
  id: 'agent-slots',
  type: 'agentSlots',
  position: pos(350, 570),
  data: {
    label: 'Running Agents',
    description: 'Active task executions',
    slots: [],
    max_slots: 10,
    active_count: 0,
  },
}

export const shepherdNode: Node<CycleNodeData> = {
  id: 'shepherd',
  type: 'cycle',
  position: pos(120, 460),
  data: {
    label: 'Shepherd',
    description: 'Evaluates completed work',
    cycleType: 'shepherd',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
  },
}

export const memoryNode: Node<MemoryNodeData> = {
  id: 'memory',
  type: 'memory',
  position: pos(80, 280),
  data: {
    label: 'Memory (Hyphae)',
    description: 'Patterns and warnings learned',
    pattern_count: 0,
    warning_count: 0,
    repos_with_memory: 0,
  },
}

// =============================================================================
// Support nodes (hidden - accessible via sidebar panels)
// =============================================================================

export const alignmentNode: Node<AlignmentNodeData> = {
  id: 'alignment',
  type: 'alignment',
  position: pos(0, 0),
  hidden: true,
  data: {
    label: 'Alignment',
    description: 'Human feedback via Telegram',
    pending_count: 0,
    total_signals: 0,
  },
}

export const armoryNode: Node<CycleNodeData> = {
  id: 'armory',
  type: 'cycle',
  position: pos(0, 0),
  hidden: true,
  data: {
    label: 'Armory',
    description: 'Installs skills/MCPs',
    cycleType: 'armory',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
  },
}

export const blockedCheckNode: Node<CycleNodeData> = {
  id: 'blocked-check',
  type: 'cycle',
  position: pos(0, 0),
  hidden: true,
  data: {
    label: 'Blocked Check',
    description: 'Detect stuck tasks',
    cycleType: 'blocked_check',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
    interval_sec: 900,
  },
}

export const digestNode: Node<CycleNodeData> = {
  id: 'digest',
  type: 'cycle',
  position: pos(0, 0),
  hidden: true,
  data: {
    label: 'Digest',
    description: 'Health summaries',
    cycleType: 'digest',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
    interval_sec: 21600,
  },
}

export const healthCheckNode: Node<CycleNodeData> = {
  id: 'health-check',
  type: 'cycle',
  position: pos(0, 0),
  hidden: true,
  data: {
    label: 'Health Check',
    description: 'Device connectivity',
    cycleType: 'health_check',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
    interval_sec: 60,
  },
}

export const compactionNode: Node<CycleNodeData> = {
  id: 'compaction',
  type: 'cycle',
  position: pos(0, 0),
  hidden: true,
  data: {
    label: 'Compaction',
    description: 'Memory cleanup',
    cycleType: 'compaction',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
  },
}

// =============================================================================
// All Nodes
// =============================================================================

export const SYSTEM_NODES: Node[] = [
  // Main ring (visible)
  schedulerNode,
  discoveryNode,
  sequencerNode,
  taskPoolNode,
  dispatcherNode,
  agentSlotsNode,
  shepherdNode,
  memoryNode,
  // Support (hidden)
  alignmentNode,
  armoryNode,
  blockedCheckNode,
  digestNode,
  healthCheckNode,
  compactionNode,
]

// =============================================================================
// Edges - main loop only, minimal labels
// =============================================================================

const arrowMarker = {
  type: 'arrowclosed' as const,
  color: 'hsl(220 10% 40%)',
  width: 16,
  height: 16,
}

const baseEdgeStyle = {
  stroke: 'hsl(220 10% 35%)',
  strokeWidth: 1.5,
}

const activeEdgeStyle = {
  stroke: 'hsl(150 60% 45%)',
  strokeWidth: 2,
}

const feedbackEdgeStyle = {
  stroke: 'hsl(280 30% 40%)',
  strokeWidth: 1.5,
  strokeDasharray: '5 4',
}

export const SYSTEM_EDGES: Edge[] = [
  // Scheduler -> Discovery
  {
    id: 'e-scheduler-discovery',
    source: 'scheduler',
    target: 'discovery',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Scheduler -> Sequencer
  {
    id: 'e-scheduler-sequencer',
    source: 'scheduler',
    target: 'sequencer',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Discovery -> Task Pool
  {
    id: 'e-discovery-taskpool',
    source: 'discovery',
    target: 'task-pool',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Sequencer -> Task Pool
  {
    id: 'e-sequencer-taskpool',
    source: 'sequencer',
    target: 'task-pool',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Task Pool -> Dispatcher
  {
    id: 'e-taskpool-dispatcher',
    source: 'task-pool',
    target: 'dispatcher',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Dispatcher -> Agent Slots
  {
    id: 'e-dispatcher-agents',
    source: 'dispatcher',
    target: 'agent-slots',
    sourceHandle: 'bottom',
    targetHandle: 'right',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Agent Slots -> Shepherd
  {
    id: 'e-agents-shepherd',
    source: 'agent-slots',
    target: 'shepherd',
    sourceHandle: 'left-out',
    targetHandle: 'bottom',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Shepherd -> Memory
  {
    id: 'e-shepherd-memory',
    source: 'shepherd',
    target: 'memory',
    sourceHandle: 'top',
    targetHandle: 'bottom',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Memory -> Discovery (feedback loop)
  {
    id: 'e-memory-discovery',
    source: 'memory',
    target: 'discovery',
    sourceHandle: 'top-out',
    targetHandle: 'left',
    type: 'smoothstep',
    style: feedbackEdgeStyle,
    markerEnd: { ...arrowMarker, color: 'hsl(280 30% 40%)' },
  },
]

// =============================================================================
// Helpers
// =============================================================================

export function getVisibleNodes(): Node[] {
  return SYSTEM_NODES.filter(n => !n.hidden)
}

export function getAllNodes(): Node[] {
  return [...SYSTEM_NODES]
}

export function getVisibleEdges(): Edge[] {
  const visibleIds = new Set(getVisibleNodes().map(n => n.id))
  return SYSTEM_EDGES.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
}

export function updateNodeData<T extends Record<string, unknown>>(
  nodes: Node[],
  nodeId: string,
  data: Partial<T>
): Node[] {
  return nodes.map(node =>
    node.id === nodeId
      ? { ...node, data: { ...node.data, ...data } }
      : node
  )
}

export function setEdgeActive(edges: Edge[], edgeId: string, active: boolean): Edge[] {
  return edges.map(edge =>
    edge.id === edgeId
      ? {
          ...edge,
          animated: active,
          style: active ? activeEdgeStyle : baseEdgeStyle,
        }
      : edge
  )
}

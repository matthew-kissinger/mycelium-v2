/**
 * System architecture - three-zone layout
 *
 * Left column (X=80) - Support/monitoring:
 *    [Alignment]
 *    [Blocked Check]
 *    [Armory]
 *    [Compaction]
 *
 * Center column (X=350) - Core pipeline:
 *    [Scheduler]
 *    [Discovery]
 *    [Task Pool]
 *    [Dispatcher]
 *    [Agent Slots]
 *    [Shepherd]
 *    [Memory]
 *
 * Right column (X=620) - Data/analysis:
 *    [Repos]
 *    [Digest]
 *    [Health Check]
 */

import type { Node, Edge } from '@xyflow/react'
import type {
  SchedulerNodeData,
  CycleNodeData,
  TaskPoolNodeData,
  AgentSlotsNodeData,
  AlignmentNodeData,
  MemoryNodeData,
  ReposNodeData,
} from './types'

const pos = (x: number, y: number) => ({ x, y })

// =============================================================================
// Three-zone layout: support left, pipeline center, data right
// Left X=80, Center X=350, Right X=620
// =============================================================================

// --- Center column: core pipeline ---

export const schedulerNode: Node<SchedulerNodeData> = {
  id: 'scheduler',
  type: 'scheduler',
  position: pos(350, 0),
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
  position: pos(350, 100),
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

export const taskPoolNode: Node<TaskPoolNodeData> = {
  id: 'task-pool',
  type: 'taskPool',
  position: pos(350, 220),
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
  position: pos(350, 400),
  data: {
    label: 'Dispatcher',
    description: 'Runs ready tasks',
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
  position: pos(350, 510),
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
  position: pos(350, 660),
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
  position: pos(350, 780),
  data: {
    label: 'Memory (Hyphae)',
    description: 'Patterns and warnings learned',
    pattern_count: 0,
    warning_count: 0,
    repos_with_memory: 0,
  },
}

// --- Right column: data/analysis ---

export const reposNode: Node<ReposNodeData> = {
  id: 'repos',
  type: 'repos',
  position: pos(620, 10),
  data: {
    label: 'Repos',
    description: 'Registered repositories',
    total: 0,
    by_language: {},
    with_pending_tasks: 0,
  },
}

export const digestNode: Node<CycleNodeData> = {
  id: 'digest',
  type: 'cycle',
  position: pos(620, 240),
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
  position: pos(620, 520),
  data: {
    label: 'Health Check',
    description: 'Provider status',
    cycleType: 'health_check',
    enabled: true,
    running: false,
    runs_completed: 0,
    errors: 0,
    interval_sec: 60,
  },
}

// --- Left column: support/monitoring ---

export const alignmentNode: Node<AlignmentNodeData> = {
  id: 'alignment',
  type: 'alignment',
  position: pos(80, 10),
  data: {
    label: 'Alignment',
    description: 'Human feedback via Telegram',
    pending_count: 0,
    total_signals: 0,
  },
}

export const blockedCheckNode: Node<CycleNodeData> = {
  id: 'blocked-check',
  type: 'cycle',
  position: pos(80, 240),
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

export const armoryNode: Node<CycleNodeData> = {
  id: 'armory',
  type: 'cycle',
  position: pos(80, 520),
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

export const compactionNode: Node<CycleNodeData> = {
  id: 'compaction',
  type: 'cycle',
  position: pos(80, 790),
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
// All Nodes (all visible)
// =============================================================================

export const SYSTEM_NODES: Node[] = [
  // Center column - core pipeline
  schedulerNode,
  discoveryNode,
  taskPoolNode,
  dispatcherNode,
  agentSlotsNode,
  shepherdNode,
  memoryNode,
  // Right column - data/analysis
  reposNode,
  digestNode,
  healthCheckNode,
  // Left column - support/monitoring
  alignmentNode,
  blockedCheckNode,
  armoryNode,
  compactionNode,
]

// =============================================================================
// Edges
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

const supportEdgeStyle = {
  stroke: 'hsl(200 25% 35%)',
  strokeWidth: 1,
  strokeDasharray: '3 3',
}

const supportArrowMarker = {
  ...arrowMarker,
  color: 'hsl(200 25% 35%)',
}

export const SYSTEM_EDGES: Edge[] = [
  // === Core pipeline (center column, top to bottom) ===

  // Scheduler -> Discovery
  {
    id: 'e-scheduler-discovery',
    source: 'scheduler',
    target: 'discovery',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Discovery -> Task Pool
  {
    id: 'e-discovery-taskpool',
    source: 'discovery',
    target: 'task-pool',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Task Pool -> Dispatcher
  {
    id: 'e-taskpool-dispatcher',
    source: 'task-pool',
    target: 'dispatcher',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Dispatcher -> Agent Slots
  {
    id: 'e-dispatcher-agents',
    source: 'dispatcher',
    target: 'agent-slots',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Agent Slots -> Shepherd
  {
    id: 'e-agents-shepherd',
    source: 'agent-slots',
    target: 'shepherd',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Shepherd -> Memory (vertical: bottom -> top)
  {
    id: 'e-shepherd-memory',
    source: 'shepherd',
    target: 'memory',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },

  // === Cross-column edges ===

  // Repos -> Discovery (right column to center)
  {
    id: 'e-repos-discovery',
    source: 'repos',
    target: 'discovery',
    sourceHandle: 'left',
    targetHandle: 'right',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
  // Memory -> Discovery (feedback loop, dashed purple)
  {
    id: 'e-memory-discovery',
    source: 'memory',
    target: 'discovery',
    sourceHandle: 'right',
    targetHandle: 'right',
    type: 'smoothstep',
    style: feedbackEdgeStyle,
    markerEnd: { ...arrowMarker, color: 'hsl(280 30% 40%)' },
  },

  // === Support edges (dotted, left/right columns to center) ===

  // Alignment -> Discovery
  {
    id: 'e-alignment-discovery',
    source: 'alignment',
    target: 'discovery',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'smoothstep',
    style: supportEdgeStyle,
    markerEnd: supportArrowMarker,
  },
  // Blocked Check -> Task Pool
  {
    id: 'e-blocked-taskpool',
    source: 'blocked-check',
    target: 'task-pool',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'smoothstep',
    style: supportEdgeStyle,
    markerEnd: supportArrowMarker,
  },
  // Task Pool -> Digest
  {
    id: 'e-taskpool-digest',
    source: 'task-pool',
    target: 'digest',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'smoothstep',
    style: supportEdgeStyle,
    markerEnd: supportArrowMarker,
  },
  // Armory -> Agent Slots
  {
    id: 'e-armory-agents',
    source: 'armory',
    target: 'agent-slots',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'smoothstep',
    style: supportEdgeStyle,
    markerEnd: supportArrowMarker,
  },
  // Health Check -> Agent Slots
  {
    id: 'e-health-agents',
    source: 'health-check',
    target: 'agent-slots',
    sourceHandle: 'left-out',
    targetHandle: 'right',
    type: 'smoothstep',
    style: supportEdgeStyle,
    markerEnd: supportArrowMarker,
  },
  // Compaction -> Memory
  {
    id: 'e-compaction-memory',
    source: 'compaction',
    target: 'memory',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'smoothstep',
    style: supportEdgeStyle,
    markerEnd: supportArrowMarker,
  },
]

// =============================================================================
// Helpers
// =============================================================================

export function getVisibleNodes(): Node[] {
  return [...SYSTEM_NODES]
}

export function getAllNodes(): Node[] {
  return [...SYSTEM_NODES]
}

export function getVisibleEdges(): Edge[] {
  return [...SYSTEM_EDGES]
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

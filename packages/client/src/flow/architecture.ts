/**
 * Static architecture definition for Mycelium orchestration flow
 *
 * AUTO MODE - The primary orchestration loop:
 *
 *                    [Scheduler]
 *                   /           \
 *                  v             v
 *           [Discovery]    [Sequencer]
 *                  \            /
 *                   v          v
 *                   [Task Pool]
 *                        |
 *                        v
 *                  [Dispatcher]
 *                        |
 *                        v
 *                 [Running Agents]
 *                        |
 *                  +-----+-----+
 *                  v           v
 *             [Shepherd]   [Armory]
 *                  \           /
 *                   v         v
 *                    [Memory]
 *
 * Alignment is for human-in-the-loop mode (separate page)
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

// =============================================================================
// Layout Constants - Optimized for Auto Mode Flow
// =============================================================================

const LAYOUT = {
  // Canvas dimensions
  CANVAS_WIDTH: 1800,

  // Node dimensions
  NODE_WIDTH: 240,
  NODE_HEIGHT: 120,

  // Vertical spacing between tiers
  V_GAP: 200,

  // Horizontal spacing
  H_GAP: 360,

  // Tier Y positions (more breathing room)
  TIER_1_Y: 60,      // Scheduler
  TIER_2_Y: 280,     // Discovery, Sequencer
  TIER_3_Y: 520,     // Task Pool
  TIER_4_Y: 740,     // Dispatcher
  TIER_5_Y: 960,     // Running Agents
  TIER_6_Y: 1200,    // Shepherd, Armory
  TIER_7_Y: 1440,    // Memory
}

// Center of canvas
const CENTER_X = LAYOUT.CANVAS_WIDTH / 2

// Position helpers
const pos = (x: number, y: number) => ({ x, y })

// =============================================================================
// Node Definitions - Positioned for clear auto mode data flow
// =============================================================================

/** Tier 1: Scheduler - top center, controls everything */
export const schedulerNode: Node<SchedulerNodeData> = {
  id: 'scheduler',
  type: 'scheduler',
  position: pos(CENTER_X - 140, LAYOUT.TIER_1_Y),
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

/** Tier 2: Task Creation - Discovery and Sequencer side by side */
export const discoveryNode: Node<CycleNodeData> = {
  id: 'discovery',
  type: 'cycle',
  position: pos(CENTER_X - 280, LAYOUT.TIER_2_Y),
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
  position: pos(CENTER_X + 60, LAYOUT.TIER_2_Y),
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

/** Tier 3: Task Pool - central data store */
export const taskPoolNode: Node<TaskPoolNodeData> = {
  id: 'task-pool',
  type: 'taskPool',
  position: pos(CENTER_X - 150, LAYOUT.TIER_3_Y),
  data: {
    label: 'Task Pool',
    description: 'All tasks (pending, running, done)',
    counts: {
      pending: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    },
    total: 0,
  },
}

/** Tier 4: Dispatcher - picks ready tasks */
export const dispatcherNode: Node<CycleNodeData> = {
  id: 'dispatcher',
  type: 'cycle',
  position: pos(CENTER_X - 110, LAYOUT.TIER_4_Y),
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

/** Tier 5: Running Agents - active executions */
export const agentSlotsNode: Node<AgentSlotsNodeData> = {
  id: 'agent-slots',
  type: 'agentSlots',
  position: pos(CENTER_X - 140, LAYOUT.TIER_5_Y),
  data: {
    label: 'Running Agents',
    description: 'Active task executions',
    slots: [],
    max_slots: 10,
    active_count: 0,
  },
}

/** Tier 6: Feedback - Shepherd and Armory evaluate completed work */
export const shepherdNode: Node<CycleNodeData> = {
  id: 'shepherd',
  type: 'cycle',
  position: pos(CENTER_X - 280, LAYOUT.TIER_6_Y),
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

export const armoryNode: Node<CycleNodeData> = {
  id: 'armory',
  type: 'cycle',
  position: pos(CENTER_X + 60, LAYOUT.TIER_6_Y),
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

/** Tier 7: Memory - stores learned patterns */
export const memoryNode: Node<MemoryNodeData> = {
  id: 'memory',
  type: 'memory',
  position: pos(CENTER_X - 110, LAYOUT.TIER_7_Y),
  data: {
    label: 'Memory (Hyphae)',
    description: 'Patterns and warnings learned',
    pattern_count: 0,
    warning_count: 0,
    repos_with_memory: 0,
  },
}

/** Alignment - hidden in auto mode, used in human-in-the-loop mode */
export const alignmentNode: Node<AlignmentNodeData> = {
  id: 'alignment',
  type: 'alignment',
  position: { x: 0, y: 0 },
  hidden: true, // Not part of auto mode
  data: {
    label: 'Alignment',
    description: 'Human feedback via Telegram',
    pending_count: 0,
    total_signals: 0,
  },
}

/** Hidden nodes - shown in scheduler panel */
export const blockedCheckNode: Node<CycleNodeData> = {
  id: 'blocked-check',
  type: 'cycle',
  position: { x: 0, y: 0 },
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
  position: { x: 0, y: 0 },
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

export const compactionNode: Node<CycleNodeData> = {
  id: 'compaction',
  type: 'cycle',
  position: { x: 0, y: 0 },
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
  schedulerNode,
  discoveryNode,
  sequencerNode,
  taskPoolNode,
  dispatcherNode,
  agentSlotsNode,
  shepherdNode,
  armoryNode,
  memoryNode,
  // Hidden nodes
  alignmentNode,
  blockedCheckNode,
  digestNode,
  compactionNode,
]

// =============================================================================
// Edge Definitions - Clean auto mode flow
// =============================================================================

/** Arrow marker for edge direction */
const arrowMarker = {
  type: 'arrowclosed' as const,
  color: 'hsl(220 10% 50%)',
  width: 20,
  height: 20,
}

/** Base edge styling with arrow */
const baseEdgeStyle = {
  stroke: 'hsl(220 10% 45%)',
  strokeWidth: 2,
}

const activeEdgeStyle = {
  stroke: 'hsl(150 60% 45%)',
  strokeWidth: 2,
}

/** Label styling */
const labelStyle = { fontSize: 11, fill: 'hsl(0 0% 60%)', fontWeight: 500 }
const labelBgStyle = { fill: 'hsl(0 0% 8%)', fillOpacity: 0.95 }

export const SYSTEM_EDGES: Edge[] = [
  // =========================================================================
  // TIER 1 -> TIER 2: Scheduler triggers Discovery and Sequencer
  // =========================================================================
  {
    id: 'e-scheduler-discovery',
    source: 'scheduler',
    sourceHandle: 'bottom',
    target: 'discovery',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'triggers',
    labelStyle,
    labelBgStyle,
  },
  {
    id: 'e-scheduler-sequencer',
    source: 'scheduler',
    sourceHandle: 'bottom',
    target: 'sequencer',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },

  // =========================================================================
  // TIER 2 -> TIER 3: Discovery and Sequencer feed Task Pool
  // =========================================================================
  {
    id: 'e-discovery-taskpool',
    source: 'discovery',
    sourceHandle: 'bottom',
    target: 'task-pool',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'creates',
    labelStyle,
    labelBgStyle,
  },
  {
    id: 'e-sequencer-taskpool',
    source: 'sequencer',
    sourceHandle: 'bottom',
    target: 'task-pool',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'wires deps',
    labelStyle,
    labelBgStyle,
  },

  // =========================================================================
  // TIER 3 -> TIER 4: Task Pool feeds Dispatcher
  // =========================================================================
  {
    id: 'e-taskpool-dispatcher',
    source: 'task-pool',
    sourceHandle: 'bottom',
    target: 'dispatcher',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'ready',
    labelStyle,
    labelBgStyle,
  },

  // =========================================================================
  // TIER 4 -> TIER 5: Dispatcher runs agents
  // =========================================================================
  {
    id: 'e-dispatcher-agents',
    source: 'dispatcher',
    sourceHandle: 'bottom',
    target: 'agent-slots',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'runs',
    labelStyle,
    labelBgStyle,
  },

  // =========================================================================
  // TIER 5 -> TIER 6: Completed work flows to Shepherd and Armory
  // =========================================================================
  {
    id: 'e-agents-shepherd',
    source: 'agent-slots',
    sourceHandle: 'bottom',
    target: 'shepherd',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'evaluates',
    labelStyle,
    labelBgStyle,
  },
  {
    id: 'e-agents-armory',
    source: 'agent-slots',
    sourceHandle: 'bottom',
    target: 'armory',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'patterns',
    labelStyle,
    labelBgStyle,
  },

  // =========================================================================
  // TIER 6 -> TIER 7: Shepherd and Armory write to Memory
  // =========================================================================
  {
    id: 'e-shepherd-memory',
    source: 'shepherd',
    sourceHandle: 'bottom',
    target: 'memory',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
    label: 'learns',
    labelStyle,
    labelBgStyle,
  },
  {
    id: 'e-armory-memory',
    source: 'armory',
    sourceHandle: 'bottom',
    target: 'memory',
    targetHandle: 'top',
    type: 'smoothstep',
    style: baseEdgeStyle,
    markerEnd: arrowMarker,
  },
]

// =============================================================================
// Helper Functions
// =============================================================================

/** Get visible nodes (filter hidden) */
export function getVisibleNodes(): Node[] {
  return SYSTEM_NODES.filter(n => !n.hidden)
}

/** Get all nodes including hidden */
export function getAllNodes(): Node[] {
  return [...SYSTEM_NODES]
}

/** Get edges for visible nodes only */
export function getVisibleEdges(): Edge[] {
  const visibleIds = new Set(getVisibleNodes().map(n => n.id))
  return SYSTEM_EDGES.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
}

/** Update node data by ID */
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

/** Animate edge when active */
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

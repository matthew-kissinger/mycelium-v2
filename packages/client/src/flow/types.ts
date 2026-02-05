/**
 * Type definitions for system architecture nodes
 */

import type { Node, Edge } from '@xyflow/react'

// =============================================================================
// Node Data Types
// =============================================================================

/** Base data for all system nodes */
export interface BaseNodeData extends Record<string, unknown> {
  label: string
  description?: string
}

/** Scheduler node - master control */
export interface SchedulerNodeData extends BaseNodeData {
  running: boolean
  started_at?: string
  config?: {
    dispatcher_interval_sec: number
    discovery_interval_sec: number
    max_concurrent_tasks: number
  }
}

/** Cycle node - scheduler cycles (discovery, dispatcher, etc.) */
export interface CycleNodeData extends BaseNodeData {
  cycleType: 'discovery' | 'dispatcher' | 'shepherd' | 'armory' | 'blocked_check' | 'digest' | 'compaction' | 'health_check'
  enabled: boolean
  running: boolean
  last_run?: string
  next_run?: string
  runs_completed: number
  errors: number
  interval_sec?: number
}

/** Task pool node - aggregate task view */
export interface TaskPoolNodeData extends BaseNodeData {
  counts: {
    pending: number
    unsequenced: number
    waiting: number
    ready: number
    running: number
    done: number
    failed: number
    cancelled: number
  }
  total: number
}

/** Agent slots node - running agents */
export interface AgentSlotData {
  task_id: string
  task_title: string
  agent: string
  model: string
  repo_path: string
  started_at: string
  duration_sec?: number
}

export interface AgentSlotsNodeData extends BaseNodeData {
  slots: AgentSlotData[]
  max_slots: number
  active_count: number
}

/** Alignment node - telegram signals */
export interface AlignmentNodeData extends BaseNodeData {
  pending_count: number
  total_signals: number
  last_response?: string
}

/** Memory node - hyphae patterns/warnings */
export interface MemoryNodeData extends BaseNodeData {
  pattern_count: number
  warning_count: number
  repos_with_memory: number
}

/** Repos node - registered repositories */
export interface ReposNodeData extends BaseNodeData {
  total: number
  by_language: Record<string, number>
  with_pending_tasks: number
}

// =============================================================================
// Union Type for All Node Data
// =============================================================================

export type SystemNodeData =
  | SchedulerNodeData
  | CycleNodeData
  | TaskPoolNodeData
  | AgentSlotsNodeData
  | AlignmentNodeData
  | MemoryNodeData
  | ReposNodeData

// =============================================================================
// Node Type Names
// =============================================================================

export type SystemNodeType =
  | 'scheduler'
  | 'cycle'
  | 'taskPool'
  | 'agentSlots'
  | 'alignment'
  | 'memory'
  | 'repos'

// =============================================================================
// Typed Node and Edge
// =============================================================================

export type SystemNode = Node<SystemNodeData>
export type SystemEdge = Edge

// =============================================================================
// Panel Types
// =============================================================================

export type PanelType =
  | 'scheduler'
  | 'cycle'
  | 'taskPool'
  | 'agent'
  | 'alignment'
  | 'memory'
  | 'prompts'
  | 'logs'
  | 'repos'
  | 'inventory'
  | null

export interface PanelState {
  type: PanelType
  nodeId: string | null
  data?: Record<string, unknown>
}

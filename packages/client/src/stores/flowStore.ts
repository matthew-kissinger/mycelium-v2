/**
 * Flow Store - React Flow nodes and edges
 *
 * Subscribes to domain stores and updates node data accordingly.
 */

import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type {
  SchedulerNodeData,
  CycleNodeData,
  TaskPoolNodeData,
  AgentSlotsNodeData,
  AlignmentNodeData,
  MemoryNodeData,
  AgentSlotData,
} from '../flow/types'
import {
  getVisibleNodes,
  getVisibleEdges,
  updateNodeData,
  setEdgeActive,
} from '../flow/architecture'
import type { SchedulerStatus, Stats } from '../types'

interface FlowState {
  nodes: Node[]
  edges: Edge[]

  initializeNodes: () => void
  updateSchedulerNodes: (status: SchedulerStatus) => void
  updateStatsNodes: (stats: Stats) => void
  updateRunningTaskNodes: (tasks: AgentSlotData[]) => void
  updateSignalNodes: (pending: number, total: number) => void
  updateMemoryNodes: (patterns: number, warnings: number, repos: number) => void
  updateCycleRunning: (runningTypes: Set<string>) => void
}

export const useFlowStore = create<FlowState>((set) => ({
  nodes: [],
  edges: [],

  initializeNodes: () => {
    set({ nodes: getVisibleNodes(), edges: getVisibleEdges() })
  },

  updateSchedulerNodes: (status) => {
    set((state) => {
      let nodes = state.nodes
      let edges = state.edges
      nodes = updateNodeData<SchedulerNodeData>(nodes, 'scheduler', {
        running: status.running,
        started_at: status.started_at,
      })
      const edgeMap: Record<string, string[]> = {
        discovery: ['e-scheduler-discovery', 'e-discovery-taskpool'],
        sequencer: ['e-scheduler-sequencer', 'e-sequencer-taskpool'],
        dispatcher: ['e-taskpool-dispatcher', 'e-dispatcher-agents'],
        shepherd: ['e-agents-shepherd', 'e-shepherd-memory'],
        armory: ['e-agents-armory', 'e-armory-memory'],
      }
      for (const cycle of status.cycles) {
        const nodeId = cycle.name === 'blocked_check' ? 'blocked-check'
          : cycle.name === 'health_check' ? 'health-check'
          : cycle.name
        nodes = updateNodeData<CycleNodeData>(nodes, nodeId, {
          enabled: cycle.enabled,
          running: cycle.running,
          last_run: cycle.last_run,
          next_run: cycle.next_run,
          runs_completed: cycle.runs_completed,
          errors: cycle.errors,
        })
        const edgeIds = edgeMap[cycle.name]
        if (edgeIds) {
          for (const id of edgeIds) {
            edges = setEdgeActive(edges, id, cycle.running)
          }
        }
      }
      return { nodes, edges }
    })
  },

  updateStatsNodes: (stats) => {
    set((state) => {
      const nodes = updateNodeData<TaskPoolNodeData>(state.nodes, 'task-pool', {
        counts: {
          pending: stats.pending,
          unsequenced: stats.unsequenced,
          waiting: stats.waiting,
          ready: stats.ready,
          running: stats.running,
          done: stats.done,
          failed: stats.failed,
          cancelled: stats.cancelled,
        },
        total: stats.total,
      })
      return { nodes }
    })
  },

  updateRunningTaskNodes: (tasks) => {
    set((state) => {
      const nodes = updateNodeData<AgentSlotsNodeData>(state.nodes, 'agent-slots', {
        slots: tasks,
        active_count: tasks.length,
      })
      return { nodes }
    })
  },

  updateSignalNodes: (pending, total) => {
    set((state) => {
      const nodes = updateNodeData<AlignmentNodeData>(state.nodes, 'alignment', {
        pending_count: pending,
        total_signals: total,
      })
      return { nodes }
    })
  },

  updateMemoryNodes: (patterns, warnings, repos) => {
    set((state) => {
      const nodes = updateNodeData<MemoryNodeData>(state.nodes, 'memory', {
        pattern_count: patterns,
        warning_count: warnings,
        repos_with_memory: repos,
      })
      return { nodes }
    })
  },

  updateCycleRunning: (runningTypes) => {
    set((state) => {
      let nodes = state.nodes
      const cycleNodeMap: Record<string, string> = {
        discovery: 'discovery',
        sequencer: 'sequencer',
        shepherd: 'shepherd',
        armory: 'armory',
        dispatcher: 'dispatcher',
        blocked_check: 'blocked-check',
        digest: 'digest',
        compaction: 'compaction',
        health_check: 'health-check',
      }
      for (const [cycleType, nodeId] of Object.entries(cycleNodeMap)) {
        nodes = updateNodeData<CycleNodeData>(nodes, nodeId, {
          running: runningTypes.has(cycleType),
        })
      }
      return { nodes }
    })
  },
}))

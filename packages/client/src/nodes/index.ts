/**
 * Node type exports for React Flow
 */

// Legacy nodes (kept for backward compatibility and drill-in views)
import AgentNode from './AgentNode'
import TaskNode from './TaskNode'
import RepoNode from './RepoNode'
import SignalNode from './SignalNode'

// System architecture nodes
import { SchedulerNode } from './SchedulerNode'
import { CycleNode } from './CycleNode'
import { TaskPoolNode } from './TaskPoolNode'
import { AgentSlotsNode } from './AgentSlotsNode'
import { AlignmentNode } from './AlignmentNode'
import { MemoryNode } from './MemoryNode'

// Export individual components
export {
  // Legacy
  AgentNode,
  TaskNode,
  RepoNode,
  SignalNode,
  // System architecture
  SchedulerNode,
  CycleNode,
  TaskPoolNode,
  AgentSlotsNode,
  AlignmentNode,
  MemoryNode,
}

// Node type registration map for React Flow
export const nodeTypes = {
  // Legacy nodes
  agent: AgentNode,
  task: TaskNode,
  repo: RepoNode,
  signal: SignalNode,

  // System architecture nodes
  scheduler: SchedulerNode,
  cycle: CycleNode,
  taskPool: TaskPoolNode,
  agentSlots: AgentSlotsNode,
  alignment: AlignmentNode,
  memory: MemoryNode,
}

// Type for node type keys
export type NodeTypeName = keyof typeof nodeTypes

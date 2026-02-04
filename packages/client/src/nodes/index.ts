/**
 * Node type exports for React Flow
 */

import { SchedulerNode } from './SchedulerNode'
import { CycleNode } from './CycleNode'
import { TaskPoolNode } from './TaskPoolNode'
import { AgentSlotsNode } from './AgentSlotsNode'
import { AlignmentNode } from './AlignmentNode'
import { MemoryNode } from './MemoryNode'

export {
  SchedulerNode,
  CycleNode,
  TaskPoolNode,
  AgentSlotsNode,
  AlignmentNode,
  MemoryNode,
}

// Node type registration map for React Flow
export const nodeTypes = {
  scheduler: SchedulerNode,
  cycle: CycleNode,
  taskPool: TaskPoolNode,
  agentSlots: AgentSlotsNode,
  alignment: AlignmentNode,
  memory: MemoryNode,
}

// Type for node type keys
export type NodeTypeName = keyof typeof nodeTypes

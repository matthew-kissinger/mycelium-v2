import AgentNode from './AgentNode'
import TaskNode from './TaskNode'
import RepoNode from './RepoNode'
import SignalNode from './SignalNode'
import MemoryNode from './MemoryNode'

// Export individual components
export { AgentNode, TaskNode, RepoNode, SignalNode, MemoryNode }

// Node type registration map for React Flow
export const nodeTypes = {
  agent: AgentNode,
  task: TaskNode,
  repo: RepoNode,
  signal: SignalNode,
  memory: MemoryNode,
}

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

// System agent types matching the backend
type SystemAgentType = 'discovery' | 'sequencer' | 'shepherd' | 'genesis' | 'armory' | 'digest' | 'compaction'
type AgentStatus = 'idle' | 'running' | 'error'

interface AgentNodeData {
  label: string
  agentType: SystemAgentType
  status: AgentStatus
  description?: string
  lastRun?: string
  [key: string]: unknown
}

interface AgentNodeProps {
  data: AgentNodeData
  selected?: boolean
}

function AgentNode({ data, selected }: AgentNodeProps) {
  const statusColors: Record<AgentStatus, string> = {
    idle: 'border-muted-foreground',
    running: 'border-primary',
    error: 'border-destructive',
  }

  const agentColors: Record<SystemAgentType, string> = {
    discovery: 'bg-blue-900/50',
    sequencer: 'bg-purple-900/50',
    shepherd: 'bg-green-900/50',
    genesis: 'bg-orange-900/50',
    armory: 'bg-cyan-900/50',
    digest: 'bg-pink-900/50',
    compaction: 'bg-gray-700/50',
  }

  const agentIcons: Record<SystemAgentType, string> = {
    discovery: '?',
    sequencer: '#',
    shepherd: 'S',
    genesis: '+',
    armory: 'A',
    digest: 'D',
    compaction: 'C',
  }

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg transition-all ${statusColors[data.status]} ${agentColors[data.agentType]} ${selected ? 'ring-2 ring-primary' : ''}`}
      style={{ minWidth: 160 }}
    >
      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !w-3 !h-3"
      />

      {/* Header with icon and status indicator */}
      <div className="flex items-center gap-2">
        {/* Animated status indicator when running */}
        {data.status === 'running' && (
          <div className="relative">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-primary animate-ping" />
          </div>
        )}
        {data.status === 'error' && (
          <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
        )}
        {data.status === 'idle' && (
          <span className="text-sm font-mono">[{agentIcons[data.agentType]}]</span>
        )}
        <span className="font-medium text-foreground">{data.label}</span>
      </div>

      {/* Description */}
      {data.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {data.description}
        </p>
      )}

      {/* Last run time */}
      {data.lastRun && (
        <p className="mt-1 text-xs text-muted-foreground">
          Last: {data.lastRun}
        </p>
      )}

      {/* Running animation overlay */}
      {data.status === 'running' && (
        <div className="absolute inset-0 rounded-lg bg-primary/5 animate-pulse pointer-events-none" />
      )}

      {/* Output handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !w-3 !h-3"
      />
    </div>
  )
}

export default memo(AgentNode)

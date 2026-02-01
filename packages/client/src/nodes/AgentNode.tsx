import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface AgentNodeData {
  label: string
  agentType: 'system' | 'task' | 'claude' | 'codex' | 'gemini' | 'cline' | 'cursor'
  status: 'idle' | 'running' | 'success' | 'error'
  description?: string
}

function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  const statusColors = {
    idle: 'border-muted-foreground',
    running: 'border-primary animate-pulse',
    success: 'border-green-500',
    error: 'border-destructive',
  }

  const agentColors = {
    system: 'bg-purple-900/50',
    task: 'bg-green-900/50',
    claude: 'bg-orange-900/50',
    codex: 'bg-blue-900/50',
    gemini: 'bg-cyan-900/50',
    cline: 'bg-pink-900/50',
    cursor: 'bg-yellow-900/50',
  }

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg transition-all ${statusColors[data.status]} ${agentColors[data.agentType]} ${selected ? 'ring-2 ring-primary' : ''}`}
      style={{ minWidth: 150 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary"
      />

      <div className="flex items-center gap-2">
        {data.status === 'running' && (
          <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
        )}
        <span className="font-medium text-foreground">{data.label}</span>
      </div>

      {data.description && (
        <p className="mt-1 text-xs text-muted-foreground">{data.description}</p>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary"
      />
    </div>
  )
}

export default memo(AgentNode)

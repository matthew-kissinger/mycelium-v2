import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface TaskNodeData {
  label: string
  status: 'pending' | 'running' | 'done' | 'failed'
  agent?: string
  repo?: string
}

function TaskNode({ data, selected }: NodeProps<TaskNodeData>) {
  const statusColors = {
    pending: 'border-muted-foreground bg-muted',
    running: 'border-primary bg-primary/10 animate-pulse',
    done: 'border-green-500 bg-green-900/20',
    failed: 'border-destructive bg-destructive/20',
  }

  const statusIcons = {
    pending: '○',
    running: '◐',
    done: '●',
    failed: '✕',
  }

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg transition-all ${statusColors[data.status]} ${selected ? 'ring-2 ring-primary' : ''}`}
      style={{ minWidth: 180 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary"
      />

      <div className="flex items-center gap-2">
        <span className="text-sm">{statusIcons[data.status]}</span>
        <span className="font-medium text-foreground text-sm truncate max-w-[150px]">
          {data.label}
        </span>
      </div>

      <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
        {data.agent && <span className="bg-muted px-1.5 py-0.5 rounded">{data.agent}</span>}
        {data.repo && <span className="truncate max-w-[100px]">{data.repo}</span>}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary"
      />
    </div>
  )
}

export default memo(TaskNode)

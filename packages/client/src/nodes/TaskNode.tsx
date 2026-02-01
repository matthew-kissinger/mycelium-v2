import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

interface TaskNodeData {
  id: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  agent?: string
  model?: string
  repo_path: string
  depends_on: string[]
  [key: string]: unknown
}

interface TaskNodeProps {
  data: TaskNodeData
  selected?: boolean
}

function TaskNode({ data, selected }: TaskNodeProps) {
  const statusColors: Record<TaskNodeData['status'], string> = {
    pending: 'border-muted-foreground bg-muted',
    running: 'border-primary bg-primary/10',
    completed: 'border-green-500 bg-green-900/20',
    failed: 'border-destructive bg-destructive/20',
    cancelled: 'border-yellow-500 bg-yellow-900/20',
  }

  const statusIcons: Record<TaskNodeData['status'], string> = {
    pending: '○',
    running: '◐',
    completed: '●',
    failed: '✕',
    cancelled: '⊘',
  }

  // Extract repo name from path
  const repoName = data.repo_path?.split('/').pop() || ''

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg transition-all ${statusColors[data.status]} ${selected ? 'ring-2 ring-primary' : ''} ${data.status === 'running' ? 'animate-pulse' : ''}`}
      style={{ minWidth: 200 }}
    >
      {/* Dependency input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-3 !h-3"
      />

      {/* Title with status icon */}
      <div className="flex items-center gap-2">
        <span className="text-sm" title={data.status}>
          {statusIcons[data.status]}
        </span>
        <span className="font-medium text-foreground text-sm truncate max-w-[160px]" title={data.title}>
          {data.title}
        </span>
      </div>

      {/* Agent and model info */}
      <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        {data.agent && (
          <span className="bg-muted/50 px-1.5 py-0.5 rounded border border-border">
            {data.agent}
          </span>
        )}
        {data.model && (
          <span className="bg-muted/50 px-1.5 py-0.5 rounded border border-border">
            {data.model}
          </span>
        )}
      </div>

      {/* Repo name */}
      {repoName && (
        <div className="mt-1.5 text-xs text-muted-foreground truncate" title={data.repo_path}>
          {repoName}
        </div>
      )}

      {/* Dependency count indicator */}
      {data.depends_on && data.depends_on.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          Depends on {data.depends_on.length} task{data.depends_on.length > 1 ? 's' : ''}
        </div>
      )}

      {/* Dependent output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-3 !h-3"
      />
    </div>
  )
}

export default memo(TaskNode)

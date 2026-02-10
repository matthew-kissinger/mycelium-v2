/**
 * MaxAlignmentNode - React Flow node for Max Alignment cycle
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '../lib/utils'

interface MaxAlignmentNodeData extends Record<string, unknown> {
  label: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  lastHealth?: 'healthy' | 'warning' | 'critical'
  lastRepo?: string
}

const healthIndicator: Record<string, string> = {
  healthy: 'text-green-400',
  warning: 'text-yellow-400',
  critical: 'text-red-400',
}

function MaxAlignmentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as MaxAlignmentNodeData
  const { label, status, lastHealth, lastRepo } = nodeData
  const isRunning = status === 'running'

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-l-4 bg-zinc-900 px-3 py-2 min-w-[170px]',
        'border-l-purple-500',
        selected ? 'border-blue-500' : isRunning ? 'border-green-600' : 'border-zinc-700',
      )}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2">
        {/* Shield icon */}
        <svg className="w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span className="text-sm text-zinc-200">{label}</span>
        {isRunning && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
      </div>

      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
        {lastHealth ? (
          <span className={cn('font-medium', healthIndicator[lastHealth] ?? 'text-zinc-500')}>
            {lastHealth}
          </span>
        ) : (
          <span>No audits</span>
        )}
        {lastRepo && (
          <span className="truncate ml-auto" title={lastRepo}>
            {lastRepo.split('/').pop()}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const MaxAlignmentNode = memo(MaxAlignmentNodeComponent)

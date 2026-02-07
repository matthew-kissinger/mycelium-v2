/**
 * AlignmentNode - Compact human feedback signals
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AlignmentNodeData } from '../flow/types'
import { formatTimeAgo } from '../lib/formatters'

function AlignmentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as AlignmentNodeData
  const { pending_count, total_signals, last_response } = nodeData

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2.5 min-w-[200px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
      `}
      style={pending_count > 0 ? { boxShadow: '0 0 10px 1px rgba(245,158,11,0.15)' } : undefined}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">SIG</span>
        <span className="text-sm text-zinc-200">Alignment</span>
        {pending_count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 animate-pulse ml-auto">
            {pending_count} pending
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
        <span className="tabular-nums">Total: <span className="text-zinc-300">{total_signals}</span></span>
        {last_response && (
          <span>Last: <span className="text-zinc-300">{formatTimeAgo(last_response)}</span></span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const AlignmentNode = memo(AlignmentNodeComponent)

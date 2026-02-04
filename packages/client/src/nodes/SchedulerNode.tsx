/**
 * SchedulerNode - Compact master control
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { SchedulerNodeData } from '../flow/types'

function SchedulerNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as SchedulerNodeData
  const { running } = nodeData

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-4 py-2.5
        ${selected ? 'border-blue-500' : running ? 'border-green-600' : 'border-zinc-700'}
      `}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${running ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`}
        />
        <span className="font-semibold text-zinc-100 text-sm">Scheduler</span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            running ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'
          }`}
        >
          {running ? 'Running' : 'Stopped'}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-zinc-500 !w-2 !h-2"
      />
    </div>
  )
}

export const SchedulerNode = memo(SchedulerNodeComponent)

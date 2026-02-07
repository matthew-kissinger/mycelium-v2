/**
 * SchedulerNode - Master control with stats grid
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { SchedulerNodeData } from '../flow/types'
import { formatDuration } from '../lib/formatters'

function SchedulerNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as SchedulerNodeData
  const { running, started_at, total_cycles_completed, total_errors, config } = nodeData

  // Compute uptime from started_at
  let uptimeSec = 0
  if (running && started_at) {
    uptimeSec = Math.floor((Date.now() - new Date(started_at).getTime()) / 1000)
  }

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-4 py-2.5 min-w-[240px]
        ${selected ? 'border-blue-500' : running ? 'border-green-600' : 'border-zinc-700'}
      `}
      style={running ? { boxShadow: '0 0 12px 2px rgba(34,197,94,0.15)' } : undefined}
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

      {running && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[10px]">
          <div className="flex justify-between">
            <span className="text-zinc-500">Uptime</span>
            <span className="text-zinc-300 tabular-nums">{formatDuration(uptimeSec)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Cycles</span>
            <span className="text-zinc-300 tabular-nums">{total_cycles_completed ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Errors</span>
            <span className={`tabular-nums ${(total_errors ?? 0) > 0 ? 'text-red-400' : 'text-zinc-300'}`}>
              {total_errors ?? 0}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Max conc.</span>
            <span className="text-zinc-300 tabular-nums">{config?.max_concurrent_tasks ?? '-'}</span>
          </div>
        </div>
      )}

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

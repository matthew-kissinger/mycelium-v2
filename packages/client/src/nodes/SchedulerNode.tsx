/**
 * SchedulerNode - Master orchestration control
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { SchedulerNodeData } from '../flow/types'

function SchedulerNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as SchedulerNodeData
  const { label, running, started_at, config } = nodeData

  // Format uptime
  const formatUptime = (startedAt?: string) => {
    if (!startedAt) return null
    const start = new Date(startedAt)
    const now = new Date()
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000)

    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  }

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 p-4 min-w-[280px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
        ${running ? 'shadow-lg shadow-green-500/20' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${running ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`}
          />
          <span className="font-semibold text-zinc-100">{label}</span>
        </div>
        <span
          className={`
            text-xs px-2 py-1 rounded
            ${running ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'}
          `}
        >
          {running ? 'Running' : 'Stopped'}
        </span>
      </div>

      {/* Status */}
      <div className="space-y-2 text-sm">
        {running && started_at && (
          <div className="flex justify-between text-zinc-400">
            <span>Uptime</span>
            <span className="text-zinc-200">{formatUptime(started_at)}</span>
          </div>
        )}

        {config && (
          <>
            <div className="flex justify-between text-zinc-400">
              <span>Dispatcher</span>
              <span className="text-zinc-200">{config.dispatcher_interval_sec}s</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Discovery</span>
              <span className="text-zinc-200">{config.discovery_interval_sec}s</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Max Agents</span>
              <span className="text-zinc-200">{config.max_concurrent_tasks}</span>
            </div>
          </>
        )}
      </div>

      {/* Click hint */}
      <div className="mt-3 pt-2 border-t border-zinc-700 text-xs text-zinc-500 text-center">
        Click to {running ? 'stop' : 'start'} or configure
      </div>

      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-zinc-500 !w-3 !h-3"
      />
    </div>
  )
}

export const SchedulerNode = memo(SchedulerNodeComponent)

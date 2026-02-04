/**
 * CycleNode - Scheduler cycle (discovery, sequencer, dispatcher, etc.)
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CycleNodeData } from '../flow/types'

/** Cycle type to icon mapping */
const cycleIcons: Record<CycleNodeData['cycleType'], string> = {
  discovery: '🔍',
  sequencer: '🔗',
  dispatcher: '🚀',
  shepherd: '🐑',
  armory: '🛡️',
  blocked_check: '⏰',
  digest: '📊',
  compaction: '🗜️',
}

/** Cycle type to color mapping */
const cycleColors: Record<CycleNodeData['cycleType'], string> = {
  discovery: 'blue',
  sequencer: 'purple',
  dispatcher: 'green',
  shepherd: 'amber',
  armory: 'cyan',
  blocked_check: 'orange',
  digest: 'cyan',
  compaction: 'pink',
}

function CycleNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as CycleNodeData
  const {
    label,
    description,
    cycleType,
    enabled,
    running,
    last_run,
    runs_completed,
    errors,
    interval_sec,
  } = nodeData

  const color = cycleColors[cycleType]
  const icon = cycleIcons[cycleType]

  // Format time ago
  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  // Format interval
  const formatInterval = (sec?: number) => {
    if (!sec) return null
    if (sec < 60) return `${sec}s`
    if (sec < 3600) return `${Math.floor(sec / 60)}m`
    return `${Math.floor(sec / 3600)}h`
  }

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 p-3 min-w-[220px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
        ${running ? `shadow-lg shadow-${color}-500/20` : ''}
        ${!enabled ? 'opacity-50' : ''}
      `}
    >
      {/* Input handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-zinc-500 !w-2 !h-2"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-zinc-500 !w-2 !h-2"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-medium text-zinc-100">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {running && (
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
          {interval_sec && (
            <span className="text-xs text-zinc-500">{formatInterval(interval_sec)}</span>
          )}
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-zinc-500 mb-2">{description}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between text-zinc-400">
          <span>Last Run</span>
          <span className="text-zinc-300">{formatTimeAgo(last_run)}</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Runs</span>
          <span className="text-zinc-300">{runs_completed}</span>
        </div>
        {errors > 0 && (
          <div className="col-span-2 flex justify-between text-red-400">
            <span>Errors</span>
            <span>{errors}</span>
          </div>
        )}
      </div>

      {/* Status indicator */}
      <div className="mt-2 pt-2 border-t border-zinc-700">
        <div className="flex items-center justify-between">
          <span
            className={`
              text-xs px-2 py-0.5 rounded
              ${enabled ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'}
            `}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span className="text-xs text-zinc-500">Click to trigger</span>
        </div>
      </div>

      {/* Output handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-zinc-500 !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-zinc-500 !w-2 !h-2"
      />
    </div>
  )
}

export const CycleNode = memo(CycleNodeComponent)

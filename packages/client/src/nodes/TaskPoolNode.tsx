/**
 * TaskPoolNode - Aggregate view of all tasks
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TaskPoolNodeData } from '../flow/types'

function TaskPoolNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as TaskPoolNodeData
  const { label, counts, total } = nodeData

  const statusConfig = [
    { key: 'pending' as const, label: 'Pending', color: 'bg-yellow-500', textColor: 'text-yellow-400' },
    { key: 'running' as const, label: 'Running', color: 'bg-blue-500', textColor: 'text-blue-400' },
    { key: 'done' as const, label: 'Done', color: 'bg-green-500', textColor: 'text-green-400' },
    { key: 'failed' as const, label: 'Failed', color: 'bg-red-500', textColor: 'text-red-400' },
    { key: 'cancelled' as const, label: 'Cancelled', color: 'bg-zinc-500', textColor: 'text-zinc-400' },
  ]

  // Calculate bar widths
  const maxCount = Math.max(...Object.values(counts), 1)

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 p-4 min-w-[300px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
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
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className="!bg-zinc-500 !w-2 !h-2"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="font-semibold text-zinc-100">{label}</span>
        </div>
        <span className="text-sm text-zinc-400">{total} total</span>
      </div>

      {/* Status bars */}
      <div className="space-y-2">
        {statusConfig.map(({ key, label, color, textColor }) => {
          const count = counts[key]
          const width = (count / maxCount) * 100

          return (
            <div key={key} className="flex items-center gap-2">
              <span className={`text-xs w-20 ${textColor}`}>{label}</span>
              <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                <div
                  className={`h-full ${color} transition-all duration-300`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-xs text-zinc-300 w-8 text-right">{count}</span>
            </div>
          )
        })}
      </div>

      {/* Sequenced indicator */}
      <div className="mt-3 pt-2 border-t border-zinc-700 flex items-center justify-between text-xs">
        <span className="text-zinc-500">Click to view all tasks</span>
        {counts.running > 0 && (
          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded animate-pulse">
            {counts.running} active
          </span>
        )}
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

export const TaskPoolNode = memo(TaskPoolNodeComponent)

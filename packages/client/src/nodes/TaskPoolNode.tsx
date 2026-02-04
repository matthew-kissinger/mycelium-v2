/**
 * TaskPoolNode - Compact task summary with pipeline sub-states
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TaskPoolNodeData } from '../flow/types'

function TaskPoolNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as TaskPoolNodeData
  const { counts, total } = nodeData

  const bars = [
    { key: 'unsequenced', label: 'New', color: 'bg-amber-500', text: 'text-amber-400' },
    { key: 'ready', label: 'Ready', color: 'bg-lime-500', text: 'text-lime-400' },
    { key: 'running', label: 'Run', color: 'bg-blue-500', text: 'text-blue-400' },
    { key: 'done', label: 'Done', color: 'bg-green-500', text: 'text-green-400' },
    { key: 'failed', label: 'Fail', color: 'bg-red-500', text: 'text-red-400' },
  ] as const

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2.5 min-w-[200px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">TSK</span>
          <span className="text-sm font-medium text-zinc-200">Tasks</span>
        </div>
        <span className="text-xs text-zinc-500 tabular-nums">{total}</span>
      </div>

      <div className="space-y-1">
        {bars.map(({ key, label, color, text }) => {
          const count = counts[key] ?? 0
          if (key !== 'running' && key !== 'ready' && count === 0) return null
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`text-[10px] w-10 ${text}`}>{label}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
                <div
                  className={`h-full ${color} transition-all duration-300`}
                  style={{ width: `${Math.min((count / Math.max(total, 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-400 w-6 text-right tabular-nums">{count}</span>
            </div>
          )
        })}
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const TaskPoolNode = memo(TaskPoolNodeComponent)

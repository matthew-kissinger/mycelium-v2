/**
 * ReposNode - Shows registered repositories
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ReposNodeData } from '../flow/types'

function ReposNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as ReposNodeData
  const { total, by_language, with_pending_tasks } = nodeData

  // Get top 3 languages
  const topLangs = Object.entries(by_language || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2.5 min-w-[160px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">REP</span>
          <span className="text-sm font-medium text-zinc-200">Repos</span>
        </div>
        <span className="text-xs text-zinc-500 tabular-nums">{total}</span>
      </div>

      <div className="space-y-1 text-[10px]">
        {topLangs.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {topLangs.map(([lang, count]) => (
              <span key={lang} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {lang} <span className="text-zinc-500">{count}</span>
              </span>
            ))}
          </div>
        )}
        {with_pending_tasks > 0 && (
          <div className="text-amber-400">
            {with_pending_tasks} with pending tasks
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const ReposNode = memo(ReposNodeComponent)

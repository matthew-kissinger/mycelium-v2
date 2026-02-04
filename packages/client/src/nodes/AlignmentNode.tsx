/**
 * AlignmentNode - Human feedback via Telegram signals
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AlignmentNodeData } from '../flow/types'

function AlignmentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as AlignmentNodeData
  const { label, description, pending_count, total_signals, last_response } = nodeData

  // Format time ago
  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 p-4 min-w-[240px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
        ${pending_count > 0 ? 'shadow-lg shadow-amber-500/20' : ''}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-500 !w-2 !h-2"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <span className="font-semibold text-zinc-100">{label}</span>
        </div>
        {pending_count > 0 && (
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded animate-pulse">
            {pending_count} pending
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-zinc-500 mb-3">{description}</p>
      )}

      {/* Stats */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-zinc-400">
          <span>Total Signals</span>
          <span className="text-zinc-200">{total_signals}</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Awaiting Response</span>
          <span className={pending_count > 0 ? 'text-amber-400' : 'text-zinc-200'}>
            {pending_count}
          </span>
        </div>
        {last_response && (
          <div className="flex justify-between text-zinc-400">
            <span>Last Response</span>
            <span className="text-zinc-200">{formatTimeAgo(last_response)}</span>
          </div>
        )}
      </div>

      {/* Telegram indicator */}
      <div className="mt-3 pt-2 border-t border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs text-zinc-500">via Telegram</span>
        </div>
        <span className="text-xs text-zinc-500">Click to view</span>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-500 !w-2 !h-2"
      />
    </div>
  )
}

export const AlignmentNode = memo(AlignmentNodeComponent)

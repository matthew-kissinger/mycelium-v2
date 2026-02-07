/**
 * MemoryNode - Patterns/warnings with ratio bar
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface ExtendedMemoryNodeData {
  label: string
  pattern_count: number
  warning_count: number
  repos_with_memory: number
}

function MemoryNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ExtendedMemoryNodeData
  const patterns = nodeData.pattern_count || 0
  const warnings = nodeData.warning_count || 0
  const repos = nodeData.repos_with_memory || 0
  const total = patterns + warnings

  // Border severity
  const borderColor = selected
    ? 'border-blue-500'
    : warnings > 5
      ? 'border-red-700'
      : warnings > 0
        ? 'border-amber-700'
        : 'border-zinc-700'

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2.5 min-w-[200px]
        ${borderColor}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">MEM</span>
        <span className="text-sm text-zinc-200">Memory</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-blue-400 tabular-nums">{patterns}P</span>
          <span className="text-[10px] text-amber-400 tabular-nums">{warnings}W</span>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-1.5 h-1.5 bg-zinc-800 rounded overflow-hidden flex">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${(patterns / total) * 100}%` }}
          />
          <div
            className="h-full bg-amber-500"
            style={{ width: `${(warnings / total) * 100}%` }}
          />
        </div>
      )}

      {repos > 0 && (
        <div className="mt-1 text-[10px] text-zinc-500">
          {repos} repos with memory
        </div>
      )}

      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const MemoryNode = memo(MemoryNodeComponent)
export default MemoryNode

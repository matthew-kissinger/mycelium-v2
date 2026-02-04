/**
 * MemoryNode - Compact patterns/warnings summary
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

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2.5
        ${selected ? 'border-blue-500' : warnings > 0 ? 'border-amber-700' : 'border-zinc-700'}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">MEM</span>
        <span className="text-sm text-zinc-200">Memory</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-blue-400 tabular-nums">{patterns}P</span>
          <span className="text-[10px] text-amber-400 tabular-nums">{warnings}W</span>
        </div>
      </div>

      <Handle type="source" position={Position.Top} id="top-out" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const MemoryNode = memo(MemoryNodeComponent)
export default MemoryNode

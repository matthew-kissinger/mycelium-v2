/**
 * AgentSlotsNode - Compact running agents view
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentSlotsNodeData, AgentSlotData } from '../flow/types'

const agentColors: Record<string, string> = {
  claude: 'bg-orange-500',
  codex: 'bg-emerald-500',
  gemini: 'bg-blue-500',
  cline: 'bg-purple-500',
  cursor: 'bg-pink-500',
}

function AgentSlotsNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as AgentSlotsNodeData
  const { slots, active_count } = nodeData

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2.5 min-w-[180px]
        ${selected ? 'border-blue-500' : active_count > 0 ? 'border-green-600' : 'border-zinc-700'}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">AGT</span>
        <span className="text-sm text-zinc-200">Agents</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ml-auto ${
          active_count > 0 ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'
        }`}>
          {active_count}
        </span>
      </div>

      {slots.length > 0 && (
        <div className="space-y-1 mt-1.5">
          {slots.slice(0, 2).map((slot: AgentSlotData) => (
            <div key={slot.task_id} className="flex items-center gap-1.5">
              <div className={`w-1.5 h-4 rounded ${agentColors[slot.agent] || 'bg-zinc-500'}`} />
              <span className="text-[10px] text-zinc-400 truncate max-w-[140px]">{slot.task_title}</span>
            </div>
          ))}
          {slots.length > 2 && (
            <span className="text-[10px] text-zinc-600">+{slots.length - 2} more</span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Left} id="left-out" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const AgentSlotsNode = memo(AgentSlotsNodeComponent)

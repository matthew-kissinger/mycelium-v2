/**
 * AgentSlotsNode - Running agents with expanded slots
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
  kiro: 'bg-yellow-500',
  vibe: 'bg-indigo-500',
  pi: 'bg-teal-500',
  opencode: 'bg-lime-500',
  copilot: 'bg-sky-500',
}

function liveDuration(started_at: string): string {
  const sec = Math.floor((Date.now() - new Date(started_at).getTime()) / 1000)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function AgentSlotsNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as AgentSlotsNodeData
  const { slots, active_count } = nodeData

  // Check for blocked tasks (>30min)
  const hasBlocked = slots.some(s => {
    const sec = (Date.now() - new Date(s.started_at).getTime()) / 1000
    return sec > 1800
  })

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2.5 min-w-[250px]
        ${selected ? 'border-blue-500' : active_count > 0 ? 'border-green-600' : 'border-zinc-700'}
      `}
      style={hasBlocked ? { boxShadow: '0 0 10px 1px rgba(239,68,68,0.15)' } : undefined}
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
          {slots.slice(0, 5).map((slot: AgentSlotData) => (
            <div key={slot.task_id} className="flex items-center gap-1.5">
              <div className={`w-1.5 h-4 rounded ${agentColors[slot.agent] || 'bg-zinc-500'}`} />
              <span className="text-[10px] text-zinc-300 truncate" style={{ maxWidth: '80px' }}>
                {slot.agent}/{slot.model || '?'}
              </span>
              <span className="text-[10px] text-zinc-500 ml-auto tabular-nums">
                {liveDuration(slot.started_at)}
              </span>
            </div>
          ))}
          {slots.length > 5 && (
            <span className="text-[10px] text-zinc-600">+{slots.length - 5} more</span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Left} id="left-out" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const AgentSlotsNode = memo(AgentSlotsNodeComponent)

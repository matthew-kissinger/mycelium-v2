/**
 * AgentSlotsNode - Running task agents
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentSlotsNodeData, AgentSlotData } from '../flow/types'

/** Agent color mapping */
const agentColors: Record<string, string> = {
  claude: 'bg-orange-500',
  codex: 'bg-emerald-500',
  gemini: 'bg-blue-500',
  cline: 'bg-purple-500',
  cursor: 'bg-pink-500',
}

function AgentSlot({ slot }: { slot: AgentSlotData }) {
  const color = agentColors[slot.agent] || 'bg-zinc-500'

  // Format duration
  const formatDuration = (sec?: number) => {
    if (!sec) {
      // Calculate from started_at
      const start = new Date(slot.started_at)
      const now = new Date()
      const diff = Math.floor((now.getTime() - start.getTime()) / 1000)
      if (diff < 60) return `${diff}s`
      return `${Math.floor(diff / 60)}m ${diff % 60}s`
    }
    if (sec < 60) return `${sec}s`
    return `${Math.floor(sec / 60)}m`
  }

  // Truncate title
  const truncate = (str: string, len: number) =>
    str.length > len ? str.slice(0, len) + '...' : str

  return (
    <div className="flex items-center gap-2 p-2 bg-zinc-800 rounded">
      {/* Agent indicator */}
      <div className={`w-2 h-8 rounded ${color}`} />

      {/* Task info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-zinc-200 truncate">
          {truncate(slot.task_title, 25)}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="capitalize">{slot.agent}</span>
          <span>·</span>
          <span>{slot.model}</span>
        </div>
      </div>

      {/* Duration */}
      <div className="text-xs text-zinc-400 tabular-nums">
        {formatDuration(slot.duration_sec)}
      </div>

      {/* Running indicator */}
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
    </div>
  )
}

function EmptySlot() {
  return (
    <div className="flex items-center justify-center p-2 bg-zinc-800/50 rounded border border-dashed border-zinc-700 text-xs text-zinc-600">
      Empty slot
    </div>
  )
}

function AgentSlotsNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as AgentSlotsNodeData
  const { label, slots, max_slots, active_count } = nodeData

  // Show up to 3 slots in the node, rest in panel
  const visibleSlots = slots.slice(0, 3)
  const hiddenCount = slots.length - visibleSlots.length

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 p-4 min-w-[280px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
        ${active_count > 0 ? 'shadow-lg shadow-green-500/20' : ''}
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-semibold text-zinc-100">{label}</span>
        </div>
        <span
          className={`
            text-sm px-2 py-0.5 rounded
            ${active_count > 0
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-700 text-zinc-400'
            }
          `}
        >
          {active_count}/{max_slots}
        </span>
      </div>

      {/* Agent slots */}
      <div className="space-y-2">
        {visibleSlots.length > 0 ? (
          <>
            {visibleSlots.map((slot: AgentSlotData) => (
              <AgentSlot key={slot.task_id} slot={slot} />
            ))}
            {hiddenCount > 0 && (
              <div className="text-xs text-zinc-500 text-center py-1">
                +{hiddenCount} more running
              </div>
            )}
          </>
        ) : (
          <>
            <EmptySlot />
            <EmptySlot />
          </>
        )}
      </div>

      {/* Capacity indicator */}
      <div className="mt-3 pt-2 border-t border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Capacity</span>
          <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                active_count >= max_slots ? 'bg-red-500' :
                active_count > max_slots * 0.7 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${(active_count / max_slots) * 100}%` }}
            />
          </div>
        </div>
        <div className="text-xs text-zinc-500 text-center mt-1">
          Click to view logs
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

export const AgentSlotsNode = memo(AgentSlotsNodeComponent)

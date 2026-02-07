/**
 * CycleNode - Scheduler cycle card with stats
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CycleNodeData } from '../flow/types'
import { formatTimeAgo, formatInterval } from '../lib/formatters'

const cycleLabels: Record<CycleNodeData['cycleType'], string> = {
  discovery: 'DSC',
  dispatcher: 'DIS',
  shepherd: 'SHP',
  armory: 'ARM',
  blocked_check: 'BLK',
  digest: 'DIG',
  compaction: 'CMP',
  health_check: 'HLT',
}

const accentColors: Record<string, string> = {
  discovery: 'border-l-cyan-500',
  dispatcher: 'border-l-blue-500',
  shepherd: 'border-l-purple-500',
  armory: 'border-l-zinc-500',
  blocked_check: 'border-l-zinc-500',
  digest: 'border-l-zinc-500',
  compaction: 'border-l-zinc-500',
  health_check: 'border-l-zinc-500',
}

function CycleNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as CycleNodeData
  const { label, cycleType, enabled, running, interval_sec, last_run, runs_completed, errors } = nodeData
  const shortLabel = cycleLabels[cycleType]
  const accent = accentColors[cycleType] || 'border-l-zinc-500'
  const intervalLabel = formatInterval(interval_sec)

  return (
    <div
      className={`
        rounded-lg border-2 border-l-4 bg-zinc-900 px-3 py-2 min-w-[170px]
        ${accent}
        ${selected ? 'border-blue-500' : running ? 'border-green-600' : 'border-zinc-700'}
        ${!enabled ? 'opacity-40' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">{shortLabel}</span>
        <span className="text-sm text-zinc-200">{label}</span>
        {running && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
        {intervalLabel && (
          <span className="text-[9px] text-zinc-600 ml-auto">{intervalLabel}</span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
        <span title="Last run">{last_run ? formatTimeAgo(last_run) : 'Never'}</span>
        <span className="text-zinc-300 tabular-nums" title="Runs">{runs_completed}r</span>
        <span className={`tabular-nums ${errors > 0 ? 'text-red-400' : ''}`} title="Errors">{errors}e</span>
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Left} id="left-out" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const CycleNode = memo(CycleNodeComponent)

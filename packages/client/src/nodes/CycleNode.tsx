/**
 * CycleNode - Compact scheduler cycle card
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CycleNodeData } from '../flow/types'

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

function CycleNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as CycleNodeData
  const { label, cycleType, enabled, running } = nodeData
  const shortLabel = cycleLabels[cycleType]

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 px-3 py-2
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
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const CycleNode = memo(CycleNodeComponent)

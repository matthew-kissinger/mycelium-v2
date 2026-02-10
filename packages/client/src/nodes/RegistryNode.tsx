/**
 * RegistryNode - Agent/provider registry (data store style)
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface RegistryNodeData {
  label: string
  agent_count: number
  provider_count: number
  status: 'healthy' | 'degraded' | 'error'
}

function RegistryNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as RegistryNodeData
  const agentCount = nodeData.agent_count || 0
  const providerCount = nodeData.provider_count || 0
  const status = nodeData.status || 'healthy'

  const statusDot =
    status === 'healthy' ? 'bg-green-500' :
    status === 'degraded' ? 'bg-yellow-500' :
    'bg-red-500'

  return (
    <div
      className={`
        rounded-xl border-2 border-dashed bg-zinc-900 px-3 py-2.5 min-w-[180px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">REG</span>
          <span className="text-sm font-medium text-zinc-200">Registry</span>
        </div>
        <div className={`w-2 h-2 rounded-full ${statusDot}`} />
      </div>

      <div className="flex items-center gap-3 text-[10px] text-zinc-400">
        <span>{agentCount} agents</span>
        <span>{providerCount} providers</span>
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const RegistryNode = memo(RegistryNodeComponent)
export default RegistryNode

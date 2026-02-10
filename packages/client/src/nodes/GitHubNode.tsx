/**
 * GitHubNode - GitHub integration status (React Flow node)
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export interface GitHubNodeData extends Record<string, unknown> {
  label: string
  synced_count: number
  total_repos: number
  active_prs: number
  status: 'synced' | 'syncing' | 'idle'
}

function GitHubNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as GitHubNodeData
  const { synced_count, total_repos, active_prs, status } = nodeData

  const statusColor =
    status === 'synced' ? 'bg-green-500'
    : status === 'syncing' ? 'bg-yellow-500'
    : 'bg-zinc-600'

  return (
    <div
      className={`
        rounded-xl border-2 border-dashed bg-zinc-900 px-3 py-2.5 min-w-[200px]
        ${selected ? 'border-blue-500' : 'border-zinc-700'}
      `}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5" />

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">GH</span>
          <span className="text-sm font-medium text-zinc-200">GitHub</span>
        </div>
        <div className={`w-2 h-2 rounded-full ${statusColor}`} title={status} />
      </div>

      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between text-zinc-400">
          <span>Synced repos</span>
          <span className="text-zinc-200 tabular-nums">{synced_count}/{total_repos}</span>
        </div>
        {active_prs > 0 && (
          <div className="flex justify-between text-zinc-400">
            <span>Active PRs</span>
            <span className="text-green-400 tabular-nums">{active_prs}</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  )
}

export const GitHubNode = memo(GitHubNodeComponent)

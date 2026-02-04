/**
 * Header - Top bar with title and stats
 */

import type { Stats } from '@mycelium/shared'
import { useSystemStore } from '../stores/system'

interface HeaderProps {
  stats?: Stats
}

export function Header({ stats }: HeaderProps) {
  const { connected, scheduler, openPanel } = useSystemStore()

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4">
      {/* Left: Title and connection status */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-zinc-100">Mycelium v2</h1>
        <span className="text-xs text-zinc-500">Agent Orchestration</span>

        {/* Connection indicator */}
        <div className="flex items-center gap-1.5 ml-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <span className="text-xs text-zinc-500">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {/* Scheduler status */}
        {scheduler && (
          <span className={`text-xs px-2 py-0.5 rounded ${
            scheduler.running
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-700 text-zinc-400'
          }`}>
            Scheduler: {scheduler.running ? 'Running' : 'Stopped'}
          </span>
        )}

        {/* Quick access buttons */}
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => openPanel('repos', 'repos')}
            className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            Repos
          </button>
          <button
            onClick={() => openPanel('inventory', 'inventory')}
            className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            Skills/MCPs
          </button>
        </div>
      </div>

      {/* Right: Stats */}
      {stats && (
        <div className="flex items-center gap-4 text-sm">
          <Stat label="Total" value={stats.total_tasks || 0} />
          <Stat label="Pending" value={stats.pending} color="text-yellow-400" />
          <Stat label="Running" value={stats.running} color="text-blue-400" />
          <Stat label="Done" value={stats.done} color="text-green-400" />
          <Stat label="Failed" value={stats.failed} color="text-red-400" />
          {stats.per_use_cost_usd !== undefined ? (
            <>
              <Stat
                label="Cline"
                value={`$${stats.per_use_cost_usd.toFixed(2)}`}
                color="text-amber-400"
              />
              <Stat
                label="Sub"
                value={`${stats.subscription_task_count || 0} tasks`}
                color="text-zinc-400"
              />
            </>
          ) : stats.total_cost_usd !== undefined && (
            <Stat label="Cost" value={`$${stats.total_cost_usd.toFixed(2)}`} color="text-zinc-300" />
          )}
        </div>
      )}
    </header>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-500">{label}:</span>
      <span className={color ?? 'text-zinc-300'}>{value}</span>
    </div>
  )
}

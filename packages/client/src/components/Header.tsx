import type { Stats } from '@mycelium/shared'

interface HeaderProps {
  stats?: Stats
}

export function Header({ stats }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-muted px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Mycelium v2</h1>
        <span className="text-xs text-muted-foreground">Agent Orchestration</span>
      </div>

      {stats && (
        <div className="flex items-center gap-4 text-sm">
          <Stat label="Total" value={stats.total_tasks} />
          <Stat label="Pending" value={stats.pending} color="text-muted-foreground" />
          <Stat label="Running" value={stats.running} color="text-primary" />
          <Stat label="Done" value={stats.done} color="text-green-500" />
          <Stat label="Failed" value={stats.failed} color="text-destructive" />
          <Stat label="Cost" value={`$${stats.total_cost_usd.toFixed(2)}`} />
        </div>
      )}
    </header>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className={color ?? 'text-foreground'}>{value}</span>
    </div>
  )
}

/**
 * Shared formatting utilities
 */

/** Format a date string as relative time (e.g., "5m ago", "2h ago") */
export function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Format seconds as duration (e.g., "5m 30s", "2h 15m") */
export function formatDuration(seconds?: number): string {
  if (!seconds || seconds === 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

/** Format cost in USD */
export function formatCost(cost?: number): string {
  if (cost === undefined || cost === null) return '-'
  return `$${cost.toFixed(4)}`
}

/** Format interval seconds as short label */
export function formatInterval(sec?: number): string | null {
  if (!sec) return null
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h`
}

/**
 * Status display utilities
 */

/** Get CSS color classes for a task status */
export function statusColor(status: string): string {
  switch (status) {
    case 'pending': return 'text-yellow-400'
    case 'running': return 'text-blue-400'
    case 'done': return 'text-green-400'
    case 'failed': return 'text-red-400'
    case 'cancelled': return 'text-zinc-400'
    default: return 'text-zinc-500'
  }
}

/** Get CSS background classes for a status badge */
export function statusBadge(status: string): string {
  switch (status) {
    case 'pending': return 'bg-yellow-500/20 text-yellow-400'
    case 'running': return 'bg-blue-500/20 text-blue-400'
    case 'done': return 'bg-green-500/20 text-green-400'
    case 'failed': return 'bg-red-500/20 text-red-400'
    case 'cancelled': return 'bg-zinc-700 text-zinc-400'
    default: return 'bg-zinc-700 text-zinc-500'
  }
}

/** Truncate a string with ellipsis */
export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str
}

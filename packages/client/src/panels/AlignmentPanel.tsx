/**
 * AlignmentPanel - Alignment signals management
 */

import { useEffect, useState } from 'react'

// Signal type for AlignmentPanel
interface Signal {
  id: string
  question: string
  options?: string[]
  status: 'pending' | 'responded' | 'expired'
  response?: string
  task_id?: string
  repo_path?: string
  created_at: string
  responded_at?: string
}

export function AlignmentPanel({
  signals,
  loading,
  pendingCount,
  onFetch,
  onRespond,
  onDelete,
}: {
  signals: Signal[]
  loading: boolean
  pendingCount: number
  onFetch: () => void
  onRespond: (id: string, response: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'responded'>('all')
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null)

  // Fetch signals on mount
  useEffect(() => {
    onFetch()
  }, [onFetch])

  const filteredSignals = signals.filter(s => {
    if (filter === 'all') return true
    if (filter === 'pending') return s.status === 'pending'
    if (filter === 'responded') return s.status === 'responded'
    return true
  })

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const handleRespond = async (signalId: string, response: string) => {
    setRespondingTo(signalId)
    try {
      await onRespond(signalId, response)
      setExpandedSignal(null)
    } catch {
      // Error handled in store
    } finally {
      setRespondingTo(null)
    }
  }

  const handleDelete = async (signalId: string) => {
    if (!confirm('Delete this signal?')) return
    try {
      await onDelete(signalId)
    } catch {
      // Error handled in store
    }
  }

  return (
    <div className="space-y-4">
      {/* Pending count */}
      <div className="bg-zinc-800 rounded-lg p-4 text-center">
        <div className={`text-3xl font-semibold ${pendingCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
          {pendingCount}
        </div>
        <div className="text-sm text-zinc-500">Pending Signals</div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
        {(['all', 'pending', 'responded'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 px-3 py-1.5 rounded text-sm capitalize transition-colors ${
              filter === f
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Signals list */}
      {loading && signals.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          Loading signals...
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-zinc-500 mb-2">No {filter !== 'all' ? filter : ''} signals</div>
          {filter === 'pending' && (
            <div className="text-xs text-zinc-600">
              Agents will create signals when they need input
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSignals.map((signal) => (
            <div
              key={signal.id}
              className={`bg-zinc-800 rounded-lg overflow-hidden ${
                signal.status === 'pending' ? 'ring-1 ring-amber-500/30' : ''
              }`}
            >
              {/* Signal header */}
              <button
                onClick={() => setExpandedSignal(expandedSignal === signal.id ? null : signal.id)}
                className="w-full p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 line-clamp-2">
                      {signal.question}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      <span>{formatTimeAgo(signal.created_at)}</span>
                      {signal.repo_path && (
                        <>
                          <span>-</span>
                          <span className="truncate max-w-32">{signal.repo_path.split('/').pop()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${
                    signal.status === 'pending'
                      ? 'bg-amber-500/20 text-amber-400'
                      : signal.status === 'responded'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {signal.status}
                  </span>
                </div>
              </button>

              {/* Expanded content */}
              {expandedSignal === signal.id && (
                <div className="px-3 pb-3 space-y-3 border-t border-zinc-700 pt-3">
                  {/* Options */}
                  {signal.status === 'pending' ? (
                    <div className="space-y-2">
                      <div className="text-xs text-zinc-500 uppercase font-medium">Choose Response</div>
                      {(signal.options || []).map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleRespond(signal.id, option)}
                          disabled={respondingTo === signal.id}
                          className="w-full px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-sm text-left transition-colors disabled:opacity-50"
                        >
                          {respondingTo === signal.id ? 'Responding...' : option}
                        </button>
                      ))}
                    </div>
                  ) : signal.response ? (
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium mb-1">Response</div>
                      <div className="text-sm text-green-400 bg-green-500/10 px-3 py-2 rounded">
                        {signal.response}
                      </div>
                      {signal.responded_at && (
                        <div className="text-xs text-zinc-500 mt-1">
                          Responded {formatTimeAgo(signal.responded_at)}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Task link */}
                  {signal.task_id && (
                    <div className="text-xs text-zinc-500">
                      Task: <span className="text-zinc-400 font-mono">{signal.task_id}</span>
                    </div>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(signal.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete Signal
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Refresh button */}
      <button
        onClick={onFetch}
        disabled={loading}
        className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm disabled:opacity-50"
      >
        {loading ? 'Refreshing...' : 'Refresh Signals'}
      </button>
    </div>
  )
}

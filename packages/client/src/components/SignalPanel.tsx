import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Signal } from '@mycelium/shared'

export function SignalPanel() {
  const queryClient = useQueryClient()
  const [showPendingOnly, setShowPendingOnly] = useState(true)
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null)

  // Fetch signals
  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ['signals', showPendingOnly],
    queryFn: async () => {
      const endpoint = showPendingOnly ? '/api/signals/pending' : '/api/signals'
      const res = await fetch(endpoint)
      return res.json()
    },
    refetchInterval: 10000, // Poll every 10 seconds as fallback
  })

  // Subscribe to SSE events for real-time updates
  useEffect(() => {
    const eventSource = new EventSource('/api/events?topics=signal:*')

    const handleEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] })
    }

    eventSource.addEventListener('signal:created', handleEvent)
    eventSource.addEventListener('signal:responded', handleEvent)
    eventSource.addEventListener('signal:expired', handleEvent)

    eventSource.onerror = () => {
      // SSE connection failed, will rely on polling
      console.warn('SSE connection failed, falling back to polling')
    }

    return () => eventSource.close()
  }, [queryClient])

  // Respond to signal mutation
  const respondMutation = useMutation({
    mutationFn: async ({ signalId, response }: { signalId: string; response: string }) => {
      const res = await fetch(`/api/signals/${signalId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to respond')
      }
      return res.json()
    },
    onSuccess: () => {
      setSelectedSignal(null)
      queryClient.invalidateQueries({ queryKey: ['signals'] })
    },
  })

  const pendingCount = signals.filter((s) => s.status === 'pending').length

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground">
          Signals
          {pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full border border-yellow-500/50">
              {pendingCount} pending
            </span>
          )}
        </h2>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showPendingOnly}
            onChange={(e) => setShowPendingOnly(e.target.checked)}
            className="accent-primary"
          />
          Pending only
        </label>
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">Loading...</div>
        ) : signals.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {showPendingOnly ? 'No pending signals' : 'No signals found'}
          </div>
        ) : (
          signals.map((signal) => (
            <SignalItem
              key={signal.id}
              signal={signal}
              onRespond={() => setSelectedSignal(signal)}
            />
          ))
        )}
      </div>

      {/* Response modal */}
      {selectedSignal && (
        <SignalResponseModal
          signal={selectedSignal}
          isLoading={respondMutation.isPending}
          error={respondMutation.error?.message}
          onClose={() => {
            setSelectedSignal(null)
            respondMutation.reset()
          }}
          onRespond={(response) =>
            respondMutation.mutate({ signalId: selectedSignal.id, response })
          }
        />
      )}
    </div>
  )
}

function SignalItem({
  signal,
  onRespond,
}: {
  signal: Signal
  onRespond: () => void
}) {
  const statusColors = {
    pending: 'border-l-yellow-500',
    responded: 'border-l-green-500',
    expired: 'border-l-gray-500',
  }

  const statusBadgeColors = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    responded: 'bg-green-500/20 text-green-400',
    expired: 'bg-gray-500/20 text-gray-400',
  }

  const options = signal.options ?? []

  return (
    <div
      className={`p-4 border-b border-border border-l-4 ${statusColors[signal.status]} hover:bg-muted/50 transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-foreground">{signal.question}</div>
        <span
          className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${statusBadgeColors[signal.status]}`}
        >
          {signal.status}
        </span>
      </div>

      {signal.status === 'pending' && options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={onRespond}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {signal.status === 'pending' && options.length === 0 && (
        <button
          onClick={onRespond}
          className="mt-3 px-3 py-1.5 text-sm border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
        >
          Respond
        </button>
      )}

      {signal.status === 'responded' && signal.response && (
        <div className="mt-2 text-sm text-muted-foreground">
          <span className="text-foreground/70">Response:</span> {signal.response}
        </div>
      )}

      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
        <span>{formatRelativeTime(signal.created_at)}</span>
        {signal.repo_path && (
          <>
            <span className="text-muted-foreground/50">|</span>
            <span>{signal.repo_path.split('/').pop()}</span>
          </>
        )}
        {signal.task_id && (
          <>
            <span className="text-muted-foreground/50">|</span>
            <span className="font-mono">{signal.task_id.slice(0, 8)}</span>
          </>
        )}
      </div>
    </div>
  )
}

function SignalResponseModal({
  signal,
  isLoading,
  error,
  onClose,
  onRespond,
}: {
  signal: Signal
  isLoading: boolean
  error?: string
  onClose: () => void
  onRespond: (response: string) => void
}) {
  const [customResponse, setCustomResponse] = useState('')
  const options = signal.options ?? []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customResponse.trim()) {
      onRespond(customResponse.trim())
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border p-6 rounded-lg max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-lg mb-4 text-foreground">Respond to Signal</h3>
        <p className="mb-4 text-foreground/90">{signal.question}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        {options.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => onRespond(opt)}
                disabled={isLoading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-4">
          <input
            type="text"
            placeholder="Custom response..."
            value={customResponse}
            onChange={(e) => setCustomResponse(e.target.value)}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-border rounded bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
        </form>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!customResponse.trim() || isLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`

  return date.toLocaleDateString()
}

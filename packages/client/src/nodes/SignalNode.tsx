import { memo } from 'react'

// Signal status types matching the backend
type SignalStatus = 'pending' | 'responded' | 'expired'

interface SignalNodeData {
  id: string
  question: string
  status: SignalStatus
  options?: string[]
  response?: string
  created_at: string
  responded_at?: string
  [key: string]: unknown
}

interface SignalNodeProps {
  data: SignalNodeData
  selected?: boolean
}

function SignalNode({ data, selected }: SignalNodeProps) {
  const statusColors: Record<SignalStatus, string> = {
    pending: 'border-yellow-500 bg-yellow-900/30',
    responded: 'border-green-500 bg-green-900/30',
    expired: 'border-gray-500 bg-gray-800/30',
  }

  const statusIcons: Record<SignalStatus, string> = {
    pending: '?',
    responded: '!',
    expired: '~',
  }

  const statusLabels: Record<SignalStatus, string> = {
    pending: 'Awaiting Response',
    responded: 'Responded',
    expired: 'Expired',
  }

  // Truncate question for display
  const truncatedQuestion = data.question.length > 60
    ? data.question.slice(0, 57) + '...'
    : data.question

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg transition-all ${statusColors[data.status]} ${selected ? 'ring-2 ring-primary' : ''}`}
      style={{ minWidth: 200, maxWidth: 280 }}
    >
      {/* No handles - signals are standalone visual elements */}

      {/* Header: status icon and label */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-sm font-bold ${data.status === 'pending' ? 'text-yellow-400' : data.status === 'responded' ? 'text-green-400' : 'text-gray-400'}`}>
          {statusIcons[data.status]}
        </span>
        <span className="text-xs text-muted-foreground">
          {statusLabels[data.status]}
        </span>
      </div>

      {/* Question */}
      <p className="text-sm text-foreground" title={data.question}>
        {truncatedQuestion}
      </p>

      {/* Options (if pending and has options) */}
      {data.status === 'pending' && data.options && data.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.options.map((option: string, idx: number) => (
            <span
              key={idx}
              className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
            >
              {option}
            </span>
          ))}
        </div>
      )}

      {/* Response (if responded) */}
      {data.status === 'responded' && data.response && (
        <div className="mt-2 p-2 rounded bg-green-500/10 border border-green-500/30">
          <span className="text-xs text-green-300">{data.response}</span>
        </div>
      )}

      {/* Timestamp */}
      <div className="mt-2 text-xs text-muted-foreground">
        {data.status === 'responded' && data.responded_at
          ? `Responded: ${formatRelativeTime(data.responded_at)}`
          : `Created: ${formatRelativeTime(data.created_at)}`}
      </div>
    </div>
  )
}

// Helper to format relative time
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export default memo(SignalNode)

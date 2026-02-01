import { useEffect, useRef, useState } from 'react'
import { useWorkflowStore } from '../stores/workflow'
import { cn } from '../lib/utils'

interface LogEntry {
  timestamp: string
  taskId: string
  taskTitle: string
  content: string
  type: 'stdout' | 'stderr' | 'info'
}

export function LiveLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isExpanded, setIsExpanded] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const connected = useWorkflowStore((s) => s.connected)

  // Subscribe to task:output events
  useEffect(() => {
    const eventSource = new EventSource('/api/events?topics=task:output')

    eventSource.addEventListener('task:output', (e) => {
      const data = JSON.parse(e.data)
      setLogs((prev) => [
        ...prev.slice(-500), // Keep last 500 entries
        {
          timestamp: new Date().toISOString(),
          taskId: data.task_id,
          taskTitle: data.title || data.task_id.slice(0, 8),
          content: data.output,
          type: data.stream || 'stdout',
        },
      ])
    })

    return () => eventSource.close()
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const filteredLogs = filter
    ? logs.filter(
        (l) =>
          l.content.toLowerCase().includes(filter.toLowerCase()) ||
          l.taskTitle.toLowerCase().includes(filter.toLowerCase())
      )
    : logs

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 bg-background border-t border-border',
        isExpanded ? 'h-64' : 'h-10'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm font-medium flex items-center gap-2"
        >
          Live Logs
          {connected && (
            <span className="w-2 h-2 rounded-full bg-green-500" />
          )}
        </button>

        {isExpanded && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-2 py-1 text-sm border border-border rounded bg-muted"
            />
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              Auto-scroll
            </label>
            <button
              onClick={() => setLogs([])}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Log content */}
      {isExpanded && (
        <div
          ref={containerRef}
          className="h-[calc(100%-2.5rem)] overflow-auto font-mono text-xs p-2"
        >
          {filteredLogs.map((log, i) => (
            <div
              key={i}
              className={cn(
                'py-0.5',
                log.type === 'stderr' && 'text-red-500'
              )}
            >
              <span className="text-muted-foreground">
                [{log.timestamp.slice(11, 19)}]
              </span>{' '}
              <span className="text-blue-500">[{log.taskTitle}]</span>{' '}
              {log.content}
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="text-muted-foreground">
              No logs yet. Waiting for task output...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

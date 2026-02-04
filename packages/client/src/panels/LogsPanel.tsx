/**
 * LogsPanel - Live log viewer for task output
 */

import { useEffect, useState, useRef } from 'react'

// Log entry type for LiveLogViewer
interface LogEntry {
  chunk: string
  timestamp: string
  stream: 'stdout' | 'stderr'
}

export function LiveLogViewer({
  taskId,
  taskTitle,
  logs,
  loading,
  onFetchLogs,
  onClearLogs,
}: {
  taskId: string
  taskTitle?: string
  logs: LogEntry[]
  loading: boolean
  onFetchLogs: (taskId: string) => Promise<void>
  onClearLogs: (taskId: string) => void
}) {
  const [autoScroll, setAutoScroll] = useState(true)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Fetch logs on mount
  useEffect(() => {
    if (taskId) {
      onFetchLogs(taskId)
    }
  }, [taskId, onFetchLogs])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!logContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  // Format output: remove ANSI codes and optionally prettify JSON
  const formatOutput = (text: string) => {
    // Remove most ANSI codes but preserve newlines
    let cleaned = text
      .replace(/\x1b\[[0-9;]*m/g, '') // Remove color codes
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Remove other ANSI sequences

    // Try to detect and prettify JSON lines (for Cline/Cursor)
    const lines = cleaned.split('\n')
    const formatted = lines.map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed)
          // Extract key info from JSON for readability
          if (parsed.type) {
            // Cline format: {"type":"...", "content":"..."}
            const content = parsed.content || parsed.tool || parsed.path || ''
            return `[${parsed.type}] ${content}`
          }
          if (parsed.event) {
            // Cursor format: {"event":"...", ...}
            const detail = parsed.message || parsed.file || (parsed.files_modified ? `${parsed.files_modified} files` : '')
            return `[${parsed.event}] ${detail}`
          }
          // Generic JSON - show compact version
          return JSON.stringify(parsed)
        } catch {
          // Not valid JSON, return as-is
          return line
        }
      }
      return line
    })

    return formatted.join('\n')
  }

  const handleDownload = () => {
    const content = logs.map((e) => e.chunk).join('')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `task-${taskId.slice(0, 8)}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    onClearLogs(taskId)
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Header info */}
      <div className="bg-zinc-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500">Task ID</span>
          <span className="text-xs text-zinc-300 font-mono">{taskId.slice(0, 8)}...</span>
        </div>
        {taskTitle && (
          <div className="text-sm text-zinc-200 truncate">{taskTitle}</div>
        )}
        <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
          <span>{logs.length} entries</span>
          <span>-</span>
          <span>{(logs.reduce((acc, e) => acc + e.chunk.length, 0) / 1024).toFixed(1)} KB</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            autoScroll
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-700 text-zinc-400'
          }`}
        >
          {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
        </button>
        <button
          onClick={handleDownload}
          disabled={logs.length === 0}
          className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
        >
          Download
        </button>
        <button
          onClick={handleClear}
          disabled={logs.length === 0}
          className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          onClick={() => onFetchLogs(taskId)}
          disabled={loading}
          className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Log output */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className="flex-1 bg-zinc-950 rounded-lg p-3 overflow-y-auto font-mono text-xs min-h-64"
      >
        {loading && logs.length === 0 ? (
          <div className="text-zinc-500 text-center py-8">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-zinc-500 text-center py-8">
            No output yet. Logs will appear here as the task runs.
          </div>
        ) : (
          <pre className="text-zinc-300 whitespace-pre-wrap break-words">
            {logs.map((entry, idx) => (
              <span
                key={idx}
                className={entry.stream === 'stderr' ? 'text-red-400' : ''}
              >
                {formatOutput(entry.chunk)}
              </span>
            ))}
          </pre>
        )}
      </div>

      {/* Live indicator */}
      {logs.length > 0 && !logs[logs.length - 1]?.chunk?.includes('exit') && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Streaming live output...</span>
        </div>
      )}
    </div>
  )
}

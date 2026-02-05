/**
 * TaskPoolPanel - Task list, details, and dependency graph
 */

import { useEffect, useState } from 'react'
import { TaskCreateForm } from './task/TaskCreateForm'

// Task type for TaskPoolPanel
interface TaskData {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  agent?: string
  model?: string
  provider?: 'openrouter' | 'cline'
  repo_path: string
  prompt?: string
  depends_on: string[]
  sequenced: boolean
  timeout_seconds?: number
  result?: string
  parsed_result?: {
    summary?: string
    files_modified?: string[]
    files_created?: string[]
    tests_passed?: boolean
    commit_hash?: string
  }
  error?: string
  error_details?: {
    error_type: string
    stderr?: string
    exit_code?: number
  }
  cost_usd: number
  duration_seconds?: number
  created_at: string
  started_at?: string
  completed_at?: string
}

interface TaskFiltersData {
  status?: string
  repo_path?: string
  agent?: string
  limit?: number
  offset?: number
}

interface TaskGraphNodeData {
  id: string
  title: string
  status: string
  repo_path: string
  agent?: string
  sequenced: boolean
  depends_on: string[]
  created_at: string
}

interface TaskGraphEdgeData {
  source: string
  target: string
}

export function TaskPoolPanel({
  stats,
  tasks,
  tasksTotal,
  tasksLoading,
  taskFilters,
  selectedTask,
  selectedTaskLoading: _selectedTaskLoading,
  taskGraph,
  taskGraphLoading,
  onFetchTasks,
  onSetFilters: _onSetFilters,
  onFetchTask,
  onRunTask,
  onCancelTask,
  onDeleteTask,
  onCloneTask,
  onRetryTask,
  onFetchGraph,
  onClearSelected,
  onViewLogs,
}: {
  stats: { pending: number; running: number; done: number; failed: number; cancelled: number; total: number } | null
  tasks: TaskData[]
  tasksTotal: number
  tasksLoading: boolean
  taskFilters: TaskFiltersData
  selectedTask: TaskData | null
  selectedTaskLoading: boolean
  taskGraph: { nodes: TaskGraphNodeData[], edges: TaskGraphEdgeData[] } | null
  taskGraphLoading: boolean
  onFetchTasks: (filters?: TaskFiltersData) => Promise<void>
  onSetFilters: (filters: TaskFiltersData) => void
  onFetchTask: (id: string) => Promise<void>
  onRunTask: (id: string, options?: { agent?: string; model?: string }) => Promise<void>
  onCancelTask: (id: string) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  onCloneTask: (id: string) => Promise<void>
  onRetryTask: (id: string) => Promise<void>
  onFetchGraph: (filters?: { repo_path?: string; status?: string }) => Promise<void>
  onClearSelected: () => void
  onViewLogs?: (taskId: string, taskTitle: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'list' | 'graph'>('list')
  const [detailTab, setDetailTab] = useState<'info' | 'context' | 'sessions'>('info')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // Context and sessions state
  const [taskContext, setTaskContext] = useState<Record<string, unknown> | null>(null)
  const [taskContextLoading, setTaskContextLoading] = useState(false)
  const [taskSessions, setTaskSessions] = useState<Array<{
    id: string
    agent?: string
    model?: string
    created_at: string
    context_trace?: { layers?: Array<{ name: string; size: number }>; total_size?: number }
    session_log?: Array<{ chunk: string; stream: string; timestamp: string }>
  }> | null>(null)
  const [taskSessionsLoading, setTaskSessionsLoading] = useState(false)

  // Fetch context when switching to context tab
  const fetchTaskContext = async (taskId: string) => {
    setTaskContextLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/context`)
      const data = await res.json()
      setTaskContext(data)
    } catch (error) {
      console.error('Failed to fetch context:', error)
    } finally {
      setTaskContextLoading(false)
    }
  }

  // Fetch sessions when switching to sessions tab
  const fetchTaskSessions = async (taskId: string) => {
    setTaskSessionsLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/sessions`)
      const data = await res.json()
      setTaskSessions(data.fruiting_sessions || [])
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setTaskSessionsLoading(false)
    }
  }

  // Reset detail state when task changes
  useEffect(() => {
    setDetailTab('info')
    setTaskContext(null)
    setTaskSessions(null)
  }, [selectedTask?.id])

  // Fetch tasks on mount and when filters change
  useEffect(() => {
    onFetchTasks({ ...taskFilters, status: statusFilter || undefined })
  }, [statusFilter])

  // Fetch graph when switching to graph tab
  useEffect(() => {
    if (activeTab === 'graph' && !taskGraph) {
      onFetchGraph()
    }
  }, [activeTab])

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A'
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(2)}`
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-400'
      case 'running': return 'bg-blue-500/20 text-blue-400'
      case 'done': return 'bg-green-500/20 text-green-400'
      case 'failed': return 'bg-red-500/20 text-red-400'
      case 'cancelled': return 'bg-zinc-500/20 text-zinc-400'
      default: return 'bg-zinc-700 text-zinc-400'
    }
  }

  const handleAction = async (action: string, taskId: string, fn: () => Promise<void>) => {
    setActionLoading(`${action}-${taskId}`)
    try {
      await fn()
    } catch (error) {
      console.error(`Failed to ${action} task:`, error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteConfirm = async (taskId: string) => {
    if (!confirm('Delete this task? This cannot be undone.')) return
    await handleAction('delete', taskId, () => onDeleteTask(taskId))
  }

  // Selected task detail view
  if (selectedTask) {
    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={onClearSelected}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to list
        </button>

        {/* Task header */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="text-sm font-medium text-zinc-100 flex-1">{selectedTask.title}</h3>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded capitalize ${statusColor(selectedTask.status)}`}>
              {selectedTask.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Agent:</span>{' '}
              <span className="text-zinc-300 capitalize">{selectedTask.agent || 'unassigned'}</span>
            </div>
            <div>
              <span className="text-zinc-500">Model:</span>{' '}
              <span className="text-zinc-300">{selectedTask.model || 'default'}</span>
            </div>
            {selectedTask.provider && (
              <div>
                <span className="text-zinc-500">Provider:</span>{' '}
                <span className="text-zinc-300 capitalize">{selectedTask.provider}</span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Cost:</span>{' '}
              <span className="text-zinc-300">{formatCost(selectedTask.cost_usd)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Duration:</span>{' '}
              <span className="text-zinc-300">{formatDuration(selectedTask.duration_seconds)}</span>
            </div>
            <div className="col-span-2">
              <span className="text-zinc-500">Repo:</span>{' '}
              <span className="text-zinc-300 font-mono text-xs">{selectedTask.repo_path}</span>
            </div>
            <div className="col-span-2">
              <span className="text-zinc-500">Created:</span>{' '}
              <span className="text-zinc-300">{formatTimeAgo(selectedTask.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Detail Tabs */}
        <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
          <button
            onClick={() => setDetailTab('info')}
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              detailTab === 'info'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Info
          </button>
          <button
            onClick={() => {
              setDetailTab('context')
              if (!taskContext) fetchTaskContext(selectedTask.id)
            }}
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              detailTab === 'context'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Context
          </button>
          <button
            onClick={() => {
              setDetailTab('sessions')
              if (!taskSessions) fetchTaskSessions(selectedTask.id)
            }}
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              detailTab === 'sessions'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sessions
          </button>
        </div>

        {/* Info Tab Content */}
        {detailTab === 'info' && (
          <>
            {/* Dependencies */}
            {selectedTask.depends_on.length > 0 && (
              <div className="bg-zinc-800 rounded-lg p-3">
                <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Dependencies ({selectedTask.depends_on.length})</h4>
                <div className="space-y-1">
                  {selectedTask.depends_on.map((depId) => (
                    <div key={depId} className="text-xs text-zinc-400 font-mono">
                      {depId.slice(0, 8)}...
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prompt */}
            {selectedTask.prompt && (
              <div className="bg-zinc-800 rounded-lg p-3">
                <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Prompt</h4>
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {selectedTask.prompt}
                </pre>
              </div>
            )}

            {/* Result or Error */}
            {selectedTask.status === 'done' && selectedTask.result && (
              <div className="bg-zinc-800 rounded-lg p-3">
                <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Result</h4>
                {selectedTask.parsed_result?.summary && (
                  <p className="text-sm text-zinc-200 mb-2">{selectedTask.parsed_result.summary}</p>
                )}
                {selectedTask.parsed_result?.files_modified && selectedTask.parsed_result.files_modified.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-zinc-500">Files modified: </span>
                    <span className="text-xs text-zinc-300">{selectedTask.parsed_result.files_modified.length}</span>
                  </div>
                )}
                <details className="text-xs">
                  <summary className="text-zinc-400 cursor-pointer hover:text-zinc-200">Show full output</summary>
                  <pre className="mt-2 text-zinc-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {selectedTask.result}
                  </pre>
                </details>
              </div>
            )}

            {selectedTask.status === 'failed' && selectedTask.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <h4 className="text-xs font-medium text-red-400 uppercase mb-2">Error</h4>
                <pre className="text-xs text-red-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {selectedTask.error}
                </pre>
                {selectedTask.error_details?.exit_code !== undefined && (
                  <div className="mt-2 text-xs text-red-400">
                    Exit code: {selectedTask.error_details.exit_code}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Context Tab Content */}
        {detailTab === 'context' && (
          <div className="bg-zinc-800 rounded-lg p-3">
            {taskContextLoading ? (
              <div className="text-center py-4 text-zinc-500">Loading context...</div>
            ) : taskContext ? (
              <div className="space-y-3 text-xs">
                <h4 className="text-zinc-500 uppercase mb-2">Assembled Context</h4>
                <p className="text-zinc-400 mb-2">
                  Context includes: task info, repo metadata, memory patterns, warnings, dependencies, and related tasks.
                </p>
                <pre className="text-zinc-300 whitespace-pre-wrap max-h-96 overflow-y-auto bg-zinc-900 p-2 rounded text-xs">
                  {JSON.stringify(taskContext, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-4 text-zinc-500">No context available</div>
            )}
          </div>
        )}

        {/* Sessions Tab Content */}
        {detailTab === 'sessions' && (
          <div className="space-y-3">
            {taskSessionsLoading ? (
              <div className="text-center py-4 text-zinc-500">Loading sessions...</div>
            ) : taskSessions && taskSessions.length > 0 ? (
              taskSessions.map((session) => (
                <div key={session.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs">
                      <span className="text-zinc-300 capitalize">{session.agent}</span>
                      {session.model && <span className="text-zinc-500">/{session.model}</span>}
                    </div>
                    <span className="text-xs text-zinc-500">{formatTimeAgo(session.created_at)}</span>
                  </div>

                  {/* Context Trace */}
                  {session.context_trace && (
                    <div className="mb-2">
                      <h4 className="text-xs text-zinc-500 mb-1">Context Layers</h4>
                      <div className="flex flex-wrap gap-1">
                        {session.context_trace.layers?.map((layer, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300">
                            {layer.name}: {(layer.size / 1024).toFixed(1)}KB
                          </span>
                        ))}
                      </div>
                      {session.context_trace.total_size && (
                        <div className="text-xs text-zinc-500 mt-1">
                          Total: {(session.context_trace.total_size / 1024).toFixed(1)}KB
                        </div>
                      )}
                    </div>
                  )}

                  {/* Session Log Preview */}
                  {session.session_log && session.session_log.length > 0 && (
                    <details className="text-xs">
                      <summary className="text-zinc-400 cursor-pointer hover:text-zinc-200">
                        Output ({session.session_log.length} chunks)
                      </summary>
                      <pre className="mt-2 text-zinc-400 whitespace-pre-wrap max-h-40 overflow-y-auto bg-zinc-900 p-2 rounded">
                        {session.session_log.slice(-10).map((log) => log.chunk).join('')}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-zinc-500">No sessions recorded</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {selectedTask.status === 'pending' && (
            <button
              onClick={() => handleAction('run', selectedTask.id, () => onRunTask(selectedTask.id))}
              disabled={actionLoading !== null || !selectedTask.prompt || !selectedTask.agent}
              className="flex-1 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 disabled:opacity-50"
            >
              {actionLoading === `run-${selectedTask.id}` ? 'Starting...' : 'Run Task'}
            </button>
          )}
          {selectedTask.status === 'running' && (
            <>
              <button
                onClick={() => handleAction('cancel', selectedTask.id, () => onCancelTask(selectedTask.id))}
                disabled={actionLoading !== null}
                className="flex-1 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 disabled:opacity-50"
              >
                {actionLoading === `cancel-${selectedTask.id}` ? 'Cancelling...' : 'Cancel'}
              </button>
              {onViewLogs && (
                <button
                  onClick={() => onViewLogs(selectedTask.id, selectedTask.title)}
                  className="flex-1 px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm hover:bg-zinc-600"
                >
                  View Logs
                </button>
              )}
            </>
          )}
          {(selectedTask.status === 'done' || selectedTask.status === 'failed' || selectedTask.status === 'cancelled') && (
            <>
              <button
                onClick={() => handleAction('clone', selectedTask.id, () => onCloneTask(selectedTask.id))}
                disabled={actionLoading !== null}
                className="flex-1 px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-50"
              >
                Clone
              </button>
              {selectedTask.status === 'failed' && (
                <button
                  onClick={() => handleAction('retry', selectedTask.id, () => onRetryTask(selectedTask.id))}
                  disabled={actionLoading !== null}
                  className="flex-1 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 disabled:opacity-50"
                >
                  {actionLoading === `retry-${selectedTask.id}` ? 'Retrying...' : 'Retry'}
                </button>
              )}
              <button
                onClick={() => handleDeleteConfirm(selectedTask.id)}
                disabled={actionLoading !== null}
                className="px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Show create form
  if (showCreate) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">New Task</h3>
        </div>
        <TaskCreateForm onClose={() => setShowCreate(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Create button */}
      <button
        onClick={() => setShowCreate(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm py-1.5 rounded transition-colors border border-zinc-700"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Task
      </button>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Pending', value: stats?.pending || 0, color: 'text-yellow-400', filter: 'pending' },
          { label: 'Running', value: stats?.running || 0, color: 'text-blue-400', filter: 'running' },
          { label: 'Done', value: stats?.done || 0, color: 'text-green-400', filter: 'done' },
          { label: 'Failed', value: stats?.failed || 0, color: 'text-red-400', filter: 'failed' },
        ].map(({ label, value, color, filter }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(statusFilter === filter ? '' : filter)}
            className={`bg-zinc-800 rounded-lg p-2 text-center transition-colors ${
              statusFilter === filter ? 'ring-1 ring-zinc-500' : ''
            }`}
          >
            <div className="text-xs text-zinc-500">{label}</div>
            <div className={`text-lg font-semibold ${color}`}>{value}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
            activeTab === 'list'
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          List ({tasksTotal})
        </button>
        <button
          onClick={() => setActiveTab('graph')}
          className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
            activeTab === 'graph'
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Dependencies
        </button>
      </div>

      {/* Active filter indicator */}
      {statusFilter && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Filtering by:</span>
          <span className={`px-2 py-0.5 rounded capitalize ${statusColor(statusFilter)}`}>
            {statusFilter}
          </span>
          <button
            onClick={() => setStatusFilter('')}
            className="text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* List view */}
      {activeTab === 'list' && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {tasksLoading && tasks.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              {statusFilter ? `No ${statusFilter} tasks` : 'No tasks yet'}
            </div>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onFetchTask(task.id)}
                className="w-full bg-zinc-800 rounded-lg p-3 text-left hover:bg-zinc-750 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{task.title}</div>
                    <div className="text-xs text-zinc-500 truncate mt-0.5">
                      {task.repo_path.split('/').pop()}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded capitalize ${statusColor(task.status)}`}>
                    {task.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  {task.agent && (
                    <span className="capitalize">
                      {task.agent}
                      {task.provider && <span className="text-zinc-600">/{task.provider}</span>}
                    </span>
                  )}
                  <span>{formatTimeAgo(task.created_at)}</span>
                  {task.cost_usd > 0 && <span>{formatCost(task.cost_usd)}</span>}
                  {task.duration_seconds && <span>{formatDuration(task.duration_seconds)}</span>}
                  {task.depends_on.length > 0 && (
                    <span className="text-amber-500">{task.depends_on.length} deps</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Graph view (simplified dependency list) */}
      {activeTab === 'graph' && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {taskGraphLoading ? (
            <div className="text-center py-8 text-zinc-500">Loading dependencies...</div>
          ) : !taskGraph || taskGraph.nodes.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">No dependency data</div>
          ) : (
            <>
              <div className="text-xs text-zinc-500 mb-2">
                {taskGraph.nodes.length} tasks, {taskGraph.edges.length} dependencies
              </div>
              {taskGraph.nodes
                .filter((n) => n.depends_on.length > 0 || taskGraph.edges.some((e) => e.source === n.id))
                .slice(0, 30)
                .map((node) => {
                  const dependents = taskGraph.edges.filter((e) => e.source === node.id)
                  const dependencies = taskGraph.edges.filter((e) => e.target === node.id)
                  return (
                    <div key={node.id} className="bg-zinc-800 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{node.title}</div>
                          <div className="text-xs text-zinc-500 font-mono">{node.id.slice(0, 8)}</div>
                        </div>
                        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded capitalize ${statusColor(node.status)}`}>
                          {node.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {dependencies.length > 0 && (
                          <span className="text-amber-400">
                            Needs {dependencies.length} task{dependencies.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {dependents.length > 0 && (
                          <span className="text-blue-400">
                            Blocks {dependents.length} task{dependents.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {!node.sequenced && (
                          <span className="text-zinc-500">Not sequenced</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              {taskGraph.nodes.filter((n) => n.depends_on.length > 0 || taskGraph.edges.some((e) => e.source === n.id)).length > 30 && (
                <div className="text-center text-xs text-zinc-500 py-2">
                  Showing 30 of {taskGraph.nodes.filter((n) => n.depends_on.length > 0 || taskGraph.edges.some((e) => e.source === n.id)).length} tasks with dependencies
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Refresh button */}
      <button
        onClick={() => activeTab === 'list' ? onFetchTasks({ ...taskFilters, status: statusFilter || undefined }) : onFetchGraph()}
        disabled={tasksLoading || taskGraphLoading}
        className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm disabled:opacity-50"
      >
        {tasksLoading || taskGraphLoading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  )
}

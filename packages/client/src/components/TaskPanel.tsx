import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '../stores/workflow'
import type { Task, TaskStatus, TaskCreateRequest, Repo } from '@mycelium/shared'

export function TaskPanel() {
  const queryClient = useQueryClient()
  const {
    selectedTaskId,
    taskFilter,
    selectTask,
    setTaskFilter,
    setTasks,
  } = useWorkflowStore()
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', taskFilter],
    queryFn: async (): Promise<Task[]> => {
      const params = taskFilter !== 'all' ? `?status=${taskFilter}` : ''
      const res = await fetch(`/api/tasks${params}`)
      const response = await res.json() as { tasks: Task[] }
      return response.tasks
    },
    refetchInterval: 10000, // Poll every 10 seconds as fallback
  })

  // Sync tasks to store
  useEffect(() => {
    setTasks(tasks)
  }, [tasks, setTasks])

  // Subscribe to SSE events for real-time updates
  useEffect(() => {
    const eventSource = new EventSource('/api/events?topics=task:*')

    const handleEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    }

    eventSource.addEventListener('task:created', handleEvent)
    eventSource.addEventListener('task:updated', handleEvent)
    eventSource.addEventListener('task:started', handleEvent)
    eventSource.addEventListener('task:completed', handleEvent)
    eventSource.addEventListener('task:failed', handleEvent)
    eventSource.addEventListener('task:cancelled', handleEvent)
    eventSource.addEventListener('task:deleted', handleEvent)

    eventSource.onerror = () => {
      console.warn('SSE connection failed, falling back to polling')
    }

    return () => eventSource.close()
  }, [queryClient])

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)

  const statusCounts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    running: tasks.filter((t) => t.status === 'running').length,
    done: tasks.filter((t) => t.status === 'done').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  }

  return (
    <div className="flex h-full bg-background">
      {/* Task list sidebar */}
      <div className="w-80 border-r border-border flex flex-col">
        {/* Filters and create button */}
        <div className="p-4 border-b border-border">
          <div className="flex flex-wrap gap-2 mb-4">
            {(['all', 'pending', 'running', 'done', 'failed'] as const).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setTaskFilter(status)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    taskFilter === status
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {status}
                  {status !== 'all' && ` (${statusCounts[status]})`}
                </button>
              )
            )}
          </div>

          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            + Create Task
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {taskFilter === 'all' ? 'No tasks found' : `No ${taskFilter} tasks`}
            </div>
          ) : (
            tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                selected={selectedTaskId === task.id}
                onClick={() => selectTask(task.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Task detail */}
      <div className="flex-1 overflow-auto">
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onUpdate={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Select a task to view details
          </div>
        )}
      </div>

      {/* Create form modal */}
      {showCreateForm && (
        <TaskCreateForm
          onClose={() => setShowCreateForm(false)}
          onCreate={() => {
            setShowCreateForm(false)
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
          }}
        />
      )}
    </div>
  )
}

function TaskListItem({
  task,
  selected,
  onClick,
}: {
  task: Task
  selected: boolean
  onClick: () => void
}) {
  const statusColors: Record<TaskStatus, string> = {
    pending: 'bg-gray-500',
    running: 'bg-blue-500 animate-pulse',
    done: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-yellow-500',
  }

  return (
    <div
      onClick={onClick}
      className={`p-3 border-b border-border cursor-pointer transition-colors ${
        selected ? 'bg-muted' : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusColors[task.status]}`} />
        <span className="font-medium text-sm text-foreground truncate">{task.title}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
        {task.agent && <span className="capitalize">{task.agent}</span>}
        {task.agent && task.repo_path && <span className="text-muted-foreground/50">|</span>}
        {task.repo_path && <span>{task.repo_path.split('/').pop()}</span>}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {formatRelativeTime(task.created_at)}
      </div>
    </div>
  )
}

function TaskDetail({
  task,
  onUpdate,
}: {
  task: Task
  onUpdate: () => void
}) {
  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to run task')
      }
      return res.json()
    },
    onSuccess: onUpdate,
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/${task.id}/cancel`, {
        method: 'POST',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to cancel task')
      }
      return res.json()
    },
    onSuccess: onUpdate,
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete task')
      }
      return res.json()
    },
    onSuccess: () => {
      useWorkflowStore.getState().selectTask(null)
      onUpdate()
    },
  })

  const isLoading = runMutation.isPending || cancelMutation.isPending || deleteMutation.isPending
  const error = runMutation.error?.message || cancelMutation.error?.message || deleteMutation.error?.message

  const statusColors: Record<TaskStatus, string> = {
    pending: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    running: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    done: 'bg-green-500/20 text-green-400 border-green-500/50',
    failed: 'bg-red-500/20 text-red-400 border-red-500/50',
    cancelled: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{task.title}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-xs px-2 py-1 rounded border ${statusColors[task.status]}`}
            >
              {task.status}
            </span>
            {task.agent && (
              <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground capitalize">
                {task.agent}
              </span>
            )}
            {task.model && (
              <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                {task.model}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {task.status === 'pending' && (
            <button
              onClick={() => runMutation.mutate()}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
            >
              {runMutation.isPending ? 'Running...' : 'Run'}
            </button>
          )}
          {task.status === 'running' && (
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={isLoading}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors text-sm"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </button>
          )}
          {(task.status === 'pending' || task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this task?')) {
                  deleteMutation.mutate()
                }
              }}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <MetadataItem label="ID" value={task.id.slice(0, 8)} mono />
        <MetadataItem label="Created" value={formatRelativeTime(task.created_at)} />
        {task.started_at && (
          <MetadataItem label="Started" value={formatRelativeTime(task.started_at)} />
        )}
        {task.completed_at && (
          <MetadataItem label="Completed" value={formatRelativeTime(task.completed_at)} />
        )}
        {task.duration_seconds && (
          <MetadataItem label="Duration" value={formatDuration(task.duration_seconds)} />
        )}
        {task.cost_usd > 0 && (
          <MetadataItem label="Cost" value={`$${task.cost_usd.toFixed(4)}`} />
        )}
        <MetadataItem label="Repository" value={task.repo_path.split('/').pop() ?? task.repo_path} />
        <MetadataItem label="Sequenced" value={task.sequenced ? 'Yes' : 'No'} />
      </div>

      {/* Dependencies */}
      {task.depends_on && task.depends_on.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Dependencies</h3>
          <div className="flex flex-wrap gap-2">
            {task.depends_on.map((depId) => (
              <span
                key={depId}
                className="text-xs font-mono px-2 py-1 bg-muted rounded"
              >
                {depId.slice(0, 8)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Prompt */}
      {task.prompt && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Prompt</h3>
          <pre className="p-4 bg-muted rounded text-sm text-foreground overflow-auto max-h-48 whitespace-pre-wrap">
            {task.prompt}
          </pre>
        </div>
      )}

      {/* Result */}
      {task.result && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Result</h3>
          <pre className="p-4 bg-muted rounded text-sm text-foreground overflow-auto max-h-96 whitespace-pre-wrap">
            {task.result}
          </pre>
        </div>
      )}

      {/* Error */}
      {task.error && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-red-400 mb-2">Error</h3>
          <pre className="p-4 bg-red-500/10 border border-red-500/50 rounded text-sm text-red-400 overflow-auto max-h-48 whitespace-pre-wrap">
            {task.error}
          </pre>
        </div>
      )}

      {/* Parsed result */}
      {task.parsed_result && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Parsed Result</h3>
          <div className="p-4 bg-muted rounded text-sm space-y-2">
            {task.parsed_result.summary && (
              <div>
                <span className="text-muted-foreground">Summary:</span>{' '}
                <span className="text-foreground">{task.parsed_result.summary}</span>
              </div>
            )}
            {task.parsed_result.files_modified.length > 0 && (
              <div>
                <span className="text-muted-foreground">Modified:</span>{' '}
                <span className="text-foreground font-mono text-xs">
                  {task.parsed_result.files_modified.join(', ')}
                </span>
              </div>
            )}
            {task.parsed_result.files_created.length > 0 && (
              <div>
                <span className="text-muted-foreground">Created:</span>{' '}
                <span className="text-foreground font-mono text-xs">
                  {task.parsed_result.files_created.join(', ')}
                </span>
              </div>
            )}
            {task.parsed_result.commit_hash && (
              <div>
                <span className="text-muted-foreground">Commit:</span>{' '}
                <span className="text-foreground font-mono">{task.parsed_result.commit_hash}</span>
              </div>
            )}
            {task.parsed_result.tests_passed !== undefined && (
              <div>
                <span className="text-muted-foreground">Tests:</span>{' '}
                <span className={task.parsed_result.tests_passed ? 'text-green-400' : 'text-red-400'}>
                  {task.parsed_result.tests_passed ? 'Passed' : 'Failed'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetadataItem({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

function TaskCreateForm({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: () => void
}) {
  const [title, setTitle] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [prompt, setPrompt] = useState('')
  const [agent, setAgent] = useState<string>('')
  const [model, setModel] = useState('')

  // Fetch repos for dropdown
  const { data: repos = [] } = useQuery<Repo[]>({
    queryKey: ['repos'],
    queryFn: async (): Promise<Repo[]> => {
      const res = await fetch('/api/repos')
      return res.json() as Promise<Repo[]>
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: TaskCreateRequest) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create task')
      }
      return res.json()
    },
    onSuccess: onCreate,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !repoPath) return

    createMutation.mutate({
      title: title.trim(),
      repo_path: repoPath,
      prompt: prompt.trim() || undefined,
      agent: agent ? (agent as 'claude' | 'codex' | 'gemini' | 'cline' | 'cursor') : undefined,
      model: model.trim() || undefined,
      depends_on: [],
      sequenced: false,
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border p-6 rounded-lg max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-lg mb-4 text-foreground">Create Task</h3>

        {createMutation.error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
            {createMutation.error.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              required
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Repository *</label>
            <select
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a repository...</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.path}>
                  {repo.name} ({repo.path})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Agent</label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Default (Claude)</option>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="gemini">Gemini</option>
              <option value="cline">Cline</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., sonnet, opus (optional)"
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Detailed task specification (optional)..."
              rows={4}
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !repoPath || createMutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
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

/**
 * Format seconds as duration (e.g., "5m 32s")
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (min < 60) return `${min}m ${sec}s`
  const hour = Math.floor(min / 60)
  const remainMin = min % 60
  return `${hour}h ${remainMin}m`
}

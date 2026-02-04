/**
 * AgentPanel - Running agents and agent configuration
 */

import { useEffect, useState } from 'react'

// Agent config type for panel
interface AgentConfigData {
  type: string
  command: string
  timeout_seconds: number
  max_turns: number
  supports_streaming: boolean
  enabled: boolean
  default_model?: string
  description?: string
}

export function AgentPanel({
  runningTasks,
  agentConfigs,
  loading,
  onFetchConfigs,
  onUpdateConfig,
  onViewLogs,
}: {
  runningTasks: Array<{
    task_id: string
    task_title: string
    agent: string
    model: string
    repo_path: string
    started_at: string
  }>
  agentConfigs: Record<string, AgentConfigData>
  loading: boolean
  onFetchConfigs: () => void
  onUpdateConfig: (name: string, updates: Partial<AgentConfigData>) => Promise<void>
  onViewLogs?: (taskId: string, taskTitle: string) => void
}) {
  const [showConfig, setShowConfig] = useState(false)
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [editedValues, setEditedValues] = useState<Partial<AgentConfigData>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Fetch configs on mount
  useEffect(() => {
    onFetchConfigs()
  }, [onFetchConfigs])

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt)
    const now = new Date()
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000)
    if (diff < 60) return `${diff}s`
    return `${Math.floor(diff / 60)}m ${diff % 60}s`
  }

  const formatTimeout = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    return `${Math.floor(seconds / 60)}m`
  }

  const handleEditAgent = (name: string) => {
    setEditingAgent(name)
    setEditedValues({})
    setSaveStatus('idle')
  }

  const handleSaveAgent = async (name: string) => {
    if (Object.keys(editedValues).length === 0) {
      setEditingAgent(null)
      return
    }
    setSaveStatus('saving')
    try {
      await onUpdateConfig(name, editedValues)
      setSaveStatus('saved')
      setTimeout(() => {
        setEditingAgent(null)
        setSaveStatus('idle')
        setEditedValues({})
      }, 1000)
    } catch {
      setSaveStatus('error')
    }
  }

  const getValue = <K extends keyof AgentConfigData>(name: string, key: K): AgentConfigData[K] => {
    if (editingAgent === name && key in editedValues) {
      return editedValues[key] as AgentConfigData[K]
    }
    return agentConfigs[name]?.[key] as AgentConfigData[K]
  }

  const agentList = Object.entries(agentConfigs)

  return (
    <div className="space-y-4">
      {/* Running tasks */}
      {runningTasks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Running Tasks</h3>
          <div className="space-y-2">
            {runningTasks.map((task) => (
              <div key={task.task_id} className="bg-zinc-800 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{task.task_title}</div>
                    <div className="text-xs text-zinc-500 truncate">{task.repo_path}</div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-2 mt-1" />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">
                    <span className="capitalize">{task.agent}</span> / {task.model}
                  </span>
                  <span className="text-zinc-500 tabular-nums">{formatDuration(task.started_at)}</span>
                </div>
                {onViewLogs && (
                  <button
                    onClick={() => onViewLogs(task.task_id, task.task_title)}
                    className="mt-2 w-full px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 transition-colors"
                  >
                    View Live Logs
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {runningTasks.length === 0 && (
        <div className="text-center py-4 text-zinc-500">
          No agents currently running
        </div>
      )}

      {/* Agent Configuration Section */}
      <div className="border-t border-zinc-700 pt-4">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center justify-between w-full text-sm font-medium text-zinc-400 hover:text-zinc-200"
        >
          <span>Agent Configuration</span>
          <svg
            className={`w-4 h-4 transition-transform ${showConfig ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showConfig && (
          <div className="mt-4 space-y-3">
            {loading && agentList.length === 0 ? (
              <div className="text-center py-4 text-zinc-500">Loading agents...</div>
            ) : (
              agentList.map(([name, config]) => (
                <div key={name} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200 capitalize">{name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        config.enabled
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-zinc-700 text-zinc-500'
                      }`}>
                        {config.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <button
                      onClick={() => editingAgent === name ? handleSaveAgent(name) : handleEditAgent(name)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {editingAgent === name ? (
                        saveStatus === 'saving' ? 'Saving...' :
                        saveStatus === 'saved' ? 'Saved!' :
                        saveStatus === 'error' ? 'Error' :
                        'Save'
                      ) : 'Edit'}
                    </button>
                  </div>

                  {config.description && (
                    <p className="text-xs text-zinc-500 mb-2">{config.description}</p>
                  )}

                  {editingAgent === name ? (
                    <div className="space-y-2 mt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Enabled</span>
                        <button
                          onClick={() => setEditedValues(prev => ({
                            ...prev,
                            enabled: !(getValue(name, 'enabled') as boolean)
                          }))}
                          className={`relative w-8 h-4 rounded-full transition-colors ${
                            getValue(name, 'enabled') ? 'bg-green-500' : 'bg-zinc-600'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                              getValue(name, 'enabled') ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Timeout</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={getValue(name, 'timeout_seconds') as number}
                            onChange={(e) => setEditedValues(prev => ({
                              ...prev,
                              timeout_seconds: parseInt(e.target.value) || 0
                            }))}
                            className="w-16 px-1 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 text-right"
                          />
                          <span className="text-xs text-zinc-500">sec</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Max Turns</span>
                        <input
                          type="number"
                          value={getValue(name, 'max_turns') as number}
                          onChange={(e) => setEditedValues(prev => ({
                            ...prev,
                            max_turns: parseInt(e.target.value) || 0
                          }))}
                          className="w-16 px-1 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 text-right"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Default Model</span>
                        <input
                          type="text"
                          value={(getValue(name, 'default_model') as string) || ''}
                          onChange={(e) => setEditedValues(prev => ({
                            ...prev,
                            default_model: e.target.value || undefined
                          }))}
                          placeholder="none"
                          className="w-24 px-1 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-200 text-right"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setEditingAgent(null)
                          setEditedValues({})
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-500">Timeout:</span>{' '}
                        <span className="text-zinc-300">{formatTimeout(config.timeout_seconds)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Max Turns:</span>{' '}
                        <span className="text-zinc-300">{config.max_turns}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Command:</span>{' '}
                        <span className="text-zinc-300 font-mono">{config.command}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Model:</span>{' '}
                        <span className="text-zinc-300">{config.default_model || 'default'}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

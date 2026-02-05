/**
 * AgentPanel - Running agents, health status, agent configuration, and success rates
 */

import { useEffect, useState } from 'react'
import type { AgentHealthEntry, ClineInfo, AgentStatsResponse } from '../stores/agentStore'

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
  agentHealth,
  clineInfo,
  agentStats,
  loading,
  onFetchConfigs,
  onFetchHealth,
  onFetchAgentStats,
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
  agentHealth: Record<string, AgentHealthEntry>
  clineInfo: ClineInfo | null
  agentStats: AgentStatsResponse | null
  loading: boolean
  onFetchConfigs: () => void
  onFetchHealth: () => void
  onFetchAgentStats: () => void
  onUpdateConfig: (name: string, updates: Partial<AgentConfigData>) => Promise<void>
  onViewLogs?: (taskId: string, taskTitle: string) => void
}) {
  const [showConfig, setShowConfig] = useState(false)
  const [showHealth, setShowHealth] = useState(true)
  const [showSuccessRates, setShowSuccessRates] = useState(true)
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [editedValues, setEditedValues] = useState<Partial<AgentConfigData>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Fetch configs, health, and stats on mount
  useEffect(() => {
    onFetchConfigs()
    onFetchHealth()
    onFetchAgentStats()
    // Refresh health every 30 seconds
    const interval = setInterval(onFetchHealth, 30000)
    return () => clearInterval(interval)
  }, [onFetchConfigs, onFetchHealth, onFetchAgentStats])

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

  const formatQuotaReset = (isoDate: string) => {
    const resetTime = new Date(isoDate)
    const now = new Date()
    const diffMs = resetTime.getTime() - now.getTime()
    if (diffMs <= 0) return 'now'
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 60) return `${diffMin}m`
    const diffHours = Math.floor(diffMin / 60)
    return `${diffHours}h ${diffMin % 60}m`
  }

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400'
      case 'degraded': return 'text-yellow-400'
      case 'quota_exceeded': return 'text-red-400'
      default: return 'text-zinc-400'
    }
  }

  const getHealthStatusBg = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500/20'
      case 'degraded': return 'bg-yellow-500/20'
      case 'quota_exceeded': return 'bg-red-500/20'
      default: return 'bg-zinc-700'
    }
  }

  // Group health entries by agent
  const healthByAgent = Object.entries(agentHealth).reduce((acc, [key, health]) => {
    const [agent] = key.split('/')
    if (!acc[agent]) acc[agent] = []
    acc[agent].push({ key, ...health })
    return acc
  }, {} as Record<string, Array<AgentHealthEntry & { key: string }>>)

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

      {/* Success Rates Section */}
      <div className="border-t border-zinc-700 pt-4">
        <button
          onClick={() => setShowSuccessRates(!showSuccessRates)}
          className="flex items-center justify-between w-full text-sm font-medium text-zinc-400 hover:text-zinc-200"
        >
          <span>Success Rates</span>
          <svg
            className={`w-4 h-4 transition-transform ${showSuccessRates ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showSuccessRates && (
          <div className="mt-4 space-y-3">
            {agentStats && Object.keys(agentStats.agents).length > 0 ? (
              <>
                {Object.entries(agentStats.agents)
                  .sort((a, b) => b[1].total_tasks - a[1].total_tasks)
                  .map(([agent, stats]) => {
                    const successPercent = Math.round(stats.success_rate * 100)
                    const barColor = successPercent >= 80 ? 'bg-green-500' :
                      successPercent >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    const textColor = successPercent >= 80 ? 'text-green-400' :
                      successPercent >= 60 ? 'text-yellow-400' : 'text-red-400'

                    return (
                      <div key={agent} className="bg-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-zinc-200 capitalize">{agent}</span>
                          <span className={`text-sm font-semibold ${textColor}`}>
                            {successPercent}%
                          </span>
                        </div>

                        {/* Success rate bar */}
                        <div className="h-2 bg-zinc-700 rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                            style={{ width: `${successPercent}%` }}
                          />
                        </div>

                        {/* Task counts */}
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span>
                            <span className="text-green-400">{stats.successful}</span>
                            {' / '}
                            <span className="text-zinc-300">{stats.total_tasks}</span>
                            {' tasks'}
                          </span>
                          {stats.failed > 0 && (
                            <span className="text-red-400">{stats.failed} failed</span>
                          )}
                        </div>

                        {/* Cost and duration (if available) */}
                        {(stats.total_cost_usd > 0 || stats.avg_duration_seconds > 0) && (
                          <div className="mt-2 pt-2 border-t border-zinc-700 flex items-center justify-between text-xs text-zinc-500">
                            {stats.total_cost_usd > 0 && (
                              <span>Avg cost: ${stats.avg_cost_usd.toFixed(3)}</span>
                            )}
                            {stats.avg_duration_seconds > 0 && (
                              <span>
                                Avg time: {stats.avg_duration_seconds < 60
                                  ? `${Math.round(stats.avg_duration_seconds)}s`
                                  : `${Math.round(stats.avg_duration_seconds / 60)}m`
                                }
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                {/* Period info */}
                {agentStats.period.start && (
                  <div className="text-xs text-zinc-500 text-center pt-2">
                    Based on {agentStats.period.total_tasks} completed tasks
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-2 text-zinc-500 text-sm">
                No task history yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Health & Credits Section */}
      <div className="border-t border-zinc-700 pt-4">
        <button
          onClick={() => setShowHealth(!showHealth)}
          className="flex items-center justify-between w-full text-sm font-medium text-zinc-400 hover:text-zinc-200"
        >
          <span>Health & Credits</span>
          <svg
            className={`w-4 h-4 transition-transform ${showHealth ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showHealth && (
          <div className="mt-4 space-y-3">
            {/* Cline/OpenRouter Credits */}
            {clineInfo && (
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-200">Cline Billing</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 capitalize">
                    {clineInfo.provider || 'unknown'}
                  </span>
                </div>

                {clineInfo.openrouter_credits && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">OpenRouter Credits</span>
                      <span className={`${
                        clineInfo.openrouter_credits.remaining < 1 ? 'text-red-400' :
                        clineInfo.openrouter_credits.remaining < 5 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        ${clineInfo.openrouter_credits.remaining.toFixed(2)} / ${clineInfo.openrouter_credits.limit.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          clineInfo.openrouter_credits.remaining / clineInfo.openrouter_credits.limit < 0.1 ? 'bg-red-500' :
                          clineInfo.openrouter_credits.remaining / clineInfo.openrouter_credits.limit < 0.3 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${(clineInfo.openrouter_credits.remaining / clineInfo.openrouter_credits.limit) * 100}%` }}
                      />
                    </div>
                    {clineInfo.openrouter_credits.isFreeTier && (
                      <div className="text-zinc-500">Free tier active</div>
                    )}
                  </div>
                )}

                {clineInfo.cline_credits !== null && (
                  <div className="mt-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Cline Credits</span>
                      <span className="text-zinc-300">${clineInfo.cline_credits.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {clineInfo.free_models && clineInfo.free_models.length > 0 && (
                  <div className="mt-2 text-xs">
                    <span className="text-zinc-500">Free Models: </span>
                    <span className="text-zinc-300">{clineInfo.free_models.length} available</span>
                  </div>
                )}
              </div>
            )}

            {/* Agent Health Status */}
            {Object.keys(healthByAgent).length > 0 ? (
              Object.entries(healthByAgent).map(([agent, entries]) => (
                <div key={agent} className="bg-zinc-800 rounded-lg p-3">
                  <div className="text-sm font-medium text-zinc-200 capitalize mb-2">{agent}</div>
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <div key={entry.key} className="text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 font-mono">{entry.key}</span>
                          <span className={`px-1.5 py-0.5 rounded ${getHealthStatusBg(entry.status)} ${getHealthStatusColor(entry.status)}`}>
                            {entry.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex justify-between text-zinc-500 mt-1">
                          <span>{entry.successCount} ok / {entry.errorCount} err</span>
                          {entry.quotaResetAt && (
                            <span className="text-yellow-400">
                              Resets in {formatQuotaReset(entry.quotaResetAt)}
                            </span>
                          )}
                        </div>
                        {entry.lastError && (
                          <div className="mt-1 text-red-400 truncate" title={entry.lastError}>
                            {entry.lastError.slice(0, 60)}...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-2 text-zinc-500 text-sm">
                No health data yet
              </div>
            )}
          </div>
        )}
      </div>

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

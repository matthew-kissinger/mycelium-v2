/**
 * Panel - Side panel for drill-in views
 */

import { useEffect, useState, useRef } from 'react'
import type { PanelType } from '../flow/types'
import { useSystemStore } from '../stores/system'

// Scheduler config type (matches store)
interface SchedulerConfig {
  dispatcher_enabled: boolean
  dispatcher_interval_sec: number
  max_concurrent_tasks: number
  min_concurrent_tasks: number
  max_concurrent_ceiling: number
  blocked_task_timeout_sec: number
  blocked_check_enabled: boolean
  orphan_cancel_timeout_sec: number
  discovery_enabled: boolean
  discovery_interval_sec: number
  discovery_repos: string[]
  discovery_auto_create: string[]
  sequencer_enabled: boolean
  sequencer_interval_sec: number
  shepherd_enabled: boolean
  shepherd_batch_size: number
  armory_enabled: boolean
  armory_batch_size: number
  digest_enabled: boolean
  digest_interval_sec: number
  compaction_enabled: boolean
  compaction_day: number
  compaction_hour: number
  auto_prune_enabled: boolean
  auto_prune_threshold: number
  auto_prune_keep: number
}

interface PanelProps {
  type: PanelType
  nodeId: string | null
  data?: Record<string, unknown>
  onClose: () => void
}

export function Panel({ type, nodeId, data, onClose }: PanelProps) {
  const {
    scheduler,
    startScheduler,
    stopScheduler,
    schedulerLoading,
    triggerCycle,
    stats,
    runningTasks,
    signals,
    signalsLoading,
    pendingSignalCount,
    fetchSignals,
    respondToSignal,
    deleteSignal,
    patterns,
    warnings,
    memoryLoading,
    patternCount,
    warningCount,
    groupedMemory,
    reposWithMemory,
    fetchMemoryDetails,
    deletePattern,
    deleteWarning,
    schedulerConfig,
    schedulerConfigLoading,
    fetchSchedulerConfig,
    updateSchedulerConfig,
    agentConfigs,
    agentConfigsLoading,
    fetchAgentConfigs,
    updateAgentConfig,
    prompts,
    promptsLoading,
    selectedPrompt,
    selectedPromptLoading,
    fetchPrompts,
    fetchPrompt,
    updatePrompt,
    resetPrompt,
    taskLogs,
    taskLogsLoading,
    fetchTaskLogs,
    clearTaskLogs,
    tasks,
    tasksTotal,
    tasksLoading,
    taskFilters,
    selectedTask,
    selectedTaskLoading,
    taskGraph,
    taskGraphLoading,
    fetchTasks,
    setTaskFilters,
    fetchTask,
    runTask,
    cancelTask,
    deleteTask,
    cloneTask,
    retryTask,
    fetchTaskGraph,
    clearSelectedTask,
    repos,
    reposLoading,
    fetchRepos,
    updateRepo,
    deleteRepo,
    addRepo,
    browseDirectory,
    inventory,
    inventoryLoading,
    fetchInventory,
    triggerArmory,
  } = useSystemStore()

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Render panel content based on type
  const renderContent = () => {
    switch (type) {
      case 'scheduler':
        return <SchedulerPanel
          scheduler={scheduler}
          onStart={startScheduler}
          onStop={stopScheduler}
          loading={schedulerLoading}
          config={schedulerConfig}
          configLoading={schedulerConfigLoading}
          onFetchConfig={fetchSchedulerConfig}
          onUpdateConfig={updateSchedulerConfig}
        />

      case 'cycle': {
        // Only Discovery, Sequencer, and Shepherd have system prompts
        const cycleType = (data?.cycleType as string) || nodeId?.replace('-', '_') || ''
        const promptId = {
          'discovery': 'discovery',
          'sequencer': 'sequencer',
          'shepherd': 'shepherd',
        }[cycleType] as string | undefined

        return <CyclePanel
          nodeId={nodeId}
          data={data}
          onTrigger={triggerCycle}
          onOpenPrompts={promptId ? () => {
            useSystemStore.getState().openPanel('prompts', 'prompts', { promptId })
          } : undefined}
          config={schedulerConfig}
          configLoading={schedulerConfigLoading}
          onFetchConfig={fetchSchedulerConfig}
          onUpdateConfig={updateSchedulerConfig}
        />
      }

      case 'taskPool':
        return <TaskPoolPanel
          stats={stats}
          tasks={tasks}
          tasksTotal={tasksTotal}
          tasksLoading={tasksLoading}
          taskFilters={taskFilters}
          selectedTask={selectedTask}
          selectedTaskLoading={selectedTaskLoading}
          taskGraph={taskGraph}
          taskGraphLoading={taskGraphLoading}
          onFetchTasks={fetchTasks}
          onSetFilters={setTaskFilters}
          onFetchTask={fetchTask}
          onRunTask={runTask}
          onCancelTask={cancelTask}
          onDeleteTask={deleteTask}
          onCloneTask={cloneTask}
          onRetryTask={retryTask}
          onFetchGraph={fetchTaskGraph}
          onClearSelected={clearSelectedTask}
          onViewLogs={(taskId, taskTitle) => {
            useSystemStore.getState().openPanel('logs', 'logs', { taskId, taskTitle })
          }}
        />

      case 'agent':
        return <AgentPanel
          runningTasks={runningTasks}
          agentConfigs={agentConfigs}
          loading={agentConfigsLoading}
          onFetchConfigs={fetchAgentConfigs}
          onUpdateConfig={updateAgentConfig}
          onViewLogs={(taskId, taskTitle) => {
            useSystemStore.getState().openPanel('logs', 'logs', { taskId, taskTitle })
          }}
        />

      case 'alignment':
        return <AlignmentPanel
          signals={signals}
          loading={signalsLoading}
          pendingCount={pendingSignalCount}
          onFetch={fetchSignals}
          onRespond={respondToSignal}
          onDelete={deleteSignal}
        />

      case 'memory':
        return <MemoryPanel
          patterns={patterns}
          warnings={warnings}
          loading={memoryLoading}
          patternCount={patternCount}
          warningCount={warningCount}
          reposWithMemory={reposWithMemory}
          groupedMemory={groupedMemory}
          onFetch={fetchMemoryDetails}
          onDeletePattern={deletePattern}
          onDeleteWarning={deleteWarning}
        />

      case 'prompts':
        return <PromptsPanel
          prompts={prompts}
          loading={promptsLoading}
          selectedPrompt={selectedPrompt}
          selectedPromptLoading={selectedPromptLoading}
          onFetchPrompts={fetchPrompts}
          onFetchPrompt={fetchPrompt}
          onUpdatePrompt={updatePrompt}
          onResetPrompt={resetPrompt}
          initialPromptId={data?.promptId as string | undefined}
        />

      case 'logs':
        return <LiveLogViewer
          taskId={data?.taskId as string}
          taskTitle={data?.taskTitle as string}
          logs={taskLogs[data?.taskId as string] || []}
          loading={taskLogsLoading[data?.taskId as string] || false}
          onFetchLogs={fetchTaskLogs}
          onClearLogs={clearTaskLogs}
        />

      case 'repos':
        return <ReposPanel
          repos={repos}
          loading={reposLoading}
          onFetch={fetchRepos}
          onUpdate={updateRepo}
          onDelete={deleteRepo}
          onAdd={addRepo}
          onBrowse={browseDirectory}
        />

      case 'inventory':
        return <InventoryPanel
          inventory={inventory}
          loading={inventoryLoading}
          onFetch={fetchInventory}
          onTriggerArmory={triggerArmory}
        />

      default:
        return <div className="text-zinc-500">Unknown panel type</div>
    }
  }

  const panelTitle = {
    scheduler: 'Scheduler',
    cycle: (data?.label as string) || 'Cycle',
    taskPool: 'Task Pool',
    agent: 'Running Agents',
    alignment: 'Alignment Signals',
    memory: 'Memory (Hyphae)',
    prompts: 'System Prompts',
    logs: `Task Logs${data?.taskTitle ? `: ${(data.taskTitle as string).slice(0, 30)}` : ''}`,
    repos: 'Network Repos',
    inventory: 'Skills & MCPs',
  }[type || 'scheduler']

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 z-10"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-96 bg-zinc-900 border-l border-zinc-700 z-20 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-100">{panelTitle}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderContent()}
        </div>
      </div>
    </>
  )
}

// =============================================================================
// Sub-panels
// =============================================================================

interface SchedulerStatus {
  running: boolean
  started_at?: string
  cycles: Array<{
    name: string
    enabled: boolean
    running: boolean
    last_run?: string
    runs_completed: number
    errors: number
  }>
}

function SchedulerPanel({
  scheduler,
  onStart,
  onStop,
  loading,
  config,
  configLoading,
  onFetchConfig,
  onUpdateConfig,
}: {
  scheduler: SchedulerStatus | null
  onStart: () => void
  onStop: () => void
  loading: boolean
  config: SchedulerConfig | null
  configLoading: boolean
  onFetchConfig: () => void
  onUpdateConfig: (updates: Partial<SchedulerConfig>) => Promise<void>
}) {
  const [showConfig, setShowConfig] = useState(false)
  const [editedConfig, setEditedConfig] = useState<Partial<SchedulerConfig>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Fetch config when panel opens
  useEffect(() => {
    onFetchConfig()
  }, [onFetchConfig])

  // Reset edited config when config loads
  useEffect(() => {
    if (config) {
      setEditedConfig({})
    }
  }, [config])

  const formatUptime = (startedAt?: string) => {
    if (!startedAt) return 'N/A'
    const start = new Date(startedAt)
    const now = new Date()
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  }

  const formatSeconds = (sec: number) => {
    if (sec < 60) return `${sec}s`
    if (sec < 3600) return `${Math.floor(sec / 60)}m`
    return `${Math.floor(sec / 3600)}h`
  }

  const handleConfigChange = (key: keyof SchedulerConfig, value: number | boolean) => {
    setEditedConfig(prev => ({ ...prev, [key]: value }))
    setSaveStatus('idle')
  }

  const handleSaveConfig = async () => {
    if (Object.keys(editedConfig).length === 0) return
    setSaveStatus('saving')
    try {
      await onUpdateConfig(editedConfig)
      setEditedConfig({})
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }

  const getValue = <K extends keyof SchedulerConfig>(key: K): SchedulerConfig[K] => {
    if (key in editedConfig) return editedConfig[key] as SchedulerConfig[K]
    if (config) return config[key]
    return 0 as SchedulerConfig[K]
  }

  const hasChanges = Object.keys(editedConfig).length > 0

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="bg-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-zinc-400">Status</span>
          <span className={`px-2 py-1 rounded text-sm ${
            scheduler?.running
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-700 text-zinc-400'
          }`}>
            {scheduler?.running ? 'Running' : 'Stopped'}
          </span>
        </div>

        {scheduler?.running && scheduler.started_at && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Uptime</span>
            <span className="text-zinc-200">{formatUptime(scheduler.started_at)}</span>
          </div>
        )}
      </div>

      {/* Control buttons */}
      <div className="flex gap-2">
        {scheduler?.running ? (
          <button
            onClick={onStop}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50"
          >
            {loading ? 'Stopping...' : 'Stop Scheduler'}
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Start Scheduler'}
          </button>
        )}
      </div>

      {/* Cycles */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Cycles</h3>
        <div className="space-y-2">
          {scheduler?.cycles.map((cycle) => (
            <div
              key={cycle.name}
              className="bg-zinc-800 rounded p-3 flex items-center justify-between"
            >
              <div>
                <div className="text-sm text-zinc-200 capitalize">{cycle.name.replace('_', ' ')}</div>
                <div className="text-xs text-zinc-500">
                  {cycle.runs_completed} runs, {cycle.errors} errors
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cycle.running && (
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  cycle.enabled ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'
                }`}>
                  {cycle.enabled ? 'On' : 'Off'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration Section */}
      <div className="border-t border-zinc-700 pt-4">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center justify-between w-full text-sm font-medium text-zinc-400 hover:text-zinc-200"
        >
          <span>Configuration</span>
          <svg
            className={`w-4 h-4 transition-transform ${showConfig ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showConfig && config && (
          <div className="mt-4 space-y-4">
            {/* Concurrency */}
            <div className="bg-zinc-800 rounded-lg p-3">
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Concurrency</h4>
              <div className="space-y-3">
                <ConfigInput
                  label="Max Concurrent Tasks"
                  value={getValue('max_concurrent_tasks')}
                  onChange={(v) => handleConfigChange('max_concurrent_tasks', v)}
                  min={1}
                  max={20}
                />
                <ConfigInput
                  label="Concurrency Ceiling"
                  value={getValue('max_concurrent_ceiling')}
                  onChange={(v) => handleConfigChange('max_concurrent_ceiling', v)}
                  min={1}
                  max={50}
                />
              </div>
            </div>

            {/* Intervals */}
            <div className="bg-zinc-800 rounded-lg p-3">
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Intervals</h4>
              <div className="space-y-3">
                <ConfigInput
                  label="Dispatcher"
                  value={getValue('dispatcher_interval_sec')}
                  onChange={(v) => handleConfigChange('dispatcher_interval_sec', v)}
                  min={10}
                  max={600}
                  suffix="sec"
                  hint={formatSeconds(getValue('dispatcher_interval_sec') as number)}
                />
                <ConfigToggle
                  label="Dispatcher Enabled"
                  value={getValue('dispatcher_enabled') as boolean}
                  onChange={(v) => handleConfigChange('dispatcher_enabled', v)}
                />
                <ConfigInput
                  label="Discovery"
                  value={getValue('discovery_interval_sec')}
                  onChange={(v) => handleConfigChange('discovery_interval_sec', v)}
                  min={60}
                  max={7200}
                  suffix="sec"
                  hint={formatSeconds(getValue('discovery_interval_sec') as number)}
                />
                <ConfigToggle
                  label="Discovery Enabled"
                  value={getValue('discovery_enabled') as boolean}
                  onChange={(v) => handleConfigChange('discovery_enabled', v)}
                />
                <ConfigInput
                  label="Digest"
                  value={getValue('digest_interval_sec')}
                  onChange={(v) => handleConfigChange('digest_interval_sec', v)}
                  min={3600}
                  max={86400}
                  suffix="sec"
                  hint={formatSeconds(getValue('digest_interval_sec') as number)}
                />
                <ConfigToggle
                  label="Digest Enabled"
                  value={getValue('digest_enabled') as boolean}
                  onChange={(v) => handleConfigChange('digest_enabled', v)}
                />
              </div>
            </div>

            {/* Blocked Tasks */}
            <div className="bg-zinc-800 rounded-lg p-3">
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Blocked Task Detection</h4>
              <div className="space-y-3">
                <ConfigToggle
                  label="Enabled"
                  value={getValue('blocked_check_enabled') as boolean}
                  onChange={(v) => handleConfigChange('blocked_check_enabled', v)}
                />
                <ConfigInput
                  label="Timeout"
                  value={getValue('blocked_task_timeout_sec')}
                  onChange={(v) => handleConfigChange('blocked_task_timeout_sec', v)}
                  min={1800}
                  max={43200}
                  suffix="sec"
                  hint={formatSeconds(getValue('blocked_task_timeout_sec') as number)}
                />
              </div>
            </div>

            {/* Compaction */}
            <div className="bg-zinc-800 rounded-lg p-3">
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Memory Compaction</h4>
              <div className="space-y-3">
                <ConfigToggle
                  label="Enabled"
                  value={getValue('compaction_enabled') as boolean}
                  onChange={(v) => handleConfigChange('compaction_enabled', v)}
                />
                <ConfigInput
                  label="Day (0=Sun, 1=Mon, ...)"
                  value={getValue('compaction_day')}
                  onChange={(v) => handleConfigChange('compaction_day', v)}
                  min={0}
                  max={6}
                />
                <ConfigInput
                  label="Hour (0-23)"
                  value={getValue('compaction_hour')}
                  onChange={(v) => handleConfigChange('compaction_hour', v)}
                  min={0}
                  max={23}
                />
              </div>
            </div>

            {/* Save Button */}
            {hasChanges && (
              <button
                onClick={handleSaveConfig}
                disabled={configLoading}
                className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                  saveStatus === 'saved'
                    ? 'bg-green-500/20 text-green-400'
                    : saveStatus === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                } disabled:opacity-50`}
              >
                {saveStatus === 'saving' ? 'Saving...' :
                 saveStatus === 'saved' ? 'Saved!' :
                 saveStatus === 'error' ? 'Error - Try Again' :
                 'Save Configuration'}
              </button>
            )}
          </div>
        )}

        {showConfig && configLoading && !config && (
          <div className="mt-4 text-center text-zinc-500 py-4">
            Loading configuration...
          </div>
        )}
      </div>
    </div>
  )
}

// Config input component
function ConfigInput({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-zinc-300">{label}</span>
        {hint && <span className="text-xs text-zinc-500 ml-2">({hint})</span>}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          min={min}
          max={max}
          className="w-20 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200 text-right"
        />
        {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
      </div>
    </div>
  )
}

// Config toggle component
function ConfigToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          value ? 'bg-green-500' : 'bg-zinc-600'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function CyclePanel({
  nodeId,
  data,
  onTrigger,
  onOpenPrompts,
  config,
  configLoading,
  onFetchConfig,
  onUpdateConfig,
}: {
  nodeId: string | null
  data?: Record<string, unknown>
  onTrigger: (name: string) => void
  onOpenPrompts?: () => void
  config: SchedulerConfig | null
  configLoading: boolean
  onFetchConfig: () => Promise<void>
  onUpdateConfig: (updates: Partial<SchedulerConfig>) => Promise<void>
}) {
  const cycleName = nodeId?.replace('-', '_') || ''
  const cycleType = (data?.cycleType as string) || cycleName
  const description = data?.description as string | undefined
  const running = data?.running as boolean | undefined
  const last_run = data?.last_run as string | undefined
  const runs_completed = (data?.runs_completed as number) || 0
  const errors = (data?.errors as number) || 0

  // Local state for editing
  const [editing, setEditing] = useState(false)
  const [localConfig, setLocalConfig] = useState<Partial<SchedulerConfig>>({})
  const [saving, setSaving] = useState(false)

  // Fetch config on mount
  useEffect(() => {
    if (!config) {
      onFetchConfig()
    }
  }, [config, onFetchConfig])

  // Reset local config when config changes or editing starts
  useEffect(() => {
    if (config && editing) {
      setLocalConfig(getCycleConfig())
    }
  }, [config, editing])

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  // Get cycle-specific config fields
  const getCycleConfig = (): Partial<SchedulerConfig> => {
    if (!config) return {}
    switch (cycleType) {
      case 'dispatcher':
        return {
          dispatcher_enabled: config.dispatcher_enabled,
          dispatcher_interval_sec: config.dispatcher_interval_sec,
          max_concurrent_tasks: config.max_concurrent_tasks,
        }
      case 'discovery':
        return {
          discovery_enabled: config.discovery_enabled,
          discovery_interval_sec: config.discovery_interval_sec,
        }
      case 'sequencer':
        return {
          sequencer_enabled: config.sequencer_enabled,
          sequencer_interval_sec: config.sequencer_interval_sec,
        }
      case 'shepherd':
        return {
          shepherd_enabled: config.shepherd_enabled,
          shepherd_batch_size: config.shepherd_batch_size,
        }
      case 'armory':
        return {
          armory_enabled: config.armory_enabled,
          armory_batch_size: config.armory_batch_size,
        }
      case 'digest':
        return {
          digest_enabled: config.digest_enabled,
          digest_interval_sec: config.digest_interval_sec,
        }
      case 'compaction':
        return {
          compaction_enabled: config.compaction_enabled,
          compaction_day: config.compaction_day,
          compaction_hour: config.compaction_hour,
        }
      case 'blocked_check':
        return {
          blocked_check_enabled: config.blocked_check_enabled,
          blocked_task_timeout_sec: config.blocked_task_timeout_sec,
        }
      default:
        return {}
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdateConfig(localConfig)
      setEditing(false)
    } catch (error) {
      console.error('Failed to save config:', error)
    } finally {
      setSaving(false)
    }
  }

  // Get interval value from config for display
  const getIntervalSec = (): number | undefined => {
    if (!config) return undefined
    switch (cycleType) {
      case 'dispatcher':
        return config.dispatcher_interval_sec
      case 'discovery':
        return config.discovery_interval_sec
      case 'sequencer':
        return config.sequencer_interval_sec
      case 'digest':
        return config.digest_interval_sec
      default:
        return undefined
    }
  }

  const interval_sec = getIntervalSec()

  // Render cycle-specific config form
  const renderConfigForm = () => {
    if (configLoading) {
      return <div className="text-zinc-400 text-sm">Loading config...</div>
    }

    switch (cycleType) {
      case 'dispatcher':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.dispatcher_enabled ?? config?.dispatcher_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, dispatcher_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Interval (seconds)</span>
              <input
                type="number"
                value={localConfig.dispatcher_interval_sec ?? config?.dispatcher_interval_sec ?? 60}
                onChange={(e) => setLocalConfig({ ...localConfig, dispatcher_interval_sec: parseInt(e.target.value) || 60 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Max Concurrent Tasks</span>
              <input
                type="number"
                value={localConfig.max_concurrent_tasks ?? config?.max_concurrent_tasks ?? 3}
                onChange={(e) => setLocalConfig({ ...localConfig, max_concurrent_tasks: parseInt(e.target.value) || 3 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
            </label>
          </div>
        )

      case 'discovery':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.discovery_enabled ?? config?.discovery_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, discovery_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Interval (seconds)</span>
              <input
                type="number"
                value={localConfig.discovery_interval_sec ?? config?.discovery_interval_sec ?? 900}
                onChange={(e) => setLocalConfig({ ...localConfig, discovery_interval_sec: parseInt(e.target.value) || 900 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
            </label>
          </div>
        )

      case 'sequencer':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.sequencer_enabled ?? config?.sequencer_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, sequencer_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Interval (seconds)</span>
              <input
                type="number"
                value={localConfig.sequencer_interval_sec ?? config?.sequencer_interval_sec ?? 900}
                onChange={(e) => setLocalConfig({ ...localConfig, sequencer_interval_sec: parseInt(e.target.value) || 900 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
            </label>
          </div>
        )

      case 'shepherd':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.shepherd_enabled ?? config?.shepherd_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, shepherd_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Batch Size (tasks needed to trigger)</span>
              <input
                type="number"
                value={localConfig.shepherd_batch_size ?? config?.shepherd_batch_size ?? 5}
                onChange={(e) => setLocalConfig({ ...localConfig, shepherd_batch_size: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
              <p className="text-xs text-zinc-500 mt-1">Shepherd runs when a repo has this many unevaluated tasks</p>
            </label>
          </div>
        )

      case 'armory':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.armory_enabled ?? config?.armory_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, armory_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Batch Size (tasks before analysis)</span>
              <input
                type="number"
                value={localConfig.armory_batch_size ?? config?.armory_batch_size ?? 10}
                onChange={(e) => setLocalConfig({ ...localConfig, armory_batch_size: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
              <p className="text-xs text-zinc-500 mt-1">Armory analyzes completed tasks and installs missing skills/MCPs</p>
            </label>
          </div>
        )

      case 'digest':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.digest_enabled ?? config?.digest_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, digest_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Interval (seconds)</span>
              <input
                type="number"
                value={localConfig.digest_interval_sec ?? config?.digest_interval_sec ?? 21600}
                onChange={(e) => setLocalConfig({ ...localConfig, digest_interval_sec: parseInt(e.target.value) || 21600 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
            </label>
          </div>
        )

      case 'compaction':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.compaction_enabled ?? config?.compaction_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, compaction_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Day of Week (0=Sun, 1=Mon, ...)</span>
              <input
                type="number"
                min={0}
                max={6}
                value={localConfig.compaction_day ?? config?.compaction_day ?? 1}
                onChange={(e) => setLocalConfig({ ...localConfig, compaction_day: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Hour (0-23)</span>
              <input
                type="number"
                min={0}
                max={23}
                value={localConfig.compaction_hour ?? config?.compaction_hour ?? 11}
                onChange={(e) => setLocalConfig({ ...localConfig, compaction_hour: parseInt(e.target.value) || 11 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
            </label>
          </div>
        )

      case 'blocked_check':
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Enabled</span>
              <input
                type="checkbox"
                checked={localConfig.blocked_check_enabled ?? config?.blocked_check_enabled ?? true}
                onChange={(e) => setLocalConfig({ ...localConfig, blocked_check_enabled: e.target.checked })}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-sm block mb-1">Blocked Task Timeout (seconds)</span>
              <input
                type="number"
                value={localConfig.blocked_task_timeout_sec ?? config?.blocked_task_timeout_sec ?? 10800}
                onChange={(e) => setLocalConfig({ ...localConfig, blocked_task_timeout_sec: parseInt(e.target.value) || 10800 })}
                className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 text-zinc-100"
              />
              <p className="text-xs text-zinc-500 mt-1">Tasks running longer than this are marked as blocked</p>
            </label>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Description */}
      {description && (
        <p className="text-zinc-400">{description}</p>
      )}

      {/* Stats */}
      <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-zinc-400">Status</span>
          <span className={running ? 'text-green-400' : 'text-zinc-300'}>
            {running ? 'Running' : 'Idle'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Last Run</span>
          <span className="text-zinc-300">{formatTimeAgo(last_run)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Runs Completed</span>
          <span className="text-zinc-300">{runs_completed}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Errors</span>
          <span className={`${errors > 0 ? 'text-red-400' : 'text-zinc-300'}`}>
            {errors}
          </span>
        </div>
        {interval_sec && (
          <div className="flex justify-between">
            <span className="text-zinc-400">Interval</span>
            <span className="text-zinc-300">{interval_sec}s</span>
          </div>
        )}
        {cycleType === 'shepherd' && config?.shepherd_batch_size && (
          <div className="flex justify-between">
            <span className="text-zinc-400">Batch Size</span>
            <span className="text-zinc-300">{config.shepherd_batch_size} tasks</span>
          </div>
        )}
      </div>

      {/* Trigger button */}
      <button
        onClick={() => onTrigger(cycleType)}
        disabled={running}
        className="w-full px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50"
      >
        Trigger Now
      </button>

      {/* Configuration section */}
      <div className="pt-4 border-t border-zinc-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400">Configuration</h3>
          {!editing ? (
            <button
              onClick={() => {
                setLocalConfig(getCycleConfig())
                setEditing(true)
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-zinc-400 hover:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="bg-zinc-800 rounded-lg p-4">
            {renderConfigForm()}
          </div>
        ) : (
          <div className="bg-zinc-800 rounded-lg p-4 space-y-2 text-sm">
            {configLoading ? (
              <div className="text-zinc-400">Loading...</div>
            ) : (
              Object.entries(getCycleConfig()).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-zinc-400">{key.replace(/_/g, ' ')}</span>
                  <span className="text-zinc-300">{String(value)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Prompt section */}
      {onOpenPrompts && (
        <div className="pt-4 border-t border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">System Prompt</h3>
          <button
            onClick={onOpenPrompts}
            className="w-full bg-zinc-800 rounded-lg p-3 text-left hover:bg-zinc-750 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">View and edit this agent's prompt</span>
              <svg className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

// Task type for TaskPoolPanel
interface TaskData {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  agent?: string
  model?: string
  repo_path: string
  prompt?: string
  depends_on: string[]
  sequenced: boolean
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

function TaskPoolPanel({
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
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
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
                  {task.agent && <span className="capitalize">{task.agent}</span>}
                  <span>{formatTimeAgo(task.created_at)}</span>
                  {task.cost_usd > 0 && <span>{formatCost(task.cost_usd)}</span>}
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

function AgentPanel({
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

// Signal type for AlignmentPanel
interface Signal {
  id: string
  question: string
  options: string[]
  status: 'pending' | 'responded' | 'expired'
  response?: string
  task_id?: string
  repo_path?: string
  created_at: string
  responded_at?: string
}

function AlignmentPanel({
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
                      {signal.options.map((option, idx) => (
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

// Memory types for panel
interface MemoryPattern {
  id: string
  content: string
  source: string
  task_id?: string
  repo_path?: string
  tags: string[]
  created_at: string
}

interface MemoryWarning {
  id: string
  content: string
  severity: string
  task_id?: string
  repo_path?: string
  created_at: string
}

// Grouped memory type for the panel
interface GroupedMemoryData {
  global: {
    patterns: MemoryPattern[]
    warnings: MemoryWarning[]
  }
  repos: Record<string, {
    patterns: MemoryPattern[]
    warnings: MemoryWarning[]
  }>
  summary: {
    total_patterns: number
    total_warnings: number
    global_patterns: number
    global_warnings: number
    repos_with_memory: number
  }
}

function MemoryPanel({
  patterns,
  warnings,
  loading,
  patternCount,
  warningCount,
  reposWithMemory,
  groupedMemory,
  onFetch,
  onDeletePattern,
  onDeleteWarning,
}: {
  patterns: MemoryPattern[]
  warnings: MemoryWarning[]
  loading: boolean
  patternCount: number
  warningCount: number
  reposWithMemory: number
  groupedMemory: GroupedMemoryData | null
  onFetch: () => void
  onDeletePattern: (id: string) => Promise<void>
  onDeleteWarning: (id: string) => Promise<void>
}) {
  const [activeView, setActiveView] = useState<'grouped' | 'all'>('grouped')
  const [activeTab, setActiveTab] = useState<'patterns' | 'warnings'>('patterns')
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set(['global']))
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fetch on mount
  useEffect(() => {
    onFetch()
  }, [onFetch])

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const handleDeletePattern = async (id: string) => {
    if (!confirm('Delete this pattern?')) return
    setDeletingId(id)
    try {
      await onDeletePattern(id)
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteWarning = async (id: string) => {
    if (!confirm('Delete this warning?')) return
    setDeletingId(id)
    try {
      await onDeleteWarning(id)
    } finally {
      setDeletingId(null)
    }
  }

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-500/20'
      case 'medium': return 'text-amber-400 bg-amber-500/20'
      case 'low': return 'text-blue-400 bg-blue-500/20'
      default: return 'text-zinc-400 bg-zinc-700'
    }
  }

  const toggleRepo = (repo: string) => {
    setExpandedRepos(prev => {
      const next = new Set(prev)
      if (next.has(repo)) {
        next.delete(repo)
      } else {
        next.add(repo)
      }
      return next
    })
  }

  const getRepoName = (path: string) => path.split('/').pop() || path

  const renderPatternItem = (pattern: MemoryPattern) => (
    <div key={pattern.id} className="bg-zinc-800/50 rounded p-2.5 mb-2">
      <div className="text-sm text-zinc-200 mb-1.5 line-clamp-2">{pattern.content}</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{formatTimeAgo(pattern.created_at)}</span>
          <span className="capitalize text-zinc-600">{pattern.source}</span>
          {pattern.tags.length > 0 && (
            <div className="flex gap-1">
              {pattern.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-zinc-700 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => handleDeletePattern(pattern.id)}
          disabled={deletingId === pattern.id}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deletingId === pattern.id ? '...' : 'Delete'}
        </button>
      </div>
    </div>
  )

  const renderWarningItem = (warning: MemoryWarning) => (
    <div key={warning.id} className="bg-zinc-800/50 rounded p-2.5 mb-2">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-sm text-zinc-200 line-clamp-2">{warning.content}</div>
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded capitalize ${severityColor(warning.severity)}`}>
          {warning.severity}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{formatTimeAgo(warning.created_at)}</span>
        <button
          onClick={() => handleDeleteWarning(warning.id)}
          disabled={deletingId === warning.id}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deletingId === warning.id ? '...' : 'Delete'}
        </button>
      </div>
    </div>
  )

  const renderMemorySection = (
    title: string,
    sectionKey: string,
    patternsData: MemoryPattern[],
    warningsData: MemoryWarning[],
    isGlobal = false
  ) => {
    const isExpanded = expandedRepos.has(sectionKey)
    const totalItems = patternsData.length + warningsData.length

    return (
      <div key={sectionKey} className={`rounded-lg border ${isGlobal ? 'border-purple-500/30 bg-purple-500/5' : 'border-zinc-700 bg-zinc-800/30'}`}>
        <button
          onClick={() => toggleRepo(sectionKey)}
          className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-800/50 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className={`text-lg ${isExpanded ? 'rotate-90' : ''} transition-transform`}>{'>'}</span>
            <span className={`font-medium ${isGlobal ? 'text-purple-300' : 'text-zinc-200'}`}>
              {isGlobal ? 'Global (Network-wide)' : title}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-blue-400">{patternsData.length} patterns</span>
            <span className={warningsData.length > 0 ? 'text-amber-400' : 'text-zinc-500'}>
              {warningsData.length} warnings
            </span>
          </div>
        </button>

        {isExpanded && totalItems > 0 && (
          <div className="px-3 pb-3 pt-1">
            {/* Section tabs */}
            <div className="flex gap-1 bg-zinc-800 rounded p-0.5 mb-3">
              <button
                onClick={() => setActiveTab('patterns')}
                className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === 'patterns' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Patterns ({patternsData.length})
              </button>
              <button
                onClick={() => setActiveTab('warnings')}
                className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === 'warnings' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Warnings ({warningsData.length})
              </button>
            </div>

            {/* Content */}
            <div className="max-h-48 overflow-y-auto">
              {activeTab === 'patterns' ? (
                patternsData.length === 0 ? (
                  <div className="text-center py-3 text-zinc-500 text-xs">No patterns</div>
                ) : (
                  patternsData.map(renderPatternItem)
                )
              ) : (
                warningsData.length === 0 ? (
                  <div className="text-center py-3 text-zinc-500 text-xs">No warnings</div>
                ) : (
                  warningsData.map(renderWarningItem)
                )
              )}
            </div>
          </div>
        )}

        {isExpanded && totalItems === 0 && (
          <div className="px-3 pb-3 text-center text-zinc-500 text-xs">No memory stored</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Patterns</div>
          <div className="text-xl font-semibold text-blue-400">{patternCount}</div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Warnings</div>
          <div className={`text-xl font-semibold ${warningCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
            {warningCount}
          </div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Repos</div>
          <div className="text-xl font-semibold text-green-400">{reposWithMemory}</div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
        <button
          onClick={() => setActiveView('grouped')}
          className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
            activeView === 'grouped' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          By Scope
        </button>
        <button
          onClick={() => setActiveView('all')}
          className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
            activeView === 'all' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All Items
        </button>
      </div>

      {/* Content */}
      {loading && !groupedMemory ? (
        <div className="text-center py-8 text-zinc-500">Loading memory...</div>
      ) : activeView === 'grouped' && groupedMemory ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {/* Global Memory Section */}
          {renderMemorySection(
            'Global',
            'global',
            groupedMemory.global.patterns,
            groupedMemory.global.warnings,
            true
          )}

          {/* Repo-specific Memory Sections */}
          {Object.entries(groupedMemory.repos).map(([repoPath, memory]) => (
            renderMemorySection(
              getRepoName(repoPath),
              repoPath,
              memory.patterns,
              memory.warnings,
              false
            )
          ))}

          {Object.keys(groupedMemory.repos).length === 0 && groupedMemory.global.patterns.length === 0 && groupedMemory.global.warnings.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <p className="mb-2">No memory stored yet</p>
              <p className="text-xs text-zinc-600">Memory is learned from completed tasks via the Shepherd</p>
            </div>
          )}
        </div>
      ) : (
        /* All Items View - flat list */
        <div className="space-y-3">
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('patterns')}
              className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
                activeTab === 'patterns' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Patterns ({patterns.length})
            </button>
            <button
              onClick={() => setActiveTab('warnings')}
              className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
                activeTab === 'warnings' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Warnings ({warnings.length})
            </button>
          </div>

          <div className="max-h-[350px] overflow-y-auto">
            {activeTab === 'patterns' ? (
              patterns.length === 0 ? (
                <div className="text-center py-4 text-zinc-500 text-sm">No patterns yet</div>
              ) : (
                patterns.map((pattern) => (
                  <div key={pattern.id} className="bg-zinc-800 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      {pattern.repo_path ? (
                        <span className="text-xs px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-400">
                          {getRepoName(pattern.repo_path)}
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-400">
                          Global
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-200 mb-2 line-clamp-3">{pattern.content}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{formatTimeAgo(pattern.created_at)}</span>
                        <span className="capitalize">{pattern.source}</span>
                      </div>
                      <button
                        onClick={() => handleDeletePattern(pattern.id)}
                        disabled={deletingId === pattern.id}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        {deletingId === pattern.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : (
              warnings.length === 0 ? (
                <div className="text-center py-4 text-zinc-500 text-sm">No warnings yet</div>
              ) : (
                warnings.map((warning) => (
                  <div key={warning.id} className="bg-zinc-800 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      {warning.repo_path ? (
                        <span className="text-xs px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-400">
                          {getRepoName(warning.repo_path)}
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-400">
                          Global
                        </span>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-sm text-zinc-200 line-clamp-3">{warning.content}</div>
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded capitalize ${severityColor(warning.severity)}`}>
                        {warning.severity}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{formatTimeAgo(warning.created_at)}</span>
                      <button
                        onClick={() => handleDeleteWarning(warning.id)}
                        disabled={deletingId === warning.id}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        {deletingId === warning.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}

      {/* Refresh button */}
      <button
        onClick={onFetch}
        disabled={loading}
        className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm disabled:opacity-50"
      >
        {loading ? 'Refreshing...' : 'Refresh Memory'}
      </button>
    </div>
  )
}

// Prompt types for panel
interface PromptInfo {
  id: string
  name: string
  description: string
  agent: string
  templateVariables: string[]
  content: string
  customContent?: string
  effectiveContent?: string
  isCustomized: boolean
  contentLength?: number
}

function PromptsPanel({
  prompts,
  loading,
  selectedPrompt,
  selectedPromptLoading,
  onFetchPrompts,
  onFetchPrompt,
  onUpdatePrompt,
  onResetPrompt,
  initialPromptId,
}: {
  prompts: PromptInfo[]
  loading: boolean
  selectedPrompt: PromptInfo | null
  selectedPromptLoading: boolean
  onFetchPrompts: () => void
  onFetchPrompt: (id: string) => Promise<void>
  onUpdatePrompt: (id: string, content: string) => Promise<void>
  onResetPrompt: (id: string) => Promise<void>
  initialPromptId?: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialPromptId || null)
  const [editMode, setEditMode] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Fetch prompts on mount
  useEffect(() => {
    onFetchPrompts()
  }, [onFetchPrompts])

  // Load selected prompt when ID changes
  useEffect(() => {
    if (selectedId) {
      onFetchPrompt(selectedId)
    }
  }, [selectedId, onFetchPrompt])

  // Reset edit state when prompt loads
  useEffect(() => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.effectiveContent || selectedPrompt.content)
    }
  }, [selectedPrompt])

  const handleSave = async () => {
    if (!selectedId || !editedContent) return
    setSaveStatus('saving')
    try {
      await onUpdatePrompt(selectedId, editedContent)
      setSaveStatus('saved')
      setEditMode(false)
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }

  const handleReset = async () => {
    if (!selectedId) return
    if (!confirm('Reset this prompt to its default content?')) return
    try {
      await onResetPrompt(selectedId)
      setEditMode(false)
    } catch {
      // Error handled in store
    }
  }

  const handleCancel = () => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.effectiveContent || selectedPrompt.content)
    }
    setEditMode(false)
    setSaveStatus('idle')
  }

  // Group prompts by agent
  const promptsByAgent = prompts.reduce<Record<string, PromptInfo[]>>((acc, p) => {
    const arr = acc[p.agent] || []
    arr.push(p)
    acc[p.agent] = arr
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-zinc-800 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-semibold text-blue-400">{prompts.length}</div>
            <div className="text-xs text-zinc-500">Total Prompts</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-amber-400">
              {prompts.filter(p => p.isCustomized).length}
            </div>
            <div className="text-xs text-zinc-500">Customized</div>
          </div>
        </div>
      </div>

      {/* Prompt list or detail view */}
      {selectedId && selectedPrompt ? (
        <div className="space-y-4">
          {/* Back button */}
          <button
            onClick={() => {
              setSelectedId(null)
              setEditMode(false)
              setSaveStatus('idle')
            }}
            className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to list
          </button>

          {/* Prompt header */}
          <div className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-sm font-medium text-zinc-100">{selectedPrompt.name}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{selectedPrompt.description}</p>
              </div>
              {selectedPrompt.isCustomized && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                  Customized
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>Agent: <span className="text-zinc-300 capitalize">{selectedPrompt.agent}</span></span>
              {selectedPrompt.templateVariables.length > 0 && (
                <span>
                  Variables: {selectedPrompt.templateVariables.slice(0, 3).join(', ')}
                  {selectedPrompt.templateVariables.length > 3 && '...'}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase font-medium">
                {editMode ? 'Edit Prompt' : 'Content'}
              </span>
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Edit
                </button>
              )}
            </div>

            {editMode ? (
              <textarea
                value={editedContent}
                onChange={(e) => {
                  setEditedContent(e.target.value)
                  setSaveStatus('idle')
                }}
                className="w-full h-64 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono resize-none focus:outline-none focus:border-zinc-600"
                placeholder="Enter prompt content..."
              />
            ) : (
              <div className="bg-zinc-800 rounded-lg p-3 max-h-64 overflow-y-auto">
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">
                  {selectedPrompt.effectiveContent || selectedPrompt.content}
                </pre>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {editMode ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={selectedPromptLoading || editedContent === (selectedPrompt.effectiveContent || selectedPrompt.content)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  saveStatus === 'saved'
                    ? 'bg-green-500/20 text-green-400'
                    : saveStatus === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                } disabled:opacity-50`}
              >
                {saveStatus === 'saving' ? 'Saving...' :
                 saveStatus === 'saved' ? 'Saved!' :
                 saveStatus === 'error' ? 'Error' :
                 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm hover:bg-zinc-600"
              >
                Cancel
              </button>
            </div>
          ) : selectedPrompt.isCustomized ? (
            <button
              onClick={handleReset}
              disabled={selectedPromptLoading}
              className="w-full px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-50"
            >
              Reset to Default
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Prompt list by agent */}
          {loading && prompts.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">Loading prompts...</div>
          ) : (
            Object.entries(promptsByAgent).map(([agent, agentPrompts]) => (
              <div key={agent}>
                <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2 capitalize">
                  {agent} Agent
                </h3>
                <div className="space-y-2">
                  {agentPrompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      onClick={() => setSelectedId(prompt.id)}
                      className="w-full bg-zinc-800 rounded-lg p-3 text-left hover:bg-zinc-750 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200">{prompt.name}</div>
                          <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                            {prompt.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {prompt.isCustomized && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                              Custom
                            </span>
                          )}
                          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Refresh button */}
      {!selectedId && (
        <button
          onClick={onFetchPrompts}
          disabled={loading}
          className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Prompts'}
        </button>
      )}
    </div>
  )
}

// Log entry type for LiveLogViewer
interface LogEntry {
  chunk: string
  timestamp: string
  stream: 'stdout' | 'stderr'
}

function LiveLogViewer({
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

// =============================================================================
// Repos Panel
// =============================================================================

interface Repo {
  id: string
  path: string
  name: string
  description?: string
  language?: string
  mode: 'auto' | 'align'
  weight: number
  created_at: string
  last_scanned_at?: string
}

// Directory browser result types
interface BrowseDirectory {
  name: string
  path: string
  isGitRepo: boolean
  isHidden: boolean
}

interface BrowseResult {
  current: string
  parent: string | null
  directories: BrowseDirectory[]
  isGitRepo: boolean
}

function ReposPanel({
  repos,
  loading,
  onFetch,
  onUpdate,
  onDelete,
  onAdd,
  onBrowse,
}: {
  repos: Repo[]
  loading: boolean
  onFetch: () => Promise<void>
  onUpdate: (id: string, updates: { description?: string; mode?: 'auto' | 'align'; weight?: number }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: (path: string, description?: string) => Promise<void>
  onBrowse: (path?: string) => Promise<BrowseResult>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedWeight, setEditedWeight] = useState<number>(50)
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({})
  const [showBrowser, setShowBrowser] = useState(false)
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [addingRepo, setAddingRepo] = useState<string | null>(null)

  // Fetch repos on mount
  useEffect(() => {
    onFetch()
  }, [onFetch])

  // Browse to a directory
  const browseTo = async (path?: string) => {
    setBrowseLoading(true)
    setBrowseError(null)
    try {
      const result = await onBrowse(path)
      setBrowseResult(result)
    } catch (error) {
      setBrowseError((error as Error).message)
    } finally {
      setBrowseLoading(false)
    }
  }

  // Open folder browser
  const openBrowser = () => {
    setShowBrowser(true)
    browseTo()
  }

  // Add a repo
  const handleAddRepo = async (path: string) => {
    setAddingRepo(path)
    try {
      await onAdd(path)
      setShowBrowser(false)
      setBrowseResult(null)
    } catch (error) {
      setBrowseError((error as Error).message)
    } finally {
      setAddingRepo(null)
    }
  }

  const handleWeightChange = (id: string, weight: number) => {
    setEditingId(id)
    setEditedWeight(weight)
  }

  const handleWeightSave = async (id: string) => {
    setSaveStatus(prev => ({ ...prev, [id]: 'saving' }))
    try {
      await onUpdate(id, { weight: editedWeight })
      setSaveStatus(prev => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [id]: 'idle' })), 1500)
    } catch {
      setSaveStatus(prev => ({ ...prev, [id]: 'idle' }))
    }
    setEditingId(null)
  }

  const handleModeToggle = async (repo: Repo) => {
    const newMode = repo.mode === 'auto' ? 'align' : 'auto'
    await onUpdate(repo.id, { mode: newMode })
  }

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Remove ${name} from network?`)) {
      await onDelete(id)
    }
  }

  // Calculate total weight for percentage display
  const totalWeight = repos.reduce((sum, r) => sum + (r.weight ?? 50), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{repos.length} repos in network</span>
        <div className="flex gap-2">
          <button
            onClick={openBrowser}
            className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-500"
          >
            + Add
          </button>
          <button
            onClick={onFetch}
            disabled={loading}
            className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Weight distribution info */}
      {repos.length > 0 && (
        <div className="bg-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-2">Weight Distribution (Discovery Selection)</div>
          <div className="h-3 rounded-full overflow-hidden flex">
            {repos.map((repo, idx) => {
              const pct = totalWeight > 0 ? ((repo.weight ?? 50) / totalWeight) * 100 : 0
              const colors = [
                'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
                'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500',
              ]
              return (
                <div
                  key={repo.id}
                  className={`${colors[idx % colors.length]} h-full`}
                  style={{ width: `${pct}%` }}
                  title={`${repo.name}: ${Math.round(pct)}%`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {repos.slice(0, 6).map((repo, idx) => {
              const pct = totalWeight > 0 ? ((repo.weight ?? 50) / totalWeight) * 100 : 0
              const colors = [
                'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
                'bg-pink-500', 'bg-cyan-500',
              ]
              return (
                <div key={repo.id} className="flex items-center gap-1 text-xs">
                  <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                  <span className="text-zinc-400">{repo.name}</span>
                  <span className="text-zinc-500">({Math.round(pct)}%)</span>
                </div>
              )
            })}
            {repos.length > 6 && (
              <span className="text-xs text-zinc-500">+{repos.length - 6} more</span>
            )}
          </div>
        </div>
      )}

      {/* Repos list */}
      <div className="space-y-2">
        {repos.map((repo) => (
          <div key={repo.id} className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-zinc-200">{repo.name}</div>
                <div className="text-xs text-zinc-500 font-mono">{repo.path}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  repo.mode === 'auto'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {repo.mode}
                </span>
                {repo.language && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                    {repo.language}
                  </span>
                )}
              </div>
            </div>

            {repo.description && (
              <p className="text-xs text-zinc-400 mb-2">{repo.description}</p>
            )}

            {/* Weight slider */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-zinc-500 w-12">Weight:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={editingId === repo.id ? editedWeight : (repo.weight ?? 50)}
                onChange={(e) => handleWeightChange(repo.id, parseInt(e.target.value))}
                onMouseUp={() => handleWeightSave(repo.id)}
                onTouchEnd={() => handleWeightSave(repo.id)}
                className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-zinc-300 w-8 text-right">
                {editingId === repo.id ? editedWeight : (repo.weight ?? 50)}
              </span>
              {saveStatus[repo.id] === 'saving' && (
                <span className="text-xs text-zinc-500">...</span>
              )}
              {saveStatus[repo.id] === 'saved' && (
                <span className="text-xs text-green-400">Saved</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => handleModeToggle(repo)}
                className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
              >
                Switch to {repo.mode === 'auto' ? 'align' : 'auto'}
              </button>
              <button
                onClick={() => handleDelete(repo.id, repo.name)}
                className="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
              >
                Remove
              </button>
            </div>

            {/* Last scanned */}
            {repo.last_scanned_at && (
              <div className="text-xs text-zinc-500 mt-2">
                Last scanned: {new Date(repo.last_scanned_at).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {repos.length === 0 && !loading && !showBrowser && (
        <div className="text-center py-8 text-zinc-500">
          <p className="mb-3">No repos in network yet</p>
          <button
            onClick={openBrowser}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
          >
            Add Repository
          </button>
        </div>
      )}

      {/* Folder Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Browser Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-semibold text-zinc-100">Select Repository Folder</h3>
              <button
                onClick={() => { setShowBrowser(false); setBrowseResult(null); setBrowseError(null) }}
                className="text-zinc-400 hover:text-zinc-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Current Path */}
            {browseResult && (
              <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                  {browseResult.parent && (
                    <button
                      onClick={() => browseTo(browseResult.parent!)}
                      className="p-1 hover:bg-zinc-700 rounded"
                      title="Go up"
                    >
                      <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}
                  <code className="text-xs text-zinc-400 flex-1 truncate">{browseResult.current}</code>
                  {browseResult.isGitRepo && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Git Repo</span>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {browseError && (
              <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm">
                {browseError}
              </div>
            )}

            {/* Directory List */}
            <div className="flex-1 overflow-y-auto p-2">
              {browseLoading ? (
                <div className="text-center py-8 text-zinc-500">Loading...</div>
              ) : browseResult ? (
                <div className="space-y-1">
                  {browseResult.directories
                    .filter(dir => showHidden || !dir.isHidden)
                    .map((dir) => (
                    <div
                      key={dir.path}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-zinc-800 ${
                        dir.isGitRepo ? 'bg-zinc-800/50' : ''
                      }`}
                      onClick={() => browseTo(dir.path)}
                    >
                      <span className="text-lg">{dir.isGitRepo ? '📁' : '📂'}</span>
                      <span className={`flex-1 text-sm ${dir.isHidden ? 'text-zinc-500' : 'text-zinc-200'}`}>
                        {dir.name}
                      </span>
                      {dir.isGitRepo && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddRepo(dir.path) }}
                          disabled={addingRepo === dir.path || repos.some(r => r.path === dir.path)}
                          className={`px-2 py-1 rounded text-xs ${
                            repos.some(r => r.path === dir.path)
                              ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-500'
                          }`}
                        >
                          {addingRepo === dir.path ? '...' : repos.some(r => r.path === dir.path) ? 'Added' : 'Add'}
                        </button>
                      )}
                    </div>
                  ))}
                  {browseResult.directories.filter(dir => showHidden || !dir.isHidden).length === 0 && (
                    <div className="text-center py-4 text-zinc-500 text-sm">No subdirectories</div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Browser Footer */}
            <div className="flex items-center justify-between p-3 border-t border-zinc-700">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                  className="rounded bg-zinc-700 border-zinc-600"
                />
                Show hidden
              </label>
              {browseResult?.isGitRepo && !repos.some(r => r.path === browseResult.current) && (
                <button
                  onClick={() => handleAddRepo(browseResult.current)}
                  disabled={!!addingRepo}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50"
                >
                  {addingRepo ? 'Adding...' : 'Add Current Folder'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Inventory Panel
// =============================================================================

interface Skill {
  name: string
  description: string
  path: string
}

interface McpServer {
  name: string
  command: string
  args?: string[]
}

interface Inventory {
  skills: Skill[]
  mcps: McpServer[]
  skills_count: number
  mcps_count: number
}

function InventoryPanel({
  inventory,
  loading,
  onFetch,
  onTriggerArmory,
}: {
  inventory: Inventory | null
  loading: boolean
  onFetch: () => Promise<void>
  onTriggerArmory: (force?: boolean) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<'skills' | 'mcps'>('skills')
  const [triggerStatus, setTriggerStatus] = useState<'idle' | 'triggering' | 'triggered'>('idle')

  // Fetch inventory on mount
  useEffect(() => {
    onFetch()
  }, [onFetch])

  const handleTriggerArmory = async (force = false) => {
    setTriggerStatus('triggering')
    try {
      await onTriggerArmory(force)
      setTriggerStatus('triggered')
      setTimeout(() => setTriggerStatus('idle'), 2000)
    } catch {
      setTriggerStatus('idle')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          {inventory ? `${inventory.skills_count} skills, ${inventory.mcps_count} MCPs` : 'Loading...'}
        </div>
        <button
          onClick={() => onFetch()}
          disabled={loading}
          className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Armory trigger */}
      <div className="bg-zinc-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-medium text-zinc-200">Armory Agent</div>
            <div className="text-xs text-zinc-500">Analyzes tasks and installs missing skills/MCPs</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleTriggerArmory(false)}
            disabled={triggerStatus !== 'idle'}
            className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 disabled:opacity-50"
          >
            {triggerStatus === 'triggering' ? 'Triggering...' : triggerStatus === 'triggered' ? 'Triggered!' : 'Run Armory'}
          </button>
          <button
            onClick={() => handleTriggerArmory(true)}
            disabled={triggerStatus !== 'idle'}
            className="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded text-sm hover:bg-zinc-600 disabled:opacity-50"
          >
            Force Run
          </button>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
            activeTab === 'skills'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          Skills ({inventory?.skills_count ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('mcps')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
            activeTab === 'mcps'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          MCPs ({inventory?.mcps_count ?? 0})
        </button>
      </div>

      {/* Skills list */}
      {activeTab === 'skills' && (
        <div className="space-y-2">
          {inventory?.skills.map((skill) => (
            <div key={skill.name} className="bg-zinc-800 rounded-lg p-3">
              <div className="text-sm font-medium text-zinc-200">{skill.name}</div>
              <div className="text-xs text-zinc-400 mt-1">{skill.description}</div>
              <div className="text-xs text-zinc-500 font-mono mt-1">{skill.path}</div>
            </div>
          ))}
          {inventory?.skills.length === 0 && (
            <div className="text-center py-6 text-zinc-500 text-sm">
              No skills installed. Armory will install skills as needed.
            </div>
          )}
        </div>
      )}

      {/* MCPs list */}
      {activeTab === 'mcps' && (
        <div className="space-y-2">
          {inventory?.mcps.map((mcp) => (
            <div key={mcp.name} className="bg-zinc-800 rounded-lg p-3">
              <div className="text-sm font-medium text-zinc-200">{mcp.name}</div>
              <div className="text-xs text-zinc-500 font-mono mt-1">
                {mcp.command} {mcp.args?.join(' ')}
              </div>
            </div>
          ))}
          {inventory?.mcps.length === 0 && (
            <div className="text-center py-6 text-zinc-500 text-sm">
              No MCP servers configured.
            </div>
          )}
        </div>
      )}

      {/* Managed indicator */}
      <div className="text-xs text-zinc-500 text-center">
        Managed by Armory Agent
      </div>
    </div>
  )
}

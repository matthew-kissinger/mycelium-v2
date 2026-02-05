/**
 * SchedulerPanel - Scheduler status and configuration
 */

import { useEffect, useState } from 'react'
import { ConfigInput, ConfigToggle } from './components/ConfigControls'

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
  shepherd_enabled: boolean
  shepherd_batch_size: number
  armory_enabled: boolean
  armory_batch_size: number
  digest_enabled: boolean
  digest_interval_sec: number
  compaction_enabled: boolean
  compaction_interval_sec: number
  auto_prune_enabled: boolean
  auto_prune_threshold: number
  auto_prune_keep: number
}

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

export function SchedulerPanel({
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
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Memory Compaction (Haiku Agent)</h4>
              <div className="space-y-3">
                <ConfigToggle
                  label="Enabled"
                  value={getValue('compaction_enabled') as boolean}
                  onChange={(v) => handleConfigChange('compaction_enabled', v)}
                />
                <ConfigInput
                  label="Interval"
                  value={getValue('compaction_interval_sec')}
                  onChange={(v) => handleConfigChange('compaction_interval_sec', v)}
                  min={3600}
                  max={86400}
                  suffix="sec"
                  hint={formatSeconds(getValue('compaction_interval_sec') as number)}
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

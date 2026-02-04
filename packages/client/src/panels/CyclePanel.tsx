/**
 * CyclePanel - Individual cycle details and configuration
 */

import { useEffect, useState } from 'react'

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

export function CyclePanel({
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

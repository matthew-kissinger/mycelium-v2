/**
 * Connection Store - SSE EventSource management
 *
 * Owns the single EventSource and dispatches events to domain stores.
 * Includes auto-reconnect with exponential backoff.
 */

import { create } from 'zustand'
import { useSchedulerStore } from './schedulerStore'
import { useTaskStore } from './taskStore'
import { useSignalStore } from './signalStore'
import { useMemoryStore } from './memoryStore'
import { useRepoStore } from './repoStore'
import { useInventoryStore } from './inventoryStore'
import { useAgentStore } from './agentStore'
import { useRegistryStore } from './registryStore'
import { useGitHubStore } from './githubStore'
import { useMaxAlignmentStore } from './maxAlignmentStore'

// Reconnect constants
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const RECONNECT_MAX_ATTEMPTS = 10

interface ConnectionState {
  connected: boolean
  eventSource: EventSource | null
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null

  connectSSE: () => void
  disconnectSSE: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connected: false,
  eventSource: null,
  reconnectAttempts: 0,
  reconnectTimer: null,

  connectSSE: () => {
    if (get().eventSource) return

    const eventSource = new EventSource('/api/events')

    eventSource.addEventListener('connected', () => {
      set({ connected: true, reconnectAttempts: 0 })
    })

    // Scheduler events
    eventSource.addEventListener('scheduler:started', () => {
      useSchedulerStore.getState().fetchSchedulerStatus()
    })
    eventSource.addEventListener('scheduler:stopped', () => {
      useSchedulerStore.getState().fetchSchedulerStatus()
    })

    // Task events
    eventSource.addEventListener('task:started', () => {
      useTaskStore.getState().fetchRunningTasks()
      useTaskStore.getState().fetchStats()
    })
    eventSource.addEventListener('task:completed', () => {
      useTaskStore.getState().fetchRunningTasks()
      useTaskStore.getState().fetchStats()
    })
    eventSource.addEventListener('task:failed', () => {
      useTaskStore.getState().fetchRunningTasks()
      useTaskStore.getState().fetchStats()
    })
    eventSource.addEventListener('task:created', () => {
      useTaskStore.getState().fetchStats()
    })

    // Task output (live logs)
    eventSource.addEventListener('task:output', (event) => {
      try {
        const data = JSON.parse(event.data)
        const taskId = data.task_id || data.id
        if (taskId && data.chunk) {
          useTaskStore.getState().appendTaskLog(taskId, {
            chunk: data.chunk,
            timestamp: data.timestamp || new Date().toISOString(),
            stream: data.stream || 'stdout',
          })
        }
      } catch {
        // Ignore parse errors
      }
    })

    // System agent events
    eventSource.addEventListener('agent:started', () => {
      useSchedulerStore.getState().fetchRunningSystemAgents()
    })
    eventSource.addEventListener('agent:completed', (event) => {
      useSchedulerStore.getState().fetchRunningSystemAgents()
      useTaskStore.getState().fetchStats()
      try {
        const data = JSON.parse(event.data)
        if (data.agent_type === 'shepherd') {
          useSchedulerStore.getState().fetchShepherdStatus()
        }
        if (data.agent_type === 'armory') {
          useInventoryStore.getState().fetchInventory()
        }
      } catch {
        // Ignore parse errors
      }
    })
    eventSource.addEventListener('agent:failed', () => {
      useSchedulerStore.getState().fetchRunningSystemAgents()
    })

    // Signal events
    eventSource.addEventListener('signal:created', () => {
      useSignalStore.getState().fetchSignals()
    })
    eventSource.addEventListener('signal:responded', () => {
      useSignalStore.getState().fetchSignals()
    })
    eventSource.addEventListener('signal:expired', () => {
      useSignalStore.getState().fetchSignals()
    })

    // Task events - additional
    eventSource.addEventListener('task:retrying', () => {
      useTaskStore.getState().fetchStats()
      useTaskStore.getState().fetchRunningTasks()
    })
    eventSource.addEventListener('task:deleted', () => {
      useTaskStore.getState().fetchStats()
    })
    eventSource.addEventListener('task:updated', () => {
      useTaskStore.getState().fetchStats()
    })
    eventSource.addEventListener('task:cancelled', () => {
      useTaskStore.getState().fetchStats()
      useTaskStore.getState().fetchRunningTasks()
    })
    eventSource.addEventListener('task:skipped', () => {
      useTaskStore.getState().fetchStats()
    })

    // Memory events
    eventSource.addEventListener('memory:pattern_created', () => {
      useMemoryStore.getState().fetchMemoryDetails()
    })
    eventSource.addEventListener('memory:warning_created', () => {
      useMemoryStore.getState().fetchMemoryDetails()
    })
    eventSource.addEventListener('memory:pattern_deleted', () => {
      useMemoryStore.getState().fetchMemoryDetails()
    })
    eventSource.addEventListener('memory:warning_deleted', () => {
      useMemoryStore.getState().fetchMemoryDetails()
    })
    eventSource.addEventListener('memory:compaction_completed', () => {
      useMemoryStore.getState().fetchMemoryDetails()
    })

    // Repo events
    eventSource.addEventListener('repo:added', () => {
      useRepoStore.getState().fetchRepos()
    })
    eventSource.addEventListener('repo:updated', () => {
      useRepoStore.getState().fetchRepos()
    })
    eventSource.addEventListener('repo:removed', () => {
      useRepoStore.getState().fetchRepos()
    })

    // Agent health events
    eventSource.addEventListener('agent:quota_exceeded', () => {
      useAgentStore.getState().fetchHealth()
      useSchedulerStore.getState().fetchSchedulerStatus()
    })
    eventSource.addEventListener('agent:quota_reset', () => {
      useAgentStore.getState().fetchHealth()
      useSchedulerStore.getState().fetchSchedulerStatus()
    })

    // Scheduler cycle events
    eventSource.addEventListener('scheduler:cycle:completed', () => {
      useSchedulerStore.getState().fetchSchedulerStatus()
    })

    // Registry events
    eventSource.addEventListener('registry:agent_detected', () => {
      useRegistryStore.getState().fetchAgents()
    })
    eventSource.addEventListener('registry:provider_refreshed', () => {
      useRegistryStore.getState().fetchProviders()
      useRegistryStore.getState().fetchModels()
    })
    eventSource.addEventListener('registry:refreshed', () => {
      useRegistryStore.getState().fetchAgents()
      useRegistryStore.getState().fetchProviders()
      useRegistryStore.getState().fetchModels()
    })
    eventSource.addEventListener('registry:agent_status', () => {
      useRegistryStore.getState().fetchAgents()
      useRegistryStore.getState().fetchHealth()
    })

    // GitHub events
    eventSource.addEventListener('github:pr_created', (event) => {
      try {
        const data = JSON.parse(event.data)
        useGitHubStore.getState().addPR({
          repo_path: data.repo_path,
          pr_number: data.pr_number,
          pr_url: data.pr_url,
          branch: data.branch,
          title: data.title,
          status: 'open',
          timestamp: data.timestamp || new Date().toISOString(),
        })
      } catch {
        // Ignore parse errors
      }
    })
    eventSource.addEventListener('github:pr_merged', (event) => {
      try {
        const data = JSON.parse(event.data)
        useGitHubStore.getState().updatePR(data.repo_path, data.pr_number, { status: 'merged' })
      } catch {
        // Ignore parse errors
      }
    })
    eventSource.addEventListener('github:workflow_triggered', () => {
      useGitHubStore.getState().fetchRepos()
    })
    eventSource.addEventListener('github:rulesets_applied', () => {
      useGitHubStore.getState().fetchRepos()
    })

    // Max Alignment events
    eventSource.addEventListener('max_alignment:started', (event) => {
      try {
        const data = JSON.parse(event.data)
        useMaxAlignmentStore.getState().setRunning(data.repo_path || data.repo)
      } catch {
        // Ignore parse errors
      }
    })
    eventSource.addEventListener('max_alignment:completed', (event) => {
      try {
        const data = JSON.parse(event.data)
        useMaxAlignmentStore.getState().setCompleted({
          repo_path: data.repo_path,
          repo_name: data.repo_name || data.repo_path?.split('/').pop() || '',
          health: data.health || 'warning',
          headline: data.headline || 'Completed',
          findings: data.findings || [],
          timestamp: data.timestamp || new Date().toISOString(),
          duration_seconds: data.duration_seconds,
        })
      } catch {
        // Ignore parse errors
      }
    })
    eventSource.addEventListener('max_alignment:failed', (event) => {
      try {
        const data = JSON.parse(event.data)
        useMaxAlignmentStore.getState().setFailed(data.error || 'Unknown error')
      } catch {
        // Ignore parse errors
      }
    })
    eventSource.addEventListener('max_alignment:finding', (event) => {
      try {
        const data = JSON.parse(event.data)
        useMaxAlignmentStore.getState().addFinding(data)
      } catch {
        // Ignore parse errors
      }
    })

    // Error handling with auto-reconnect
    eventSource.onerror = () => {
      set({ connected: false })

      // Clean up the failed connection
      eventSource.close()
      set({ eventSource: null })

      // Attempt reconnect with exponential backoff
      const { reconnectAttempts } = get()
      if (reconnectAttempts < RECONNECT_MAX_ATTEMPTS) {
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
          RECONNECT_MAX_MS
        )
        console.log(
          `[SSE] Connection lost. Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${RECONNECT_MAX_ATTEMPTS})`
        )
        const timer = setTimeout(() => {
          set({ reconnectAttempts: reconnectAttempts + 1, reconnectTimer: null })
          get().connectSSE()
        }, delay)
        set({ reconnectTimer: timer })
      } else {
        console.error(`[SSE] Max reconnect attempts (${RECONNECT_MAX_ATTEMPTS}) reached. Giving up.`)
      }
    }

    set({ eventSource })
  },

  disconnectSSE: () => {
    const { eventSource, reconnectTimer } = get()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }
    if (eventSource) {
      eventSource.close()
    }
    set({ eventSource: null, connected: false, reconnectAttempts: 0, reconnectTimer: null })
  },
}))

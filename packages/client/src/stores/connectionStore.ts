/**
 * Connection Store - SSE EventSource management
 *
 * Owns the single EventSource and dispatches events to domain stores.
 */

import { create } from 'zustand'
import { useSchedulerStore } from './schedulerStore'
import { useTaskStore } from './taskStore'
import { useSignalStore } from './signalStore'
import { useMemoryStore } from './memoryStore'
import { useRepoStore } from './repoStore'
import { useInventoryStore } from './inventoryStore'

interface ConnectionState {
  connected: boolean
  eventSource: EventSource | null

  connectSSE: () => void
  disconnectSSE: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connected: false,
  eventSource: null,

  connectSSE: () => {
    if (get().eventSource) return

    const eventSource = new EventSource('/api/events')

    eventSource.addEventListener('connected', () => {
      set({ connected: true })
    })

    // Scheduler events
    eventSource.addEventListener('scheduler:started', () => {
      useSchedulerStore.getState().fetchSchedulerStatus()
    })
    eventSource.addEventListener('scheduler:stopped', () => {
      useSchedulerStore.getState().fetchSchedulerStatus()
    })
    eventSource.addEventListener('scheduler:cycle', () => {
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
    eventSource.addEventListener('system:agent_started', () => {
      useSchedulerStore.getState().fetchRunningSystemAgents()
    })
    eventSource.addEventListener('agent:completed', (event) => {
      useSchedulerStore.getState().fetchRunningSystemAgents()
      useTaskStore.getState().fetchStats()
      // Refresh shepherd status when shepherd completes (updates unevaluated counts)
      // Refresh inventory when armory completes
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

    // Memory events - fetch both counts and grouped details
    eventSource.addEventListener('memory:updated', () => {
      useMemoryStore.getState().fetchMemory()
      useMemoryStore.getState().fetchMemoryDetails()
    })
    eventSource.addEventListener('memory:pattern_created', () => {
      useMemoryStore.getState().fetchMemory()
      useMemoryStore.getState().fetchMemoryDetails()
    })
    eventSource.addEventListener('memory:warning_created', () => {
      useMemoryStore.getState().fetchMemory()
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

    // Error handling
    eventSource.onerror = () => {
      set({ connected: false })
    }

    set({ eventSource })
  },

  disconnectSSE: () => {
    const { eventSource } = get()
    if (eventSource) {
      eventSource.close()
      set({ eventSource: null, connected: false })
    }
  },
}))

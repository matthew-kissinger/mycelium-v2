/**
 * Scheduler Store - scheduler status, config, running system agents
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import { useUIStore } from './uiStore'
import type { SchedulerStatus, SchedulerConfig, RunningSystemAgent } from '../types'

interface SchedulerState {
  scheduler: SchedulerStatus | null
  schedulerLoading: boolean
  schedulerError: string | null
  schedulerConfig: SchedulerConfig | null
  schedulerConfigLoading: boolean
  runningSystemAgents: RunningSystemAgent[]

  // Actions
  fetchSchedulerStatus: () => Promise<void>
  startScheduler: () => Promise<void>
  stopScheduler: () => Promise<void>
  triggerCycle: (cycleName: string) => Promise<void>
  fetchSchedulerConfig: () => Promise<void>
  updateSchedulerConfig: (updates: Partial<SchedulerConfig>) => Promise<void>
  fetchRunningSystemAgents: () => Promise<void>
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  scheduler: null,
  schedulerLoading: false,
  schedulerError: null,
  schedulerConfig: null,
  schedulerConfigLoading: false,
  runningSystemAgents: [],

  fetchSchedulerStatus: async () => {
    try {
      const status = await fetchAPI<SchedulerStatus>('/scheduler/status')
      set({ scheduler: status })
    } catch (error) {
      console.error('Failed to fetch scheduler status:', error)
    }
  },

  startScheduler: async () => {
    try {
      set({ schedulerLoading: true, schedulerError: null })
      const status = await fetchAPI<SchedulerStatus>('/scheduler/start', { method: 'POST' })
      set({ scheduler: status })
      useUIStore.getState().addToast('success', 'Scheduler started')
    } catch (error) {
      set({ schedulerError: (error as Error).message })
      useUIStore.getState().addToast('error', `Failed to start scheduler: ${(error as Error).message}`)
    } finally {
      set({ schedulerLoading: false })
    }
  },

  stopScheduler: async () => {
    try {
      set({ schedulerLoading: true, schedulerError: null })
      const status = await fetchAPI<SchedulerStatus>('/scheduler/stop', { method: 'POST' })
      set({ scheduler: status })
      useUIStore.getState().addToast('info', 'Scheduler stopped')
    } catch (error) {
      set({ schedulerError: (error as Error).message })
      useUIStore.getState().addToast('error', `Failed to stop scheduler: ${(error as Error).message}`)
    } finally {
      set({ schedulerLoading: false })
    }
  },

  triggerCycle: async (cycleName) => {
    try {
      const endpoints: Record<string, string> = {
        discovery: '/discovery/trigger',
        sequencer: '/sequencer/trigger',
        shepherd: '/shepherd/trigger',
        armory: '/inventory/armory',
        dispatcher: '/queue/run-next',
      }
      const endpoint = endpoints[cycleName]
      if (endpoint) {
        await fetchAPI(endpoint, { method: 'POST', body: JSON.stringify({}) })
        await get().fetchSchedulerStatus()
      }
    } catch (error) {
      console.error(`Failed to trigger ${cycleName}:`, error)
    }
  },

  fetchSchedulerConfig: async () => {
    try {
      set({ schedulerConfigLoading: true })
      const response = await fetchAPI<{ config: SchedulerConfig }>('/config/scheduler')
      set({ schedulerConfig: response.config })
    } catch (error) {
      console.error('Failed to fetch scheduler config:', error)
    } finally {
      set({ schedulerConfigLoading: false })
    }
  },

  updateSchedulerConfig: async (updates) => {
    try {
      set({ schedulerConfigLoading: true })
      const response = await fetchAPI<{ config: SchedulerConfig }>('/config/scheduler', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      set({ schedulerConfig: response.config })
    } catch (error) {
      console.error('Failed to update scheduler config:', error)
      throw error
    } finally {
      set({ schedulerConfigLoading: false })
    }
  },

  fetchRunningSystemAgents: async () => {
    try {
      const health = await fetchAPI<{ running_system_agents: RunningSystemAgent[] }>('/health')
      set({ runningSystemAgents: health.running_system_agents || [] })
    } catch (error) {
      console.error('Failed to fetch running system agents:', error)
    }
  },
}))

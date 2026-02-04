/**
 * Agent Store - agent configurations
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import type { AgentConfigData } from '../types'

interface AgentState {
  agentConfigs: Record<string, AgentConfigData>
  agentConfigsLoading: boolean

  fetchAgentConfigs: () => Promise<void>
  updateAgentConfig: (agentName: string, updates: Partial<AgentConfigData>) => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agentConfigs: {},
  agentConfigsLoading: false,

  fetchAgentConfigs: async () => {
    try {
      set({ agentConfigsLoading: true })
      const response = await fetchAPI<{ agents: Record<string, AgentConfigData> }>('/config/agents')
      set({ agentConfigs: response.agents })
    } catch (error) {
      console.error('Failed to fetch agent configs:', error)
    } finally {
      set({ agentConfigsLoading: false })
    }
  },

  updateAgentConfig: async (agentName, updates) => {
    try {
      set({ agentConfigsLoading: true })
      await fetchAPI(`/config/agents/${agentName}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      await get().fetchAgentConfigs()
    } catch (error) {
      console.error('Failed to update agent config:', error)
      throw error
    } finally {
      set({ agentConfigsLoading: false })
    }
  },
}))

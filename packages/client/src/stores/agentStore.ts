/**
 * Agent Store - agent configurations and health tracking
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import type { AgentConfigData } from '../types'

// Agent health status per agent/model combination
export interface AgentHealthEntry {
  status: 'healthy' | 'degraded' | 'quota_exceeded'
  errorCount: number
  successCount: number
  lastError?: string
  quotaResetAt?: string
}

// Cline-specific credits and provider info
export interface ClineInfo {
  provider: 'openrouter' | 'cline' | null
  openrouter_credits: {
    limit: number
    remaining: number
    usage: number
    isFreeTier: boolean
  } | null
  cline_credits: number | null
  free_models: string[]
}

// Agent performance stats from task history
export interface AgentStatsEntry {
  total_tasks: number
  successful: number
  failed: number
  success_rate: number
  total_cost_usd: number
  avg_cost_usd: number
  total_duration_seconds: number
  avg_duration_seconds: number
  models_used: Record<string, number>
}

export interface AgentStatsResponse {
  agents: Record<string, AgentStatsEntry>
  period: {
    start: string | null
    end: string | null
    total_tasks: number
  }
}

interface AgentState {
  agentConfigs: Record<string, AgentConfigData>
  agentConfigsLoading: boolean

  // Health data
  agentHealth: Record<string, AgentHealthEntry>
  clineInfo: ClineInfo | null
  healthLoading: boolean
  healthLastFetched: number | null

  // Agent stats
  agentStats: AgentStatsResponse | null
  agentStatsLoading: boolean

  fetchAgentConfigs: () => Promise<void>
  updateAgentConfig: (agentName: string, updates: Partial<AgentConfigData>) => Promise<void>
  fetchHealth: () => Promise<void>
  fetchAgentStats: () => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agentConfigs: {},
  agentConfigsLoading: false,
  agentHealth: {},
  clineInfo: null,
  healthLoading: false,
  healthLastFetched: null,
  agentStats: null,
  agentStatsLoading: false,

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

  fetchHealth: async () => {
    try {
      set({ healthLoading: true })
      const response = await fetchAPI<{
        agent_health: Record<string, AgentHealthEntry>
        cline: ClineInfo
      }>('/health')
      set({
        agentHealth: response.agent_health || {},
        clineInfo: response.cline || null,
        healthLastFetched: Date.now(),
      })
    } catch (error) {
      console.error('Failed to fetch agent health:', error)
    } finally {
      set({ healthLoading: false })
    }
  },

  fetchAgentStats: async () => {
    try {
      set({ agentStatsLoading: true })
      const response = await fetchAPI<AgentStatsResponse>('/memory/agent-stats')
      set({ agentStats: response })
    } catch (error) {
      console.error('Failed to fetch agent stats:', error)
    } finally {
      set({ agentStatsLoading: false })
    }
  },
}))

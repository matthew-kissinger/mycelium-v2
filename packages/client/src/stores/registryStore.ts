/**
 * Registry Store - agents, providers, models, health, and registry operations
 */

import { create } from 'zustand'
import { fetchAPI } from './api'

// Agent from registry
export interface RegistryAgent {
  id: string
  command: string
  cli_version: string | null
  timeout_seconds: number
  default_provider: string | null
  default_model: string | null
  enabled: boolean
  status: 'online' | 'offline' | 'error'
  notes: string | null
  detected_at: string | null
  updated_at: string | null
}

// Provider from registry
export interface RegistryProvider {
  id: string
  name: string
  api_base: string | null
  billing: 'per_use' | 'subscription' | 'free'
  status: string | null
  credits_info: string | null
  models_fetched_at: string | null
  config: string | null
  updated_at: string | null
}

// Model from registry
export interface RegistryModel {
  id: string
  provider_id: string
  model_id: string
  context_window: number | null
  cost_input: number | null
  cost_output: number | null
  free: boolean
  available: boolean
  compatible_agents: string | null
  fallback_model_id: string | null
  updated_at: string | null
}

// Matrix entry
export interface MatrixEntry {
  agent_id: string
  provider_id: string
  model_count: number
  models: string[]
}

// Health summary
export interface RegistryHealth {
  agents: { total: number; online: number; offline: number; error: number }
  providers: { total: number; active: number }
  models: { total: number; free: number; available: number }
}

// Credentials
export interface RegistryCredentials {
  keys: string[]
  count: number
}

// Fallback chain
export interface FallbackChain {
  agent: string
  model: string
  chain: string[]
}

interface RegistryState {
  agents: RegistryAgent[]
  providers: RegistryProvider[]
  models: RegistryModel[]
  matrix: MatrixEntry[] | null
  health: RegistryHealth | null
  credentials: RegistryCredentials | null

  agentsLoading: boolean
  providersLoading: boolean
  modelsLoading: boolean
  matrixLoading: boolean
  healthLoading: boolean
  detectLoading: boolean
  refreshLoading: boolean
  error: string | null

  fetchAgents: () => Promise<void>
  fetchProviders: () => Promise<void>
  fetchModels: (filters?: { agent?: string; provider?: string; free?: boolean }) => Promise<void>
  fetchMatrix: () => Promise<void>
  fetchHealth: () => Promise<void>
  fetchCredentials: () => Promise<void>
  fetchFallbackChain: (agent: string, model: string) => Promise<FallbackChain>
  updateAgent: (id: string, updates: Partial<RegistryAgent>) => Promise<void>
  updateProvider: (id: string, updates: Partial<RegistryProvider>) => Promise<void>
  refreshProvider: (id: string) => Promise<void>
  detectCLIs: () => Promise<void>
  refreshAll: () => Promise<void>
}

export const useRegistryStore = create<RegistryState>((set, get) => ({
  agents: [],
  providers: [],
  models: [],
  matrix: null,
  health: null,
  credentials: null,

  agentsLoading: false,
  providersLoading: false,
  modelsLoading: false,
  matrixLoading: false,
  healthLoading: false,
  detectLoading: false,
  refreshLoading: false,
  error: null,

  fetchAgents: async () => {
    try {
      set({ agentsLoading: true, error: null })
      const agents = await fetchAPI<RegistryAgent[]>('/registry/agents')
      set({ agents })
    } catch (error) {
      console.error('Failed to fetch registry agents:', error)
      set({ error: 'Failed to fetch agents' })
    } finally {
      set({ agentsLoading: false })
    }
  },

  fetchProviders: async () => {
    try {
      set({ providersLoading: true, error: null })
      const providers = await fetchAPI<RegistryProvider[]>('/registry/providers')
      set({ providers })
    } catch (error) {
      console.error('Failed to fetch registry providers:', error)
      set({ error: 'Failed to fetch providers' })
    } finally {
      set({ providersLoading: false })
    }
  },

  fetchModels: async (filters) => {
    try {
      set({ modelsLoading: true, error: null })
      const params = new URLSearchParams()
      if (filters?.agent) params.set('agent', filters.agent)
      if (filters?.provider) params.set('provider', filters.provider)
      if (filters?.free) params.set('free', 'true')
      const query = params.toString()
      const url = query ? `/registry/models?${query}` : '/registry/models'
      const models = await fetchAPI<RegistryModel[]>(url)
      set({ models })
    } catch (error) {
      console.error('Failed to fetch registry models:', error)
      set({ error: 'Failed to fetch models' })
    } finally {
      set({ modelsLoading: false })
    }
  },

  fetchMatrix: async () => {
    try {
      set({ matrixLoading: true, error: null })
      const matrix = await fetchAPI<MatrixEntry[]>('/registry/matrix')
      set({ matrix })
    } catch (error) {
      console.error('Failed to fetch registry matrix:', error)
      set({ error: 'Failed to fetch matrix' })
    } finally {
      set({ matrixLoading: false })
    }
  },

  fetchHealth: async () => {
    try {
      set({ healthLoading: true, error: null })
      const health = await fetchAPI<RegistryHealth>('/registry/health')
      set({ health })
    } catch (error) {
      console.error('Failed to fetch registry health:', error)
      set({ error: 'Failed to fetch health' })
    } finally {
      set({ healthLoading: false })
    }
  },

  fetchCredentials: async () => {
    try {
      const credentials = await fetchAPI<RegistryCredentials>('/registry/credentials')
      set({ credentials })
    } catch (error) {
      console.error('Failed to fetch credentials:', error)
    }
  },

  fetchFallbackChain: async (agent, model) => {
    const chain = await fetchAPI<FallbackChain>(`/registry/fallback/${encodeURIComponent(agent)}/${encodeURIComponent(model)}`)
    return chain
  },

  updateAgent: async (id, updates) => {
    try {
      set({ agentsLoading: true })
      await fetchAPI(`/registry/agents/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      await get().fetchAgents()
    } catch (error) {
      console.error('Failed to update agent:', error)
      throw error
    } finally {
      set({ agentsLoading: false })
    }
  },

  updateProvider: async (id, updates) => {
    try {
      set({ providersLoading: true })
      await fetchAPI(`/registry/providers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      await get().fetchProviders()
    } catch (error) {
      console.error('Failed to update provider:', error)
      throw error
    } finally {
      set({ providersLoading: false })
    }
  },

  refreshProvider: async (id) => {
    try {
      await fetchAPI(`/registry/providers/${encodeURIComponent(id)}/refresh`, {
        method: 'POST',
      })
      await get().fetchProviders()
    } catch (error) {
      console.error('Failed to refresh provider:', error)
      throw error
    }
  },

  detectCLIs: async () => {
    try {
      set({ detectLoading: true, error: null })
      await fetchAPI('/registry/detect', { method: 'POST' })
      await get().fetchAgents()
    } catch (error) {
      console.error('Failed to detect CLIs:', error)
      set({ error: 'CLI detection failed' })
    } finally {
      set({ detectLoading: false })
    }
  },

  refreshAll: async () => {
    try {
      set({ refreshLoading: true, error: null })
      await fetchAPI('/registry/refresh', { method: 'POST' })
    } catch (error) {
      console.error('Failed to refresh registry:', error)
      set({ error: 'Registry refresh failed' })
    } finally {
      set({ refreshLoading: false })
    }
  },
}))

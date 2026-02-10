/**
 * RegistryPanel - Agents, providers, models, and matrix view
 */

import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import {
  useRegistryStore,
  type RegistryAgent,
  type RegistryProvider,
  type RegistryModel,
  type MatrixEntry,
  type RegistryHealth,
} from '../stores/registryStore'

type Tab = 'agents' | 'providers' | 'models' | 'matrix'

export function RegistryPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('agents')
  const [modelAgentFilter, setModelAgentFilter] = useState('')
  const [modelProviderFilter, setModelProviderFilter] = useState('')
  const [modelFreeFilter, setModelFreeFilter] = useState(false)

  const {
    agents,
    providers,
    models,
    matrix,
    health,
    agentsLoading,
    providersLoading,
    modelsLoading,
    matrixLoading,
    healthLoading,
    detectLoading,
    refreshLoading,
    fetchAgents,
    fetchProviders,
    fetchModels,
    fetchMatrix,
    fetchHealth,
    updateAgent,
    refreshProvider,
    detectCLIs,
    refreshAll,
  } = useRegistryStore()

  // Fetch data on mount
  useEffect(() => {
    fetchAgents()
    fetchProviders()
    fetchHealth()
  }, [fetchAgents, fetchProviders, fetchHealth])

  // Fetch tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === 'models') {
      const filters: { agent?: string; provider?: string; free?: boolean } = {}
      if (modelAgentFilter) filters.agent = modelAgentFilter
      if (modelProviderFilter) filters.provider = modelProviderFilter
      if (modelFreeFilter) filters.free = true
      fetchModels(filters)
    } else if (activeTab === 'matrix') {
      fetchMatrix()
    }
  }, [activeTab, modelAgentFilter, modelProviderFilter, modelFreeFilter, fetchModels, fetchMatrix])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'agents', label: 'Agents' },
    { key: 'providers', label: 'Providers' },
    { key: 'models', label: 'Models' },
    { key: 'matrix', label: 'Matrix' },
  ]

  return (
    <div className="space-y-4">
      {/* Health summary bar */}
      {health && (
        <HealthBar health={health} loading={healthLoading} />
      )}

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={detectCLIs}
            disabled={detectLoading}
            className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
          >
            {detectLoading ? 'Detecting...' : 'Detect CLIs'}
          </button>
          <button
            onClick={refreshAll}
            disabled={refreshLoading}
            className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
          >
            {refreshLoading ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'agents' && (
        <AgentsTab
          agents={agents}
          loading={agentsLoading}
          onUpdate={updateAgent}
        />
      )}
      {activeTab === 'providers' && (
        <ProvidersTab
          providers={providers}
          loading={providersLoading}
          onRefresh={refreshProvider}
        />
      )}
      {activeTab === 'models' && (
        <ModelsTab
          models={models}
          loading={modelsLoading}
          agents={agents}
          providers={providers}
          agentFilter={modelAgentFilter}
          providerFilter={modelProviderFilter}
          freeFilter={modelFreeFilter}
          onAgentFilter={setModelAgentFilter}
          onProviderFilter={setModelProviderFilter}
          onFreeFilter={setModelFreeFilter}
        />
      )}
      {activeTab === 'matrix' && (
        <MatrixTab
          matrix={matrix}
          providers={providers}
          loading={matrixLoading}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Health bar
// ---------------------------------------------------------------------------

function HealthBar({ health, loading }: { health: RegistryHealth; loading: boolean }) {
  const agentStatus = health.agents.error > 0 ? 'error' : health.agents.offline > 0 ? 'degraded' : 'healthy'
  const statusColor = agentStatus === 'healthy' ? 'bg-green-500' : agentStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className={cn('bg-zinc-800 rounded-lg p-3', loading && 'opacity-60')}>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', statusColor)} />
          <span className="text-zinc-300">
            {health.agents.online}/{health.agents.total} agents online
          </span>
        </div>
        <div className="text-zinc-500">|</div>
        <span className="text-zinc-400">
          {health.providers.active}/{health.providers.total} providers
        </span>
        <div className="text-zinc-500">|</div>
        <span className="text-zinc-400">
          {health.models.total} models ({health.models.free} free)
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agents tab
// ---------------------------------------------------------------------------

function AgentsTab({
  agents,
  loading,
  onUpdate,
}: {
  agents: RegistryAgent[]
  loading: boolean
  onUpdate: (id: string, updates: Partial<RegistryAgent>) => Promise<void>
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500/20 text-green-400'
      case 'offline': return 'bg-zinc-700 text-zinc-500'
      case 'error': return 'bg-red-500/20 text-red-400'
      default: return 'bg-zinc-700 text-zinc-500'
    }
  }

  const handleToggleEnabled = async (agent: RegistryAgent) => {
    await onUpdate(agent.id, { enabled: !agent.enabled } as Partial<RegistryAgent>)
  }

  if (loading && agents.length === 0) {
    return <div className="text-center py-4 text-zinc-500">Loading agents...</div>
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <div key={agent.id} className="bg-zinc-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200 capitalize">{agent.id}</span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded', getStatusColor(agent.status))}>
                {agent.status}
              </span>
            </div>
            <button
              onClick={() => handleToggleEnabled(agent)}
              className={cn(
                'relative w-8 h-4 rounded-full transition-colors',
                agent.enabled ? 'bg-green-500' : 'bg-zinc-600'
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                  agent.enabled ? 'translate-x-4' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Command:</span>{' '}
              <span className="text-zinc-300 font-mono">{agent.command}</span>
            </div>
            <div>
              <span className="text-zinc-500">CLI:</span>{' '}
              <span className="text-zinc-300">{agent.cli_version || 'n/a'}</span>
            </div>
            <div>
              <span className="text-zinc-500">Model:</span>{' '}
              <span className="text-zinc-300">{agent.default_model || 'default'}</span>
            </div>
            <div>
              <span className="text-zinc-500">Provider:</span>{' '}
              <span className="text-zinc-300">{agent.default_provider || 'default'}</span>
            </div>
          </div>
        </div>
      ))}
      {agents.length === 0 && (
        <div className="text-center py-4 text-zinc-500">No agents registered</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Providers tab
// ---------------------------------------------------------------------------

function ProvidersTab({
  providers,
  loading,
  onRefresh,
}: {
  providers: RegistryProvider[]
  loading: boolean
  onRefresh: (id: string) => Promise<void>
}) {
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  const handleRefresh = async (id: string) => {
    setRefreshingId(id)
    try {
      await onRefresh(id)
    } finally {
      setRefreshingId(null)
    }
  }

  const getBillingBadge = (billing: string) => {
    switch (billing) {
      case 'per_use': return 'bg-blue-500/20 text-blue-400'
      case 'subscription': return 'bg-purple-500/20 text-purple-400'
      case 'free': return 'bg-green-500/20 text-green-400'
      default: return 'bg-zinc-700 text-zinc-400'
    }
  }

  if (loading && providers.length === 0) {
    return <div className="text-center py-4 text-zinc-500">Loading providers...</div>
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => {
        let credits: string | null = null
        if (provider.credits_info) {
          try {
            const info = JSON.parse(provider.credits_info)
            if (info.remaining !== undefined) {
              credits = `$${Number(info.remaining).toFixed(2)}`
            }
          } catch { /* ignore */ }
        }

        return (
          <div key={provider.id} className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">{provider.name}</span>
                <span className={cn('text-xs px-1.5 py-0.5 rounded', getBillingBadge(provider.billing))}>
                  {provider.billing.replace('_', ' ')}
                </span>
              </div>
              <button
                onClick={() => handleRefresh(provider.id)}
                disabled={refreshingId === provider.id}
                className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
              >
                {refreshingId === provider.id ? '...' : 'Refresh'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {provider.api_base && (
                <div className="col-span-2">
                  <span className="text-zinc-500">API:</span>{' '}
                  <span className="text-zinc-400 font-mono truncate">{provider.api_base}</span>
                </div>
              )}
              {credits && (
                <div>
                  <span className="text-zinc-500">Credits:</span>{' '}
                  <span className="text-green-400">{credits}</span>
                </div>
              )}
              {provider.models_fetched_at && (
                <div>
                  <span className="text-zinc-500">Models synced:</span>{' '}
                  <span className="text-zinc-400">
                    {new Date(provider.models_fetched_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
      {providers.length === 0 && (
        <div className="text-center py-4 text-zinc-500">No providers registered</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Models tab
// ---------------------------------------------------------------------------

function ModelsTab({
  models,
  loading,
  agents,
  providers,
  agentFilter,
  providerFilter,
  freeFilter,
  onAgentFilter,
  onProviderFilter,
  onFreeFilter,
}: {
  models: RegistryModel[]
  loading: boolean
  agents: RegistryAgent[]
  providers: RegistryProvider[]
  agentFilter: string
  providerFilter: string
  freeFilter: boolean
  onAgentFilter: (v: string) => void
  onProviderFilter: (v: string) => void
  onFreeFilter: (v: boolean) => void
}) {
  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={agentFilter}
          onChange={(e) => { onAgentFilter(e.target.value); onProviderFilter('') }}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.id}</option>
          ))}
        </select>
        <select
          value={providerFilter}
          onChange={(e) => { onProviderFilter(e.target.value); onAgentFilter('') }}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
        >
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={freeFilter}
            onChange={(e) => onFreeFilter(e.target.checked)}
            className="rounded bg-zinc-700 border-zinc-600"
          />
          Free only
        </label>
      </div>

      {/* Model count */}
      <div className="text-xs text-zinc-500">
        {loading ? 'Loading...' : `${models.length} models`}
      </div>

      {/* Model list */}
      <div className="space-y-1.5">
        {models.map((model) => (
          <div key={model.id} className="bg-zinc-800 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-200 font-mono truncate flex-1 mr-2">
                {model.model_id}
              </span>
              <div className="flex items-center gap-1.5">
                {model.free && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">free</span>
                )}
                {!model.available && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">unavailable</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
              <span>{model.provider_id}</span>
              {model.context_window && (
                <span>{(model.context_window / 1000).toFixed(0)}k ctx</span>
              )}
              {model.cost_input !== null && model.cost_input !== undefined && (
                <span>${model.cost_input.toFixed(2)}/{model.cost_output?.toFixed(2)}</span>
              )}
            </div>
          </div>
        ))}
        {models.length === 0 && !loading && (
          <div className="text-center py-4 text-zinc-500 text-sm">No models found</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Matrix tab
// ---------------------------------------------------------------------------

function MatrixTab({
  matrix,
  providers,
  loading,
}: {
  matrix: MatrixEntry[] | null
  providers: RegistryProvider[]
  loading: boolean
}) {
  if (loading || !matrix) {
    return <div className="text-center py-4 text-zinc-500">Loading matrix...</div>
  }

  // Build a lookup: agent_id -> provider_id -> model_count
  const grid: Record<string, Record<string, number>> = {}
  for (const entry of matrix) {
    if (!grid[entry.agent_id]) grid[entry.agent_id] = {}
    grid[entry.agent_id][entry.provider_id] = entry.model_count
  }

  // Get unique provider IDs that appear in the matrix
  const providerIds = [...new Set(matrix.map((e) => e.provider_id))]
  // Get unique agent IDs that appear in the matrix
  const agentIds = [...new Set(matrix.map((e) => e.agent_id))]

  if (agentIds.length === 0) {
    return <div className="text-center py-4 text-zinc-500 text-sm">No matrix data</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-700">
            <th className="text-left py-2 px-2 text-zinc-400 font-medium">Agent</th>
            {providerIds.map((pid) => {
              const p = providers.find((pr) => pr.id === pid)
              return (
                <th key={pid} className="text-center py-2 px-1.5 text-zinc-400 font-medium">
                  {p?.name || pid}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {agentIds.map((aid) => (
            <tr key={aid} className="border-b border-zinc-800">
              <td className="py-1.5 px-2 text-zinc-200 capitalize">{aid}</td>
              {providerIds.map((pid) => {
                const count = grid[aid]?.[pid] || 0
                return (
                  <td key={pid} className="text-center py-1.5 px-1.5">
                    {count > 0 ? (
                      <span className="text-zinc-300 bg-zinc-700 px-1.5 py-0.5 rounded">
                        {count}
                      </span>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

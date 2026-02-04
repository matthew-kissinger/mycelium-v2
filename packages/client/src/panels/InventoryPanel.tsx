/**
 * InventoryPanel - Skills and MCP servers inventory
 */

import { useEffect, useState } from 'react'

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

export function InventoryPanel({
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

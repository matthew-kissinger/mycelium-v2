/**
 * MemoryPanel - Memory patterns and warnings management
 */

import { useEffect, useState } from 'react'

// Memory types for panel
interface MemoryPattern {
  id: string
  content: string
  source: string
  task_id?: string
  repo_path?: string
  tags: string[]
  created_at: string
}

interface MemoryWarning {
  id: string
  content: string
  severity: string
  task_id?: string
  repo_path?: string
  created_at: string
}

// Grouped memory type for the panel
interface GroupedMemoryData {
  global: {
    patterns: MemoryPattern[]
    warnings: MemoryWarning[]
  }
  repos: Record<string, {
    patterns: MemoryPattern[]
    warnings: MemoryWarning[]
  }>
  summary: {
    total_patterns: number
    total_warnings: number
    global_patterns: number
    global_warnings: number
    repos_with_memory: number
  }
}

export function MemoryPanel({
  patterns,
  warnings,
  loading,
  patternCount,
  warningCount,
  reposWithMemory,
  groupedMemory,
  onFetch,
  onDeletePattern,
  onDeleteWarning,
}: {
  patterns: MemoryPattern[]
  warnings: MemoryWarning[]
  loading: boolean
  patternCount: number
  warningCount: number
  reposWithMemory: number
  groupedMemory: GroupedMemoryData | null
  onFetch: () => void
  onDeletePattern: (id: string) => Promise<void>
  onDeleteWarning: (id: string) => Promise<void>
}) {
  const [activeView, setActiveView] = useState<'grouped' | 'all'>('grouped')
  const [activeTab, setActiveTab] = useState<'patterns' | 'warnings'>('patterns')
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set(['global']))
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fetch on mount
  useEffect(() => {
    onFetch()
  }, [onFetch])

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const handleDeletePattern = async (id: string) => {
    if (!confirm('Delete this pattern?')) return
    setDeletingId(id)
    try {
      await onDeletePattern(id)
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteWarning = async (id: string) => {
    if (!confirm('Delete this warning?')) return
    setDeletingId(id)
    try {
      await onDeleteWarning(id)
    } finally {
      setDeletingId(null)
    }
  }

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-500/20'
      case 'medium': return 'text-amber-400 bg-amber-500/20'
      case 'low': return 'text-blue-400 bg-blue-500/20'
      default: return 'text-zinc-400 bg-zinc-700'
    }
  }

  const toggleRepo = (repo: string) => {
    setExpandedRepos(prev => {
      const next = new Set(prev)
      if (next.has(repo)) {
        next.delete(repo)
      } else {
        next.add(repo)
      }
      return next
    })
  }

  const getRepoName = (path: string) => path.split('/').pop() || path

  const renderPatternItem = (pattern: MemoryPattern) => (
    <div key={pattern.id} className="bg-zinc-800/50 rounded p-2.5 mb-2">
      <div className="text-sm text-zinc-200 mb-1.5 line-clamp-2">{pattern.content}</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{formatTimeAgo(pattern.created_at)}</span>
          <span className="capitalize text-zinc-600">{pattern.source}</span>
          {pattern.tags.length > 0 && (
            <div className="flex gap-1">
              {pattern.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-zinc-700 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => handleDeletePattern(pattern.id)}
          disabled={deletingId === pattern.id}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deletingId === pattern.id ? '...' : 'Delete'}
        </button>
      </div>
    </div>
  )

  const renderWarningItem = (warning: MemoryWarning) => (
    <div key={warning.id} className="bg-zinc-800/50 rounded p-2.5 mb-2">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-sm text-zinc-200 line-clamp-2">{warning.content}</div>
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded capitalize ${severityColor(warning.severity)}`}>
          {warning.severity}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{formatTimeAgo(warning.created_at)}</span>
        <button
          onClick={() => handleDeleteWarning(warning.id)}
          disabled={deletingId === warning.id}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deletingId === warning.id ? '...' : 'Delete'}
        </button>
      </div>
    </div>
  )

  const renderMemorySection = (
    title: string,
    sectionKey: string,
    patternsData: MemoryPattern[],
    warningsData: MemoryWarning[],
    isGlobal = false
  ) => {
    const isExpanded = expandedRepos.has(sectionKey)
    const totalItems = patternsData.length + warningsData.length

    return (
      <div key={sectionKey} className={`rounded-lg border ${isGlobal ? 'border-purple-500/30 bg-purple-500/5' : 'border-zinc-700 bg-zinc-800/30'}`}>
        <button
          onClick={() => toggleRepo(sectionKey)}
          className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-800/50 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className={`text-lg ${isExpanded ? 'rotate-90' : ''} transition-transform`}>{'>'}</span>
            <span className={`font-medium ${isGlobal ? 'text-purple-300' : 'text-zinc-200'}`}>
              {isGlobal ? 'Global (Network-wide)' : title}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-blue-400">{patternsData.length} patterns</span>
            <span className={warningsData.length > 0 ? 'text-amber-400' : 'text-zinc-500'}>
              {warningsData.length} warnings
            </span>
          </div>
        </button>

        {isExpanded && totalItems > 0 && (
          <div className="px-3 pb-3 pt-1">
            {/* Section tabs */}
            <div className="flex gap-1 bg-zinc-800 rounded p-0.5 mb-3">
              <button
                onClick={() => setActiveTab('patterns')}
                className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === 'patterns' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Patterns ({patternsData.length})
              </button>
              <button
                onClick={() => setActiveTab('warnings')}
                className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === 'warnings' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Warnings ({warningsData.length})
              </button>
            </div>

            {/* Content */}
            <div className="max-h-48 overflow-y-auto">
              {activeTab === 'patterns' ? (
                patternsData.length === 0 ? (
                  <div className="text-center py-3 text-zinc-500 text-xs">No patterns</div>
                ) : (
                  patternsData.map(renderPatternItem)
                )
              ) : (
                warningsData.length === 0 ? (
                  <div className="text-center py-3 text-zinc-500 text-xs">No warnings</div>
                ) : (
                  warningsData.map(renderWarningItem)
                )
              )}
            </div>
          </div>
        )}

        {isExpanded && totalItems === 0 && (
          <div className="px-3 pb-3 text-center text-zinc-500 text-xs">No memory stored</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Patterns</div>
          <div className="text-xl font-semibold text-blue-400">{patternCount}</div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Warnings</div>
          <div className={`text-xl font-semibold ${warningCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
            {warningCount}
          </div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <div className="text-xs text-zinc-500 mb-1">Repos</div>
          <div className="text-xl font-semibold text-green-400">{reposWithMemory}</div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
        <button
          onClick={() => setActiveView('grouped')}
          className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
            activeView === 'grouped' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          By Scope
        </button>
        <button
          onClick={() => setActiveView('all')}
          className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
            activeView === 'all' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All Items
        </button>
      </div>

      {/* Content */}
      {loading && !groupedMemory ? (
        <div className="text-center py-8 text-zinc-500">Loading memory...</div>
      ) : activeView === 'grouped' && groupedMemory ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {/* Global Memory Section */}
          {renderMemorySection(
            'Global',
            'global',
            groupedMemory.global.patterns,
            groupedMemory.global.warnings,
            true
          )}

          {/* Repo-specific Memory Sections */}
          {Object.entries(groupedMemory.repos).map(([repoPath, memory]) => (
            renderMemorySection(
              getRepoName(repoPath),
              repoPath,
              memory.patterns,
              memory.warnings,
              false
            )
          ))}

          {Object.keys(groupedMemory.repos).length === 0 && groupedMemory.global.patterns.length === 0 && groupedMemory.global.warnings.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <p className="mb-2">No memory stored yet</p>
              <p className="text-xs text-zinc-600">Memory is learned from completed tasks via the Shepherd</p>
            </div>
          )}
        </div>
      ) : (
        /* All Items View - flat list */
        <div className="space-y-3">
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('patterns')}
              className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
                activeTab === 'patterns' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Patterns ({patterns.length})
            </button>
            <button
              onClick={() => setActiveTab('warnings')}
              className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors ${
                activeTab === 'warnings' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Warnings ({warnings.length})
            </button>
          </div>

          <div className="max-h-[350px] overflow-y-auto">
            {activeTab === 'patterns' ? (
              patterns.length === 0 ? (
                <div className="text-center py-4 text-zinc-500 text-sm">No patterns yet</div>
              ) : (
                patterns.map((pattern) => (
                  <div key={pattern.id} className="bg-zinc-800 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      {pattern.repo_path ? (
                        <span className="text-xs px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-400">
                          {getRepoName(pattern.repo_path)}
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-400">
                          Global
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-200 mb-2 line-clamp-3">{pattern.content}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{formatTimeAgo(pattern.created_at)}</span>
                        <span className="capitalize">{pattern.source}</span>
                      </div>
                      <button
                        onClick={() => handleDeletePattern(pattern.id)}
                        disabled={deletingId === pattern.id}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        {deletingId === pattern.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : (
              warnings.length === 0 ? (
                <div className="text-center py-4 text-zinc-500 text-sm">No warnings yet</div>
              ) : (
                warnings.map((warning) => (
                  <div key={warning.id} className="bg-zinc-800 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      {warning.repo_path ? (
                        <span className="text-xs px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-400">
                          {getRepoName(warning.repo_path)}
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-400">
                          Global
                        </span>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-sm text-zinc-200 line-clamp-3">{warning.content}</div>
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded capitalize ${severityColor(warning.severity)}`}>
                        {warning.severity}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{formatTimeAgo(warning.created_at)}</span>
                      <button
                        onClick={() => handleDeleteWarning(warning.id)}
                        disabled={deletingId === warning.id}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        {deletingId === warning.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}

      {/* Refresh button */}
      <button
        onClick={onFetch}
        disabled={loading}
        className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm disabled:opacity-50"
      >
        {loading ? 'Refreshing...' : 'Refresh Memory'}
      </button>
    </div>
  )
}

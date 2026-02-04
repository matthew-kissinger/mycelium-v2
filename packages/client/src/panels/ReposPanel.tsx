/**
 * ReposPanel - Network repository management
 */

import { useEffect, useState } from 'react'

interface Repo {
  id: string
  path: string
  name: string
  description?: string
  language?: string
  mode: 'auto' | 'align'
  weight: number
  created_at: string
  last_scanned_at?: string
}

// Directory browser result types
interface BrowseDirectory {
  name: string
  path: string
  isGitRepo: boolean
  isHidden: boolean
}

interface BrowseResult {
  current: string
  parent: string | null
  directories: BrowseDirectory[]
  isGitRepo: boolean
}

export function ReposPanel({
  repos,
  loading,
  onFetch,
  onUpdate,
  onDelete,
  onAdd,
  onBrowse,
}: {
  repos: Repo[]
  loading: boolean
  onFetch: () => Promise<void>
  onUpdate: (id: string, updates: { description?: string; mode?: 'auto' | 'align'; weight?: number }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: (path: string, description?: string) => Promise<void>
  onBrowse: (path?: string) => Promise<BrowseResult>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedWeight, setEditedWeight] = useState<number>(50)
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({})
  const [showBrowser, setShowBrowser] = useState(false)
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [addingRepo, setAddingRepo] = useState<string | null>(null)

  // Fetch repos on mount
  useEffect(() => {
    onFetch()
  }, [onFetch])

  // Browse to a directory
  const browseTo = async (path?: string) => {
    setBrowseLoading(true)
    setBrowseError(null)
    try {
      const result = await onBrowse(path)
      setBrowseResult(result)
    } catch (error) {
      setBrowseError((error as Error).message)
    } finally {
      setBrowseLoading(false)
    }
  }

  // Open folder browser
  const openBrowser = () => {
    setShowBrowser(true)
    browseTo()
  }

  // Add a repo
  const handleAddRepo = async (path: string) => {
    setAddingRepo(path)
    try {
      await onAdd(path)
      setShowBrowser(false)
      setBrowseResult(null)
    } catch (error) {
      setBrowseError((error as Error).message)
    } finally {
      setAddingRepo(null)
    }
  }

  const handleWeightChange = (id: string, weight: number) => {
    setEditingId(id)
    setEditedWeight(weight)
  }

  const handleWeightSave = async (id: string) => {
    setSaveStatus(prev => ({ ...prev, [id]: 'saving' }))
    try {
      await onUpdate(id, { weight: editedWeight })
      setSaveStatus(prev => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [id]: 'idle' })), 1500)
    } catch {
      setSaveStatus(prev => ({ ...prev, [id]: 'idle' }))
    }
    setEditingId(null)
  }

  const handleModeToggle = async (repo: Repo) => {
    const newMode = repo.mode === 'auto' ? 'align' : 'auto'
    await onUpdate(repo.id, { mode: newMode })
  }

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Remove ${name} from network?`)) {
      await onDelete(id)
    }
  }

  // Calculate total weight for percentage display
  const totalWeight = repos.reduce((sum, r) => sum + (r.weight ?? 50), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{repos.length} repos in network</span>
        <div className="flex gap-2">
          <button
            onClick={openBrowser}
            className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-500"
          >
            + Add
          </button>
          <button
            onClick={onFetch}
            disabled={loading}
            className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Weight distribution info */}
      {repos.length > 0 && (
        <div className="bg-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-500 mb-2">Weight Distribution (Discovery Selection)</div>
          <div className="h-3 rounded-full overflow-hidden flex">
            {repos.map((repo, idx) => {
              const pct = totalWeight > 0 ? ((repo.weight ?? 50) / totalWeight) * 100 : 0
              const colors = [
                'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
                'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500',
              ]
              return (
                <div
                  key={repo.id}
                  className={`${colors[idx % colors.length]} h-full`}
                  style={{ width: `${pct}%` }}
                  title={`${repo.name}: ${Math.round(pct)}%`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {repos.slice(0, 6).map((repo, idx) => {
              const pct = totalWeight > 0 ? ((repo.weight ?? 50) / totalWeight) * 100 : 0
              const colors = [
                'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
                'bg-pink-500', 'bg-cyan-500',
              ]
              return (
                <div key={repo.id} className="flex items-center gap-1 text-xs">
                  <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                  <span className="text-zinc-400">{repo.name}</span>
                  <span className="text-zinc-500">({Math.round(pct)}%)</span>
                </div>
              )
            })}
            {repos.length > 6 && (
              <span className="text-xs text-zinc-500">+{repos.length - 6} more</span>
            )}
          </div>
        </div>
      )}

      {/* Repos list */}
      <div className="space-y-2">
        {repos.map((repo) => (
          <div key={repo.id} className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-zinc-200">{repo.name}</div>
                <div className="text-xs text-zinc-500 font-mono">{repo.path}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  repo.mode === 'auto'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {repo.mode}
                </span>
                {repo.language && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                    {repo.language}
                  </span>
                )}
              </div>
            </div>

            {repo.description && (
              <p className="text-xs text-zinc-400 mb-2">{repo.description}</p>
            )}

            {/* Weight slider */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-zinc-500 w-12">Weight:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={editingId === repo.id ? editedWeight : (repo.weight ?? 50)}
                onChange={(e) => handleWeightChange(repo.id, parseInt(e.target.value))}
                onMouseUp={() => handleWeightSave(repo.id)}
                onTouchEnd={() => handleWeightSave(repo.id)}
                className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-zinc-300 w-8 text-right">
                {editingId === repo.id ? editedWeight : (repo.weight ?? 50)}
              </span>
              {saveStatus[repo.id] === 'saving' && (
                <span className="text-xs text-zinc-500">...</span>
              )}
              {saveStatus[repo.id] === 'saved' && (
                <span className="text-xs text-green-400">Saved</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => handleModeToggle(repo)}
                className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
              >
                Switch to {repo.mode === 'auto' ? 'align' : 'auto'}
              </button>
              <button
                onClick={() => handleDelete(repo.id, repo.name)}
                className="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
              >
                Remove
              </button>
            </div>

            {/* Last scanned */}
            {repo.last_scanned_at && (
              <div className="text-xs text-zinc-500 mt-2">
                Last scanned: {new Date(repo.last_scanned_at).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {repos.length === 0 && !loading && !showBrowser && (
        <div className="text-center py-8 text-zinc-500">
          <p className="mb-3">No repos in network yet</p>
          <button
            onClick={openBrowser}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
          >
            Add Repository
          </button>
        </div>
      )}

      {/* Folder Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Browser Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-semibold text-zinc-100">Select Repository Folder</h3>
              <button
                onClick={() => { setShowBrowser(false); setBrowseResult(null); setBrowseError(null) }}
                className="text-zinc-400 hover:text-zinc-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Current Path */}
            {browseResult && (
              <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                  {browseResult.parent && (
                    <button
                      onClick={() => browseTo(browseResult.parent!)}
                      className="p-1 hover:bg-zinc-700 rounded"
                      title="Go up"
                    >
                      <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}
                  <code className="text-xs text-zinc-400 flex-1 truncate">{browseResult.current}</code>
                  {browseResult.isGitRepo && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Git Repo</span>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {browseError && (
              <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm">
                {browseError}
              </div>
            )}

            {/* Directory List */}
            <div className="flex-1 overflow-y-auto p-2">
              {browseLoading ? (
                <div className="text-center py-8 text-zinc-500">Loading...</div>
              ) : browseResult ? (
                <div className="space-y-1">
                  {browseResult.directories
                    .filter(dir => showHidden || !dir.isHidden)
                    .map((dir) => (
                    <div
                      key={dir.path}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-zinc-800 ${
                        dir.isGitRepo ? 'bg-zinc-800/50' : ''
                      }`}
                      onClick={() => browseTo(dir.path)}
                    >
                      <span className="text-xs font-mono text-zinc-500">{dir.isGitRepo ? '[git]' : '[dir]'}</span>
                      <span className={`flex-1 text-sm ${dir.isHidden ? 'text-zinc-500' : 'text-zinc-200'}`}>
                        {dir.name}
                      </span>
                      {dir.isGitRepo && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddRepo(dir.path) }}
                          disabled={addingRepo === dir.path || repos.some(r => r.path === dir.path)}
                          className={`px-2 py-1 rounded text-xs ${
                            repos.some(r => r.path === dir.path)
                              ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-500'
                          }`}
                        >
                          {addingRepo === dir.path ? '...' : repos.some(r => r.path === dir.path) ? 'Added' : 'Add'}
                        </button>
                      )}
                    </div>
                  ))}
                  {browseResult.directories.filter(dir => showHidden || !dir.isHidden).length === 0 && (
                    <div className="text-center py-4 text-zinc-500 text-sm">No subdirectories</div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Browser Footer */}
            <div className="flex items-center justify-between p-3 border-t border-zinc-700">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                  className="rounded bg-zinc-700 border-zinc-600"
                />
                Show hidden
              </label>
              {browseResult?.isGitRepo && !repos.some(r => r.path === browseResult.current) && (
                <button
                  onClick={() => handleAddRepo(browseResult.current)}
                  disabled={!!addingRepo}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50"
                >
                  {addingRepo ? 'Adding...' : 'Add Current Folder'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

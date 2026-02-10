/**
 * GitHubPanel - GitHub integration management
 */

import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import type { GitHubRepo, GitHubPR, RulesetEntry, SecuritySetupResult } from '../stores/githubStore'

type TabId = 'repos' | 'prs' | 'security'

export function GitHubPanel({
  repos,
  prs,
  rulesets,
  securityResults,
  loading,
  error,
  onFetchRepos,
  onSetupSecurity,
  onGetRulesets,
  onApplyRulesets,
  onMergeTask: _onMergeTask,
}: {
  repos: GitHubRepo[]
  prs: GitHubPR[]
  rulesets: Record<string, RulesetEntry[]>
  securityResults: SecuritySetupResult[]
  loading: boolean
  error: string | null
  onFetchRepos: () => Promise<void>
  onSetupSecurity: () => Promise<SecuritySetupResult[]>
  onGetRulesets: (owner: string, repo: string) => Promise<RulesetEntry[]>
  onApplyRulesets: () => Promise<void>
  onMergeTask: (taskId: string) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<TabId>('repos')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    onFetchRepos()
  }, [onFetchRepos])

  const syncedRepos = repos.filter((r) => r.synced)
  const unsyncedRepos = repos.filter((r) => !r.synced)

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const handleAction = async (key: string, fn: () => Promise<unknown>) => {
    setActionLoading(key)
    try {
      await fn()
    } catch (error) {
      console.error(`Action ${key} failed:`, error)
    } finally {
      setActionLoading(null)
    }
  }

  const prStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-500/20 text-green-400'
      case 'merged': return 'bg-purple-500/20 text-purple-400'
      case 'closed': return 'bg-red-500/20 text-red-400'
      default: return 'bg-zinc-700 text-zinc-400'
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">
          {syncedRepos.length}/{repos.length} repos synced
        </span>
        <button
          onClick={onFetchRepos}
          disabled={loading}
          className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
        {([
          { id: 'repos' as TabId, label: `Repos (${repos.length})` },
          { id: 'prs' as TabId, label: `PRs (${prs.filter((p) => p.status === 'open').length})` },
          { id: 'security' as TabId, label: 'Security' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 px-3 py-1.5 rounded text-xs transition-colors',
              activeTab === id
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Repos Tab */}
      {activeTab === 'repos' && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {repos.length === 0 && !loading && (
            <div className="text-center py-8 text-zinc-500">No repos in network</div>
          )}

          {syncedRepos.length > 0 && (
            <>
              <div className="text-xs text-zinc-500 uppercase tracking-wider px-1">
                Synced ({syncedRepos.length})
              </div>
              {syncedRepos.map((repo) => (
                <div key={repo.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-200 truncate">{repo.name}</div>
                      <div className="text-xs text-zinc-500 font-mono truncate">
                        {repo.github_owner}/{repo.github_repo}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {repo.is_public === 1 ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">public</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">private</span>
                      )}
                      <span className="w-2 h-2 rounded-full bg-green-500" title="Synced" />
                    </div>
                  </div>
                  {repo.github_default_branch && (
                    <div className="text-xs text-zinc-500">
                      Default: <span className="text-zinc-400">{repo.github_default_branch}</span>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {unsyncedRepos.length > 0 && (
            <>
              <div className="text-xs text-zinc-500 uppercase tracking-wider px-1 mt-3">
                Not synced ({unsyncedRepos.length})
              </div>
              {unsyncedRepos.map((repo) => (
                <div key={repo.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-200 truncate">{repo.name}</div>
                      <div className="text-xs text-zinc-500 font-mono truncate">{repo.path}</div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0 ml-2" title="Not synced" />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* PRs Tab */}
      {activeTab === 'prs' && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {prs.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              No PRs tracked yet. PRs appear when created via webhook events.
            </div>
          )}

          {prs.map((pr) => (
            <div key={`${pr.repo_path}-${pr.pr_number}`} className="bg-zinc-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-200 truncate">
                    {pr.title || `PR #${pr.pr_number}`}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {pr.repo_path.split('/').pop()} #{pr.pr_number}
                  </div>
                </div>
                <span className={cn(
                  'shrink-0 text-xs px-1.5 py-0.5 rounded capitalize',
                  prStatusColor(pr.status)
                )}>
                  {pr.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                {pr.branch && <span className="font-mono">{pr.branch}</span>}
                <span>{formatTimeAgo(pr.timestamp)}</span>
                {pr.pr_url && (
                  <a
                    href={pr.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-3">
          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleAction('security', onSetupSecurity)}
              disabled={actionLoading !== null}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm transition-colors',
                'bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50'
              )}
            >
              {actionLoading === 'security' ? 'Setting up...' : 'Setup Security'}
            </button>
            <button
              onClick={() => handleAction('rulesets', onApplyRulesets)}
              disabled={actionLoading !== null}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm transition-colors',
                'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50'
              )}
            >
              {actionLoading === 'rulesets' ? 'Applying...' : 'Apply Rulesets'}
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            Setup enables Dependabot, CodeQL, and secret scanning on all public repos.
            Apply Rulesets configures branch protection rules.
          </div>

          {/* Security results */}
          {securityResults.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-zinc-500 uppercase tracking-wider px-1">
                Setup Results
              </div>
              {securityResults.map((result, i) => (
                <div key={i} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-200">
                      {result.owner}/{result.repo}
                    </span>
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      result.success ? 'bg-green-500' : 'bg-red-500'
                    )} />
                  </div>
                  {result.success && result.features_enabled.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.features_enabled.map((f) => (
                        <span key={f} className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {result.error && (
                    <div className="text-xs text-red-400 mt-1">{result.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Per-repo rulesets */}
          {Object.keys(rulesets).length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-zinc-500 uppercase tracking-wider px-1">
                Rulesets
              </div>
              {Object.entries(rulesets).map(([key, rules]) => (
                <div key={key} className="bg-zinc-800 rounded-lg p-3">
                  <div className="text-sm text-zinc-200 mb-2">{key}</div>
                  {rules.length === 0 ? (
                    <div className="text-xs text-zinc-500">No rulesets configured</div>
                  ) : (
                    <div className="space-y-1">
                      {rules.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300">{rule.name}</span>
                          <span className={cn(
                            'px-1.5 py-0.5 rounded',
                            rule.enforcement === 'active'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-zinc-700 text-zinc-400'
                          )}>
                            {rule.enforcement}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Synced repos quick view */}
          {syncedRepos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 uppercase tracking-wider px-1">
                  Public Repos ({syncedRepos.filter((r) => r.is_public === 1).length})
                </span>
              </div>
              {syncedRepos
                .filter((r) => r.is_public === 1)
                .map((repo) => {
                  const key = `${repo.github_owner}/${repo.github_repo}`
                  const hasRulesets = rulesets[key] && rulesets[key].length > 0
                  return (
                    <div key={repo.id} className="bg-zinc-800 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-200">{key}</span>
                        <button
                          onClick={() => handleAction(`rulesets-${key}`, () => onGetRulesets(repo.github_owner!, repo.github_repo!))}
                          disabled={actionLoading !== null}
                          className="text-xs px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 disabled:opacity-50"
                        >
                          {actionLoading === `rulesets-${key}` ? '...' : hasRulesets ? 'Refresh' : 'Load Rulesets'}
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

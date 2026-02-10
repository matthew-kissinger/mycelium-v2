/**
 * MaxAlignmentPanel - Repo-level health audit panel
 */

import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import { formatTimeAgo } from '../lib/formatters'
import { useMaxAlignmentStore, type MaxAlignmentFinding, type MaxAlignmentRun } from '../stores/maxAlignmentStore'
import { useRepoStore } from '../stores/repoStore'

const healthColors: Record<string, string> = {
  healthy: 'text-green-400 bg-green-500/20',
  warning: 'text-yellow-400 bg-yellow-500/20',
  critical: 'text-red-400 bg-red-500/20',
}

const severityColors: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/20',
  high: 'text-orange-400 bg-orange-500/20',
  medium: 'text-yellow-400 bg-yellow-500/20',
  low: 'text-zinc-400 bg-zinc-600/20',
}

const statusBadge: Record<string, { label: string; className: string }> = {
  idle: { label: 'Idle', className: 'text-zinc-400 bg-zinc-700' },
  running: { label: 'Running', className: 'text-blue-400 bg-blue-500/20' },
  completed: { label: 'Completed', className: 'text-green-400 bg-green-500/20' },
  failed: { label: 'Failed', className: 'text-red-400 bg-red-500/20' },
}

export function MaxAlignmentPanel() {
  const {
    status,
    currentRepo,
    lastRun,
    findings,
    history,
    eligibleRepos,
    loading,
    error,
    trigger,
    fetchStatus,
  } = useMaxAlignmentStore()

  const { repos, fetchRepos } = useRepoStore()
  const [selectedRepo, setSelectedRepo] = useState<string>('')

  useEffect(() => {
    fetchStatus()
    if (repos.length === 0) {
      fetchRepos()
    }
  }, [fetchStatus, fetchRepos, repos.length])

  const handleTrigger = () => {
    if (selectedRepo) {
      trigger(selectedRepo)
    }
  }

  const badge = statusBadge[status] ?? statusBadge.idle

  return (
    <div className="space-y-4">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-sm">Status</span>
        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', badge.className)}>
          {badge.label}
        </span>
      </div>

      {/* Running indicator */}
      {status === 'running' && currentRepo && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-blue-400">Auditing</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 truncate">{currentRepo}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Last Run Results */}
      {lastRun && (
        <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">Last Audit</span>
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', healthColors[lastRun.health] ?? healthColors.warning)}>
              {lastRun.health}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Repo</span>
              <span className="text-zinc-300 truncate ml-2">{lastRun.repo_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">When</span>
              <span className="text-zinc-300">{formatTimeAgo(lastRun.timestamp)}</span>
            </div>
          </div>

          {lastRun.headline && (
            <p className="text-xs text-zinc-400 border-t border-zinc-700 pt-2">{lastRun.headline}</p>
          )}
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-2">
            Findings ({findings.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {findings.map((finding, i) => (
              <FindingCard key={i} finding={finding} />
            ))}
          </div>
        </div>
      )}

      {/* Trigger Section */}
      <div className="border-t border-zinc-700 pt-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Run Audit</h3>
        <div className="space-y-2">
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
          >
            <option value="">Select a repository</option>
            {repos.map((repo) => (
              <option key={repo.id} value={repo.path}>
                {repo.name}
              </option>
            ))}
          </select>

          {/* Show eligibility */}
          {eligibleRepos.length > 0 && (
            <div className="text-xs text-zinc-500">
              Eligible: {eligibleRepos.map((r) => r.path.split('/').pop()).join(', ')}
            </div>
          )}

          <button
            onClick={handleTrigger}
            disabled={!selectedRepo || status === 'running' || loading}
            className={cn(
              'w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {loading ? 'Triggering...' : status === 'running' ? 'Audit Running...' : 'Run Audit'}
          </button>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-zinc-700 pt-4">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">History</h3>
          <div className="space-y-2">
            {history.map((run, i) => (
              <HistoryRow key={i} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FindingCard({ finding }: { finding: MaxAlignmentFinding }) {
  const sevColor = severityColors[finding.severity] ?? severityColors.medium

  return (
    <div className="bg-zinc-800 rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{finding.category}</span>
        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', sevColor)}>
          {finding.severity}
        </span>
      </div>
      <p className="text-sm text-zinc-300">{finding.description}</p>
      {finding.file && (
        <p className="text-xs text-zinc-500 font-mono">
          {finding.file}{finding.line ? `:${finding.line}` : ''}
        </p>
      )}
      {finding.recommendation && (
        <p className="text-xs text-zinc-500 italic">{finding.recommendation}</p>
      )}
    </div>
  )
}

function HistoryRow({ run }: { run: MaxAlignmentRun }) {
  const healthColor = healthColors[run.health] ?? healthColors.warning

  return (
    <div className="bg-zinc-800 rounded p-2 flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-sm text-zinc-300 truncate">{run.repo_name}</div>
        <div className="text-xs text-zinc-500">{formatTimeAgo(run.timestamp)}</div>
      </div>
      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', healthColor)}>
        {run.health}
      </span>
    </div>
  )
}

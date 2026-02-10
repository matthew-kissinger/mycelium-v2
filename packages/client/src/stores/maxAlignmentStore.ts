/**
 * Max Alignment Store - repo-level health auditing
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import { useUIStore } from './uiStore'

export interface MaxAlignmentFinding {
  type: 'bug' | 'cleanup' | 'documentation' | 'git' | 'vision'
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  description: string
  recommendation?: string
  file?: string
  line?: number
}

export interface MaxAlignmentRun {
  repo_path: string
  repo_name: string
  health: 'healthy' | 'warning' | 'critical'
  headline: string
  findings: MaxAlignmentFinding[]
  timestamp: string
  duration_seconds?: number
}

export interface MaxAlignmentRepoStatus {
  eligible: boolean
  last_run?: string
}

export interface MaxAlignmentStatusResponse {
  shepherd_trigger: number
  repos: Record<string, MaxAlignmentRepoStatus>
  eligible_repos: Array<{ path: string; eligible: boolean; last_run?: string }>
  recent_runs: Array<{
    id: string
    agent_type: string
    status: string
    repo_path: string
    started_at: string
    completed_at?: string
    result?: string
  }>
}

interface MaxAlignmentState {
  status: 'idle' | 'running' | 'completed' | 'failed'
  currentRepo: string | null
  lastRun: MaxAlignmentRun | null
  findings: MaxAlignmentFinding[]
  history: MaxAlignmentRun[]
  repoStatus: Record<string, MaxAlignmentRepoStatus>
  eligibleRepos: Array<{ path: string; eligible: boolean; last_run?: string }>
  loading: boolean
  error: string | null

  // Actions
  trigger: (repoPath: string) => Promise<void>
  fetchStatus: () => Promise<void>

  // SSE event handlers
  setRunning: (repo: string) => void
  setCompleted: (result: MaxAlignmentRun) => void
  setFailed: (error: string) => void
  addFinding: (finding: MaxAlignmentFinding) => void
}

function extractFindings(run: {
  result?: string
  repo_path: string
  repo_name?: string
}): MaxAlignmentFinding[] {
  const findings: MaxAlignmentFinding[] = []
  if (!run.result) return findings

  // Extract critical bugs
  const bugRegex = /<bug\s+file="([^"]*)"(?:\s+line="(\d+)")?>([\s\S]*?)<\/bug>/g
  let m
  while ((m = bugRegex.exec(run.result)) !== null) {
    findings.push({
      type: 'bug',
      severity: 'critical',
      category: 'Critical Bug',
      description: m[3].trim(),
      file: m[1],
      line: m[2] ? +m[2] : undefined,
      recommendation: 'Fix immediately - this affects runtime behavior',
    })
  }

  // Extract deleted files
  const fileRegex = /<file\s+reason="([^"]*)">([\s\S]*?)<\/file>/g
  while ((m = fileRegex.exec(run.result)) !== null) {
    findings.push({
      type: 'cleanup',
      severity: 'low',
      category: 'Cleanup',
      description: `Deleted: ${m[2].trim()}`,
      recommendation: m[1],
    })
  }

  // Extract warnings
  const warnRegex = /<warning(?:\s+severity="([^"]*)")?\s*>([\s\S]*?)<\/warning>/g
  while ((m = warnRegex.exec(run.result)) !== null) {
    const sev = m[1] as MaxAlignmentFinding['severity'] ?? 'medium'
    findings.push({
      type: 'vision',
      severity: sev,
      category: 'Warning',
      description: m[2].trim(),
    })
  }

  // Extract documentation changes
  const claudeMdMatch = run.result.match(/<claude_md\s+action="([^"]*)">([\s\S]*?)<\/claude_md>/)
  if (claudeMdMatch && claudeMdMatch[1] !== 'unchanged') {
    findings.push({
      type: 'documentation',
      severity: 'medium',
      category: 'Documentation',
      description: `CLAUDE.md ${claudeMdMatch[1]}: ${claudeMdMatch[2].trim()}`,
    })
  }

  return findings
}

export const useMaxAlignmentStore = create<MaxAlignmentState>((set, get) => ({
  status: 'idle',
  currentRepo: null,
  lastRun: null,
  findings: [],
  history: [],
  repoStatus: {},
  eligibleRepos: [],
  loading: false,
  error: null,

  trigger: async (repoPath) => {
    try {
      set({ loading: true, error: null })
      await fetchAPI('/max-alignment/trigger', {
        method: 'POST',
        body: JSON.stringify({ repo_path: repoPath }),
      })
      set({ status: 'running', currentRepo: repoPath })
      useUIStore.getState().addToast('info', `Max alignment triggered for ${repoPath.split('/').pop()}`)
    } catch (error) {
      set({ error: (error as Error).message })
      useUIStore.getState().addToast('error', `Failed to trigger max alignment: ${(error as Error).message}`)
    } finally {
      set({ loading: false })
    }
  },

  fetchStatus: async () => {
    try {
      set({ loading: true })
      const data = await fetchAPI<MaxAlignmentStatusResponse>('/max-alignment/status')
      set({
        repoStatus: data.repos,
        eligibleRepos: data.eligible_repos,
      })

      // Build history from recent runs
      const history: MaxAlignmentRun[] = []
      for (const run of data.recent_runs) {
        if (run.status === 'completed' && run.result) {
          const healthMatch = run.result.match(/health="(healthy|warning|critical)"/)
          const headlineMatch = run.result.match(/<headline>([\s\S]*?)<\/headline>/)
          const repoName = run.repo_path.split('/').pop() ?? run.repo_path

          const alignmentRun: MaxAlignmentRun = {
            repo_path: run.repo_path,
            repo_name: repoName,
            health: (healthMatch?.[1] as MaxAlignmentRun['health']) ?? 'warning',
            headline: headlineMatch?.[1]?.trim() ?? 'Completed',
            findings: extractFindings(run),
            timestamp: run.completed_at ?? run.started_at,
          }
          history.push(alignmentRun)
        }
      }
      set({ history })

      // Set last run from history
      if (history.length > 0) {
        set({ lastRun: history[0], findings: history[0].findings })
      }

      // Check if any run is currently running
      const runningRun = data.recent_runs.find((r) => r.status === 'running')
      if (runningRun) {
        set({ status: 'running', currentRepo: runningRun.repo_path })
      }
    } catch (error) {
      console.error('Failed to fetch max alignment status:', error)
    } finally {
      set({ loading: false })
    }
  },

  setRunning: (repo) => {
    set({ status: 'running', currentRepo: repo, error: null })
  },

  setCompleted: (result) => {
    const { history } = get()
    set({
      status: 'completed',
      currentRepo: null,
      lastRun: result,
      findings: result.findings,
      history: [result, ...history].slice(0, 20),
    })
  },

  setFailed: (error) => {
    set({ status: 'failed', currentRepo: null, error })
  },

  addFinding: (finding) => {
    const { findings } = get()
    set({ findings: [...findings, finding] })
  },
}))

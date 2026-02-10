/**
 * GitHub Store - GitHub integration state and actions
 */

import { create } from 'zustand'
import { fetchAPI } from './api'

// =============================================================================
// Types
// =============================================================================

export interface GitHubRepo {
  id: string
  path: string
  name: string
  github_owner?: string
  github_repo?: string
  github_default_branch?: string
  is_public?: number | null
  synced: boolean
}

export interface GitHubPR {
  repo_path: string
  pr_number: number
  pr_url?: string
  branch?: string
  title?: string
  status: 'open' | 'merged' | 'closed'
  timestamp: string
}

export interface RulesetEntry {
  id: number
  name: string
  enforcement: string
  target: string
}

export interface SecuritySetupResult {
  owner: string
  repo: string
  success: boolean
  error?: string
  features_enabled: string[]
}

interface GitHubState {
  repos: GitHubRepo[]
  prs: GitHubPR[]
  rulesets: Record<string, RulesetEntry[]>
  securityResults: SecuritySetupResult[]
  loading: boolean
  error: string | null

  fetchRepos: () => Promise<void>
  setupSecurity: () => Promise<SecuritySetupResult[]>
  getRulesets: (owner: string, repo: string) => Promise<RulesetEntry[]>
  applyRulesets: () => Promise<void>
  mergeTask: (taskId: string) => Promise<void>

  // PR lifecycle from SSE events
  addPR: (pr: GitHubPR) => void
  updatePR: (repoPath: string, prNumber: number, updates: Partial<GitHubPR>) => void
  removePR: (repoPath: string, prNumber: number) => void
}

// =============================================================================
// Store
// =============================================================================

export const useGitHubStore = create<GitHubState>((set, _get) => ({
  repos: [],
  prs: [],
  rulesets: {},
  securityResults: [],
  loading: false,
  error: null,

  fetchRepos: async () => {
    try {
      set({ loading: true, error: null })
      const repos = await fetchAPI<Array<{
        id: string
        path: string
        name: string
        github_owner?: string
        github_repo?: string
        github_default_branch?: string
        is_public?: number | null
      }>>('/repos')
      set({
        repos: repos.map((r) => ({
          ...r,
          synced: !!r.github_owner && !!r.github_repo,
        })),
      })
    } catch (error) {
      console.error('Failed to fetch repos:', error)
      set({ error: (error as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  setupSecurity: async () => {
    try {
      set({ loading: true, error: null })
      const result = await fetchAPI<SecuritySetupResult[]>('/github/setup-security', {
        method: 'POST',
      })
      set({ securityResults: result })
      return result
    } catch (error) {
      console.error('Failed to setup security:', error)
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  getRulesets: async (owner, repo) => {
    try {
      set({ loading: true, error: null })
      const response = await fetchAPI<{ rulesets: RulesetEntry[] }>(
        `/github/rulesets/${owner}/${repo}`
      )
      const key = `${owner}/${repo}`
      set((state) => ({
        rulesets: { ...state.rulesets, [key]: response.rulesets },
      }))
      return response.rulesets
    } catch (error) {
      console.error('Failed to fetch rulesets:', error)
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  applyRulesets: async () => {
    try {
      set({ loading: true, error: null })
      await fetchAPI('/github/rulesets/apply', { method: 'POST' })
    } catch (error) {
      console.error('Failed to apply rulesets:', error)
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  mergeTask: async (taskId) => {
    try {
      set({ loading: true, error: null })
      await fetchAPI(`/tasks/${taskId}/merge`, { method: 'POST' })
    } catch (error) {
      console.error('Failed to merge task:', error)
      set({ error: (error as Error).message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  addPR: (pr) => {
    set((state) => {
      const exists = state.prs.some(
        (p) => p.repo_path === pr.repo_path && p.pr_number === pr.pr_number
      )
      if (exists) return state
      return { prs: [...state.prs, pr] }
    })
  },

  updatePR: (repoPath, prNumber, updates) => {
    set((state) => ({
      prs: state.prs.map((p) =>
        p.repo_path === repoPath && p.pr_number === prNumber
          ? { ...p, ...updates }
          : p
      ),
    }))
  },

  removePR: (repoPath, prNumber) => {
    set((state) => ({
      prs: state.prs.filter(
        (p) => !(p.repo_path === repoPath && p.pr_number === prNumber)
      ),
    }))
  },
}))

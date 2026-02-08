/**
 * Repo Store - network repos
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import { useFlowStore } from './flowStore'
import type { BrowseResult } from '../types'
import type { Repo } from '@mycelium/shared'

interface RepoState {
  repos: Repo[]
  reposLoading: boolean

  fetchRepos: () => Promise<void>
  addRepo: (path: string, description?: string) => Promise<void>
  updateRepo: (
    id: string,
    updates: { description?: string; mode?: 'auto' | 'align'; weight?: number }
  ) => Promise<void>
  deleteRepo: (id: string) => Promise<void>
  browseDirectory: (path?: string) => Promise<BrowseResult>
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  reposLoading: false,

  fetchRepos: async () => {
    try {
      set({ reposLoading: true })
      const repos = await fetchAPI<Repo[]>('/repos')
      set({ repos })
      const byLang: Record<string, number> = {}
      for (const r of repos) {
        const lang = r.language || 'unknown'
        byLang[lang] = (byLang[lang] || 0) + 1
      }
      useFlowStore.getState().updateReposNodes(repos.length, byLang, 0)
    } catch (error) {
      console.error('Failed to fetch repos:', error)
    } finally {
      set({ reposLoading: false })
    }
  },

  addRepo: async (path, description) => {
    try {
      set({ reposLoading: true })
      await fetchAPI('/repos', {
        method: 'POST',
        body: JSON.stringify({ path, description }),
      })
      await get().fetchRepos()
    } catch (error) {
      console.error('Failed to add repo:', error)
      throw error
    } finally {
      set({ reposLoading: false })
    }
  },

  updateRepo: async (id, updates) => {
    try {
      set({ reposLoading: true })
      await fetchAPI(`/repos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      await get().fetchRepos()
    } catch (error) {
      console.error('Failed to update repo:', error)
      throw error
    } finally {
      set({ reposLoading: false })
    }
  },

  deleteRepo: async (id) => {
    try {
      await fetchAPI(`/repos/${id}`, { method: 'DELETE' })
      await get().fetchRepos()
    } catch (error) {
      console.error('Failed to delete repo:', error)
      throw error
    }
  },

  browseDirectory: async (path) => {
    const url = path ? `/repos/browse?path=${encodeURIComponent(path)}` : '/repos/browse'
    return fetchAPI<BrowseResult>(url)
  },
}))

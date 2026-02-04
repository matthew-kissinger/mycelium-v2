/**
 * Memory Store - patterns, warnings, grouped memory
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import type { GroupedMemory } from '../types'
import type { MemoryPattern, MemoryWarning } from '@mycelium/shared'

interface MemoryState {
  patterns: MemoryPattern[]
  warnings: MemoryWarning[]
  memoryLoading: boolean
  patternCount: number
  warningCount: number
  reposWithMemory: number
  groupedMemory: GroupedMemory | null

  fetchMemory: () => Promise<void>
  fetchMemoryDetails: () => Promise<void>
  deletePattern: (id: string) => Promise<void>
  deleteWarning: (id: string) => Promise<void>
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  patterns: [],
  warnings: [],
  memoryLoading: false,
  patternCount: 0,
  warningCount: 0,
  reposWithMemory: 0,
  groupedMemory: null,

  fetchMemory: async () => {
    try {
      const memory = await fetchAPI<{ patterns: MemoryPattern[]; warnings: MemoryWarning[] }>(
        '/memory/global'
      )
      set({
        patternCount: memory.patterns?.length || 0,
        warningCount: memory.warnings?.length || 0,
      })
    } catch (error) {
      console.error('Failed to fetch memory:', error)
    }
  },

  fetchMemoryDetails: async () => {
    try {
      set({ memoryLoading: true })
      const grouped = await fetchAPI<GroupedMemory>('/memory/all')

      const allPatterns = [
        ...grouped.global.patterns,
        ...Object.values(grouped.repos).flatMap((r) => r.patterns),
      ]
      const allWarnings = [
        ...grouped.global.warnings,
        ...Object.values(grouped.repos).flatMap((r) => r.warnings),
      ]

      set({
        patterns: allPatterns,
        warnings: allWarnings,
        patternCount: grouped.summary.total_patterns,
        warningCount: grouped.summary.total_warnings,
        reposWithMemory: grouped.summary.repos_with_memory,
        groupedMemory: grouped,
      })
    } catch (error) {
      console.error('Failed to fetch memory details:', error)
    } finally {
      set({ memoryLoading: false })
    }
  },

  deletePattern: async (id) => {
    try {
      await fetchAPI(`/memory/patterns/${id}`, { method: 'DELETE' })
      await get().fetchMemoryDetails()
    } catch (error) {
      console.error('Failed to delete pattern:', error)
      throw error
    }
  },

  deleteWarning: async (id) => {
    try {
      await fetchAPI(`/memory/warnings/${id}`, { method: 'DELETE' })
      await get().fetchMemoryDetails()
    } catch (error) {
      console.error('Failed to delete warning:', error)
      throw error
    }
  },
}))

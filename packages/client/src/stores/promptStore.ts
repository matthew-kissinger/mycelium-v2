/**
 * Prompt Store - system agent prompts
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import type { PromptInfo } from '../types'

interface PromptState {
  prompts: PromptInfo[]
  promptsLoading: boolean
  selectedPrompt: PromptInfo | null
  selectedPromptLoading: boolean

  fetchPrompts: () => Promise<void>
  fetchPrompt: (id: string) => Promise<void>
  updatePrompt: (id: string, content: string) => Promise<void>
  resetPrompt: (id: string) => Promise<void>
}

export const usePromptStore = create<PromptState>((set, get) => ({
  prompts: [],
  promptsLoading: false,
  selectedPrompt: null,
  selectedPromptLoading: false,

  fetchPrompts: async () => {
    try {
      set({ promptsLoading: true })
      const response = await fetchAPI<{ prompts: PromptInfo[] }>('/prompts')
      set({ prompts: response.prompts || [] })
    } catch (error) {
      console.error('Failed to fetch prompts:', error)
    } finally {
      set({ promptsLoading: false })
    }
  },

  fetchPrompt: async (id) => {
    try {
      set({ selectedPromptLoading: true })
      const prompt = await fetchAPI<PromptInfo>(`/prompts/${id}`)
      set({ selectedPrompt: prompt })
    } catch (error) {
      console.error('Failed to fetch prompt:', error)
      throw error
    } finally {
      set({ selectedPromptLoading: false })
    }
  },

  updatePrompt: async (id, content) => {
    try {
      set({ selectedPromptLoading: true })
      await fetchAPI(`/prompts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      await get().fetchPrompt(id)
      await get().fetchPrompts()
    } catch (error) {
      console.error('Failed to update prompt:', error)
      throw error
    } finally {
      set({ selectedPromptLoading: false })
    }
  },

  resetPrompt: async (id) => {
    try {
      set({ selectedPromptLoading: true })
      await fetchAPI(`/prompts/${id}/reset`, { method: 'POST' })
      await get().fetchPrompt(id)
      await get().fetchPrompts()
    } catch (error) {
      console.error('Failed to reset prompt:', error)
      throw error
    } finally {
      set({ selectedPromptLoading: false })
    }
  },
}))

/**
 * Signal Store - alignment signals
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import { useUIStore } from './uiStore'
import type { Signal } from '../types'

interface SignalState {
  signals: Signal[]
  signalsLoading: boolean
  pendingSignalCount: number
  totalSignalCount: number

  fetchSignals: () => Promise<void>
  respondToSignal: (signalId: string, response: string) => Promise<void>
  deleteSignal: (signalId: string) => Promise<void>
}

export const useSignalStore = create<SignalState>((set, get) => ({
  signals: [],
  signalsLoading: false,
  pendingSignalCount: 0,
  totalSignalCount: 0,

  fetchSignals: async () => {
    try {
      set({ signalsLoading: true })
      const signals = await fetchAPI<Signal[]>('/signals')
      const pending = signals.filter((s) => s.status === 'pending').length
      set({ signals, pendingSignalCount: pending, totalSignalCount: signals.length })
    } catch (error) {
      console.error('Failed to fetch signals:', error)
    } finally {
      set({ signalsLoading: false })
    }
  },

  respondToSignal: async (signalId, response) => {
    try {
      await fetchAPI(`/signals/${signalId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ response }),
      })
      useUIStore.getState().addToast('success', 'Signal responded')
      await get().fetchSignals()
    } catch (error) {
      console.error('Failed to respond to signal:', error)
      useUIStore.getState().addToast('error', `Failed to respond: ${(error as Error).message}`)
      throw error
    }
  },

  deleteSignal: async (signalId) => {
    try {
      await fetchAPI(`/signals/${signalId}`, { method: 'DELETE' })
      await get().fetchSignals()
    } catch (error) {
      console.error('Failed to delete signal:', error)
      useUIStore.getState().addToast('error', `Failed to delete signal: ${(error as Error).message}`)
      throw error
    }
  },
}))

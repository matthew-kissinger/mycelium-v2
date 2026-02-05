/**
 * UI Store - panel state, toasts
 */

import { create } from 'zustand'
import type { PanelState, PanelType, Toast } from '../types'

interface UIState {
  // Panel
  panel: PanelState
  sidebarCollapsed: boolean

  // Toasts
  toasts: Toast[]

  // Actions
  openPanel: (type: PanelType, nodeId: string, data?: Record<string, unknown>) => void
  closePanel: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void

  // Toast actions
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
}

let toastCounter = 0

// Default sidebar to collapsed (mobile: hidden, desktop: narrow 48px)
// User can expand via hamburger (mobile) or collapse toggle (desktop)
export const useUIStore = create<UIState>((set) => ({
  panel: { type: null, nodeId: null },
  sidebarCollapsed: true,
  toasts: [],

  openPanel: (type, nodeId, data) => {
    set({ panel: { type, nodeId, data } })
  },

  closePanel: () => {
    set({ panel: { type: null, nodeId: null } })
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed })
  },

  addToast: (type, message) => {
    const id = `toast-${++toastCounter}`
    const toast: Toast = { id, type, message, createdAt: Date.now() }
    set((state) => ({ toasts: [...state.toasts, toast] }))

    // Auto-dismiss non-error toasts after 5s
    if (type !== 'error') {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
      }, 5000)
    }
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))

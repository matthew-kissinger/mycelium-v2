/**
 * Inventory Store - skills and MCP servers
 */

import { create } from 'zustand'
import { fetchAPI } from './api'
import type { Inventory } from '../types'

interface InventoryState {
  inventory: Inventory | null
  inventoryLoading: boolean

  fetchInventory: () => Promise<void>
  triggerArmory: (force?: boolean) => Promise<void>
}

export const useInventoryStore = create<InventoryState>((set) => ({
  inventory: null,
  inventoryLoading: false,

  fetchInventory: async () => {
    try {
      set({ inventoryLoading: true })
      const inventory = await fetchAPI<Inventory>('/inventory')
      set({ inventory })
    } catch (error) {
      console.error('Failed to fetch inventory:', error)
    } finally {
      set({ inventoryLoading: false })
    }
  },

  triggerArmory: async (force = false) => {
    try {
      await fetchAPI(`/inventory/armory${force ? '?force=true' : ''}`, {
        method: 'POST',
      })
    } catch (error) {
      console.error('Failed to trigger armory:', error)
      throw error
    }
  },
}))

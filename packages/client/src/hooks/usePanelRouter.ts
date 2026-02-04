/**
 * URL query param routing for panels
 *
 * Syncs panel state to URL for deep linking.
 * Format: ?panel=taskPool&taskId=abc123
 */

import { useEffect, useRef } from 'react'
import { useUIStore } from '../stores/uiStore'
import type { PanelType } from '../flow/types'

const VALID_PANELS: PanelType[] = [
  'scheduler', 'cycle', 'taskPool', 'agent',
  'alignment', 'memory', 'prompts', 'logs',
  'repos', 'inventory',
]

export function usePanelRouter() {
  const { panel, openPanel, closePanel } = useUIStore()
  const initialized = useRef(false)

  // On mount: read URL params and open panel if specified
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const params = new URLSearchParams(window.location.search)
    const panelType = params.get('panel') as PanelType
    const taskId = params.get('taskId')
    const taskTitle = params.get('taskTitle')
    const promptId = params.get('promptId')

    if (panelType && VALID_PANELS.includes(panelType)) {
      const data: Record<string, unknown> = {}
      if (taskId) data.taskId = taskId
      if (taskTitle) data.taskTitle = taskTitle
      if (promptId) data.promptId = promptId

      openPanel(panelType, panelType, Object.keys(data).length > 0 ? data : undefined)
    }
  }, [openPanel])

  // Sync panel state to URL
  useEffect(() => {
    const params = new URLSearchParams()

    if (panel.type) {
      params.set('panel', panel.type)
      if (panel.data?.taskId) params.set('taskId', panel.data.taskId as string)
      if (panel.data?.taskTitle) params.set('taskTitle', panel.data.taskTitle as string)
      if (panel.data?.promptId) params.set('promptId', panel.data.promptId as string)
    }

    const search = params.toString()
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [panel])

  return { panel, openPanel, closePanel }
}

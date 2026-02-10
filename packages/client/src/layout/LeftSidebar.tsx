/**
 * Left Sidebar - Grouped navigation with live countdowns
 */

import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSystemStore } from '../stores/system'
import { useSchedulerStore } from '../stores/schedulerStore'
import { useRegistryStore } from '../stores/registryStore'
import { useGitHubStore } from '../stores/githubStore'
import { useMaxAlignmentStore } from '../stores/maxAlignmentStore'
import type { PanelType } from '../flow/types'

interface SidebarItem {
  type: PanelType
  label: string
  shortLabel: string
  nodeId?: string
  data?: Record<string, unknown>
  getValue: () => string
  subItems?: SubItem[]
}

interface SubItem {
  label: string
  value: string
  isReady: boolean
}

interface SidebarSection {
  header: string
  items: SidebarItem[]
}

/** Format countdown to next run from next_run ISO string */
function formatNextRun(nextRun?: string, lastRun?: string): string {
  if (nextRun) {
    const next = new Date(nextRun)
    const now = new Date()
    const diff = Math.floor((next.getTime() - now.getTime()) / 1000)
    if (diff <= 0) return 'due'
    if (diff < 60) return `in ${diff}s`
    if (diff < 3600) return `in ${Math.floor(diff / 60)}m`
    return `in ${Math.floor(diff / 3600)}h`
  }
  // Fallback to last run
  if (!lastRun) return '-'
  const date = new Date(lastRun)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function LeftSidebar() {
  const { sidebarCollapsed, toggleSidebar, openPanel, closePanel, panel } = useUIStore()
  const {
    scheduler,
    stats,
    repos,
    pendingSignalCount,
    patternCount,
    warningCount,
    inventory,
    groupedMemory,
    fetchRepos,
  } = useSystemStore()

  const { shepherdStatus, fetchShepherdStatus } = useSchedulerStore()

  useEffect(() => {
    fetchRepos()
    fetchShepherdStatus()
  }, [fetchRepos, fetchShepherdStatus])

  const getCycle = (name: string) =>
    scheduler?.cycles?.find((c) => c.name === name)

  /** Build shepherd sub-items showing per-repo unevaluated breakdown */
  const getShepherdSubItems = (): SubItem[] => {
    if (!shepherdStatus || shepherdStatus.total_unevaluated === 0) return []
    const bs = shepherdStatus.batch_size
    return Object.entries(shepherdStatus.repos)
      .filter(([, s]) => s.unevaluated > 0)
      .sort(([, a], [, b]) => b.unevaluated - a.unevaluated)
      .map(([path, s]) => {
        const name = path.split('/').pop() || path
        return {
          label: name,
          value: `${s.unevaluated}/${bs}`,
          isReady: s.unevaluated >= bs,
        }
      })
  }

  const shepherdSubItems = getShepherdSubItems()

  /** Build memory sub-items showing per-repo pattern/warning breakdown */
  const getMemorySubItems = (): SubItem[] => {
    if (!groupedMemory) return []
    const items: SubItem[] = []
    // Global memory
    const gp = groupedMemory.global.patterns.length
    const gw = groupedMemory.global.warnings.length
    if (gp > 0 || gw > 0) {
      items.push({ label: 'global', value: `${gp}P ${gw}W`, isReady: gw > 0 })
    }
    // Per-repo memory
    for (const [path, data] of Object.entries(groupedMemory.repos)) {
      const p = data.patterns.length
      const w = data.warnings.length
      if (p > 0 || w > 0) {
        const name = path.split('/').pop() || path
        items.push({ label: name, value: `${p}P ${w}W`, isReady: w > 0 })
      }
    }
    return items.sort((a, b) => {
      // Global first, then by total count descending
      if (a.label === 'global') return -1
      if (b.label === 'global') return 1
      return 0
    })
  }

  const memorySubItems = getMemorySubItems()

  const getShepherdValue = (): string => {
    if (shepherdSubItems.length > 0) {
      const readyCount = shepherdSubItems.filter((s) => s.isReady).length
      if (readyCount > 0) return `${readyCount} ready`
      // Show max progress toward threshold (e.g., "3/5" for repo closest to ready)
      const maxUnevaluated = Math.max(
        ...Object.values(shepherdStatus!.repos).map((r) => r.unevaluated)
      )
      const bs = shepherdStatus!.batch_size
      return `${maxUnevaluated}/${bs}`
    }
    const c = getCycle('shepherd')
    return formatNextRun(c?.next_run, c?.last_run)
  }

  const sections: SidebarSection[] = [
    {
      header: 'PIPELINE',
      items: [
        {
          type: 'scheduler',
          label: 'Scheduler',
          shortLabel: 'SCH',
          getValue: () => scheduler?.running ? 'Running' : 'Stopped',
        },
        {
          type: 'cycle',
          label: 'Discovery',
          shortLabel: 'DSC',
          nodeId: 'discovery',
          data: { cycleType: 'discovery' },
          getValue: () => {
            const c = getCycle('discovery')
            return formatNextRun(c?.next_run, c?.last_run)
          },
        },
        {
          type: 'cycle',
          label: 'Dispatcher',
          shortLabel: 'DIS',
          nodeId: 'dispatcher',
          data: { cycleType: 'dispatcher' },
          getValue: () => {
            const c = getCycle('dispatcher')
            return formatNextRun(c?.next_run, c?.last_run)
          },
        },
        {
          type: 'cycle',
          label: 'Shepherd',
          shortLabel: 'SHP',
          nodeId: 'shepherd',
          data: { cycleType: 'shepherd' },
          getValue: getShepherdValue,
          subItems: shepherdSubItems,
        },
        {
          type: 'maxAlignment' as PanelType,
          label: 'Max Align',
          shortLabel: 'MAX',
          nodeId: 'max-alignment',
          getValue: () => {
            const s = useMaxAlignmentStore.getState()
            if (s.status === 'running') return 'running'
            if (s.lastRun) return s.lastRun.health
            return 'idle'
          },
        },
      ],
    },
    {
      header: 'TASKS',
      items: [
        {
          type: 'taskPool',
          label: 'Unsequenced',
          shortLabel: 'NEW',
          data: { filter: 'unsequenced' },
          getValue: () => `${stats?.unsequenced ?? 0}`,
        },
        {
          type: 'taskPool',
          label: 'Ready',
          shortLabel: 'RDY',
          data: { filter: 'ready' },
          getValue: () => `${stats?.ready ?? 0}`,
        },
        {
          type: 'taskPool',
          label: 'Running',
          shortLabel: 'RUN',
          data: { filter: 'running' },
          getValue: () => `${stats?.running ?? 0}`,
        },
        {
          type: 'taskPool',
          label: 'Done',
          shortLabel: 'DON',
          data: { filter: 'done' },
          getValue: () => `${stats?.done ?? 0}`,
        },
        {
          type: 'taskPool',
          label: 'Failed',
          shortLabel: 'ERR',
          data: { filter: 'failed' },
          getValue: () => `${stats?.failed ?? 0}`,
        },
      ],
    },
    {
      header: 'SUPPORT',
      items: [
        {
          type: 'cycle',
          label: 'Armory',
          shortLabel: 'ARM',
          nodeId: 'armory',
          data: { cycleType: 'armory' },
          getValue: () => {
            const c = getCycle('armory')
            return formatNextRun(c?.next_run, c?.last_run)
          },
        },
        {
          type: 'cycle',
          label: 'Blocked',
          shortLabel: 'BLK',
          nodeId: 'blocked-check',
          data: { cycleType: 'blocked_check' },
          getValue: () => {
            const c = getCycle('blocked_check')
            return formatNextRun(c?.next_run, c?.last_run)
          },
        },
        {
          type: 'cycle',
          label: 'Digest',
          shortLabel: 'DIG',
          nodeId: 'digest',
          data: { cycleType: 'digest' },
          getValue: () => {
            const c = getCycle('digest')
            return formatNextRun(c?.next_run, c?.last_run)
          },
        },
        {
          type: 'cycle',
          label: 'Compaction',
          shortLabel: 'CMP',
          nodeId: 'compaction',
          data: { cycleType: 'compaction' },
          getValue: () => {
            const c = getCycle('compaction')
            return formatNextRun(c?.next_run, c?.last_run)
          },
        },
        {
          type: 'cycle',
          label: 'Health',
          shortLabel: 'HLT',
          nodeId: 'health-check',
          data: { cycleType: 'health_check' },
          getValue: () => {
            const c = getCycle('health_check')
            return formatNextRun(c?.next_run, c?.last_run)
          },
        },
        {
          type: 'registry' as PanelType,
          label: 'Registry',
          shortLabel: 'REG',
          nodeId: 'registry',
          getValue: () => {
            const r = useRegistryStore.getState()
            if (r.agents.length > 0) {
              const online = r.agents.filter(a => a.status === 'online').length
              return `${online}/${r.agents.length}`
            }
            return '-'
          },
        },
      ],
    },
    {
      header: 'DATA',
      items: [
        {
          type: 'alignment',
          label: 'Signals',
          shortLabel: 'SIG',
          getValue: () => pendingSignalCount > 0 ? `${pendingSignalCount} pending` : '0',
        },
        {
          type: 'memory',
          label: 'Memory',
          shortLabel: 'MEM',
          getValue: () => `${patternCount}P ${warningCount}W`,
          subItems: memorySubItems,
        },
        {
          type: 'repos' as PanelType,
          label: 'Repos',
          shortLabel: 'REP',
          getValue: () => `${repos.length}`,
        },
        {
          type: 'github' as PanelType,
          label: 'GitHub',
          shortLabel: 'GH',
          nodeId: 'github',
          getValue: () => {
            const gh = useGitHubStore.getState()
            const synced = gh.repos.filter(r => r.synced).length
            if (gh.repos.length > 0) return `${synced}/${gh.repos.length}`
            return '-'
          },
        },
        {
          type: 'inventory',
          label: 'Inventory',
          shortLabel: 'INV',
          getValue: () => {
            if (!inventory) return '-'
            return `${inventory.skills_count}S ${inventory.mcps_count}M`
          },
        },
        {
          type: 'prompts',
          label: 'Prompts',
          shortLabel: 'PRM',
          getValue: () => '',
        },
      ],
    },
  ]

  const handleClick = (item: SidebarItem) => {
    const itemKey = `${item.type}:${item.nodeId || item.shortLabel}`
    const currentKey = `${panel.type}:${panel.nodeId || ''}`
    if (itemKey === currentKey) {
      closePanel()
    } else {
      openPanel(item.type, item.nodeId || item.shortLabel, item.data)
    }
  }

  return (
    <aside
      className={`flex flex-col h-full bg-zinc-900 transition-all ${
        sidebarCollapsed ? 'w-12' : 'w-60'
      }`}
    >
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-b border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
      >
        <svg
          className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <nav className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.header}>
            {!sidebarCollapsed && (
              <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider px-3 pt-3 pb-1">
                {section.header}
              </div>
            )}
            {sidebarCollapsed && <div className="h-2" />}

            {section.items.map((item) => {
              const itemKey = `${item.type}:${item.nodeId || item.shortLabel}`
              const currentKey = `${panel.type}:${panel.nodeId || ''}`
              const isActive = itemKey === currentKey
              const value = item.getValue()
              const isRunning = value.includes('running') || value === 'Running'
              const isDue = value === 'due'
              const isReady = value.includes('ready')

              return (
                <div key={itemKey}>
                  <button
                    onClick={() => handleClick(item)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span className={`text-xs font-mono w-8 shrink-0 text-center ${
                      isRunning ? 'text-green-400' : ''
                    }`}>
                      {item.shortLabel}
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className="text-sm flex-1 truncate">{item.label}</span>
                        <span className={`text-xs font-mono tabular-nums truncate max-w-24 ${
                          isRunning ? 'text-green-400'
                            : isDue ? 'text-amber-400'
                            : isReady ? 'text-amber-400'
                            : value.startsWith('in ') ? 'text-zinc-400'
                            : 'text-zinc-500'
                        }`}>
                          {value}
                        </span>
                      </>
                    )}
                  </button>
                  {/* Per-repo sub-items (e.g., shepherd unevaluated breakdown) */}
                  {!sidebarCollapsed && item.subItems && item.subItems.length > 0 && (
                    <div className="pl-[52px] pr-3">
                      {item.subItems.map((sub) => (
                        <div
                          key={sub.label}
                          className="flex items-center justify-between py-0.5 text-[10px] font-mono"
                        >
                          <span className="text-zinc-500 truncate mr-2">{sub.label}</span>
                          <span className={sub.isReady ? 'text-amber-400' : 'text-zinc-500'}>
                            {sub.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

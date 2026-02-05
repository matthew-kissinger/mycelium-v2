/**
 * AppLayout - Responsive three-column layout
 *
 * Mobile: Canvas only (sidebar via hamburger, panel as full-screen modal)
 * Tablet: Collapsed sidebar | Canvas | Panel as modal
 * Desktop: Sidebar | Canvas | Panel
 *
 * Sidebar spans full viewport height (left edge to bottom)
 */

import { LeftSidebar } from './LeftSidebar'
import { Header } from '../components/Header'
import { useUIStore } from '../stores/uiStore'
import type { Stats } from '@mycelium/shared'

interface AppLayoutProps {
  children: React.ReactNode
  rightPanel?: React.ReactNode
  stats?: Stats
}

export function AppLayout({ children, rightPanel, stats }: AppLayoutProps) {
  const panelOpen = useUIStore((s) => s.panel.type !== null)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left sidebar - full height, hidden on mobile */}
      <div className="hidden md:flex flex-col h-full border-r border-zinc-800">
        <LeftSidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {!sidebarCollapsed && (
        <div className="md:hidden fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => useUIStore.getState().toggleSidebar()}
          />
          {/* Sidebar */}
          <div className="absolute left-0 top-0 h-full w-64 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
            <LeftSidebar />
          </div>
        </div>
      )}

      {/* Main content area - header + canvas */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header stats={stats} />

        {/* Center - flow canvas */}
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>

      {/* Right panel - modal on mobile/tablet, fixed panel on desktop */}
      {panelOpen && (
        <>
          {/* Mobile/Tablet: Full-screen modal */}
          <div className="lg:hidden fixed inset-0 z-50 bg-zinc-900">
            {rightPanel}
          </div>
          {/* Desktop: Fixed panel */}
          <div className="hidden lg:block h-full">
            {rightPanel}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * AppLayout - Three-column layout
 *
 * Left sidebar (nav) | Center (flow canvas) | Right panel (detail)
 */

import { LeftSidebar } from './LeftSidebar'
import { useUIStore } from '../stores/uiStore'

interface AppLayoutProps {
  children: React.ReactNode
  rightPanel?: React.ReactNode
}

export function AppLayout({ children, rightPanel }: AppLayoutProps) {
  const panelOpen = useUIStore((s) => s.panel.type !== null)

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left sidebar */}
      <LeftSidebar />

      {/* Center - flow canvas */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>

      {/* Right panel */}
      {panelOpen && rightPanel}
    </div>
  )
}

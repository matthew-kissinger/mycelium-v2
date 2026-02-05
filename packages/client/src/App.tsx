/**
 * Mycelium v2 - Agent Orchestration UI
 *
 * Three-column layout: sidebar | flow canvas | detail panel
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SystemView } from './components/SystemView'
import { AppLayout } from './layout/AppLayout'
import { RightPanel } from './layout/RightPanel'
import { ToastContainer } from './components/ToastContainer'
import { usePanelRouter } from './hooks/usePanelRouter'
import type { Stats } from '@mycelium/shared'

async function fetchStats(): Promise<Stats> {
  const res = await fetch('/api/stats')
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

function AppContent() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 5000,
  })

  // Sync panel state to URL
  usePanelRouter()

  // Check if backend is available
  const [backendAvailable, setBackendAvailable] = useState(true)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkBackend() {
      try {
        const res = await fetch('/api/health')
        setBackendAvailable(res.ok)
      } catch {
        setBackendAvailable(false)
      } finally {
        setChecking(false)
      }
    }
    checkBackend()
  }, [])

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full mx-auto mb-4" />
          <p className="text-zinc-400">Connecting to Mycelium...</p>
        </div>
      </div>
    )
  }

  if (!backendAvailable) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-zinc-100 mb-2">Backend Not Available</h1>
          <p className="text-zinc-400 mb-4">
            The Mycelium server is not running. Start it with:
          </p>
          <code className="block bg-zinc-800 text-zinc-300 p-3 rounded-lg text-sm">
            bun run dev:server
          </code>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <AppLayout rightPanel={<RightPanel />} stats={stats}>
        <SystemView />
      </AppLayout>

      <ToastContainer />
    </div>
  )
}

export default function App() {
  return <AppContent />
}

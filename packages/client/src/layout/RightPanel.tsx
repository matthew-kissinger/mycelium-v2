/**
 * Right Panel - Detail panel in three-column layout (no backdrop overlay)
 */

import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSystemStore } from '../stores/system'
import type { PanelType } from '../flow/types'
import {
  SchedulerPanel,
  CyclePanel,
  TaskPoolPanel,
  AgentPanel,
  AlignmentPanel,
  MemoryPanel,
  PromptsPanel,
  LiveLogViewer,
  ReposPanel,
  InventoryPanel,
} from '../panels'

export function RightPanel() {
  const { panel } = useUIStore()
  const closePanel = useUIStore((s) => s.closePanel)

  // Handle escape key
  useEffect(() => {
    if (!panel.type) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [panel.type, closePanel])

  if (!panel.type) return null

  const panelTitle: Record<string, string> = {
    scheduler: 'Scheduler',
    cycle: (panel.data?.label as string) || 'Cycle',
    taskPool: 'Task Pool',
    agent: 'Running Agents',
    alignment: 'Alignment Signals',
    memory: 'Memory (Hyphae)',
    prompts: 'System Prompts',
    logs: `Task Logs${panel.data?.taskTitle ? `: ${(panel.data.taskTitle as string).slice(0, 30)}` : ''}`,
    repos: 'Network Repos',
    inventory: 'Skills & MCPs',
  }

  return (
    <aside className="w-[400px] border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100 truncate">
          {panelTitle[panel.type] || panel.type}
        </h2>
        <button
          onClick={closePanel}
          className="text-zinc-500 hover:text-zinc-200 p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <PanelContent type={panel.type} data={panel.data} nodeId={panel.nodeId} />
      </div>
    </aside>
  )
}

function PanelContent({ type, data, nodeId }: { type: PanelType; data?: Record<string, unknown>; nodeId: string | null }) {
  const store = useSystemStore()

  switch (type) {
    case 'scheduler':
      return (
        <SchedulerPanel
          scheduler={store.scheduler}
          onStart={store.startScheduler}
          onStop={store.stopScheduler}
          loading={store.schedulerLoading}
          config={store.schedulerConfig}
          configLoading={store.schedulerConfigLoading}
          onFetchConfig={store.fetchSchedulerConfig}
          onUpdateConfig={store.updateSchedulerConfig}
        />
      )

    case 'cycle': {
      const cycleType = (data?.cycleType as string) || nodeId?.replace('-', '_') || ''
      const promptId = {
        discovery: 'discovery',
        sequencer: 'sequencer',
        shepherd: 'shepherd',
      }[cycleType] as string | undefined

      return (
        <CyclePanel
          nodeId={nodeId}
          data={data}
          onTrigger={store.triggerCycle}
          onOpenPrompts={
            promptId
              ? () => {
                  useUIStore.getState().openPanel('prompts', 'prompts', { promptId })
                }
              : undefined
          }
          config={store.schedulerConfig}
          configLoading={store.schedulerConfigLoading}
          onFetchConfig={store.fetchSchedulerConfig}
          onUpdateConfig={store.updateSchedulerConfig}
        />
      )
    }

    case 'taskPool':
      return (
        <TaskPoolPanel
          stats={store.stats}
          tasks={store.tasks}
          tasksTotal={store.tasksTotal}
          tasksLoading={store.tasksLoading}
          taskFilters={store.taskFilters}
          selectedTask={store.selectedTask}
          selectedTaskLoading={store.selectedTaskLoading}
          taskGraph={store.taskGraph}
          taskGraphLoading={store.taskGraphLoading}
          onFetchTasks={store.fetchTasks}
          onSetFilters={store.setTaskFilters}
          onFetchTask={store.fetchTask}
          onRunTask={store.runTask}
          onCancelTask={store.cancelTask}
          onDeleteTask={store.deleteTask}
          onCloneTask={store.cloneTask}
          onRetryTask={store.retryTask}
          onFetchGraph={store.fetchTaskGraph}
          onClearSelected={store.clearSelectedTask}
          onViewLogs={(taskId, taskTitle) => {
            useUIStore.getState().openPanel('logs', 'logs', { taskId, taskTitle })
          }}
        />
      )

    case 'agent':
      return (
        <AgentPanel
          runningTasks={store.runningTasks}
          agentConfigs={store.agentConfigs}
          loading={store.agentConfigsLoading}
          onFetchConfigs={store.fetchAgentConfigs}
          onUpdateConfig={store.updateAgentConfig}
          onViewLogs={(taskId, taskTitle) => {
            useUIStore.getState().openPanel('logs', 'logs', { taskId, taskTitle })
          }}
        />
      )

    case 'alignment':
      return (
        <AlignmentPanel
          signals={store.signals}
          loading={store.signalsLoading}
          pendingCount={store.pendingSignalCount}
          onFetch={store.fetchSignals}
          onRespond={store.respondToSignal}
          onDelete={store.deleteSignal}
        />
      )

    case 'memory':
      return (
        <MemoryPanel
          patterns={store.patterns}
          warnings={store.warnings}
          loading={store.memoryLoading}
          patternCount={store.patternCount}
          warningCount={store.warningCount}
          reposWithMemory={store.reposWithMemory}
          groupedMemory={store.groupedMemory}
          onFetch={store.fetchMemoryDetails}
          onDeletePattern={store.deletePattern}
          onDeleteWarning={store.deleteWarning}
        />
      )

    case 'prompts':
      return (
        <PromptsPanel
          prompts={store.prompts}
          loading={store.promptsLoading}
          selectedPrompt={store.selectedPrompt}
          selectedPromptLoading={store.selectedPromptLoading}
          onFetchPrompts={store.fetchPrompts}
          onFetchPrompt={store.fetchPrompt}
          onUpdatePrompt={store.updatePrompt}
          onResetPrompt={store.resetPrompt}
          initialPromptId={data?.promptId as string | undefined}
        />
      )

    case 'logs':
      return (
        <LiveLogViewer
          taskId={data?.taskId as string}
          taskTitle={data?.taskTitle as string}
          logs={store.taskLogs[data?.taskId as string] || []}
          loading={store.taskLogsLoading[data?.taskId as string] || false}
          onFetchLogs={store.fetchTaskLogs}
          onClearLogs={store.clearTaskLogs}
        />
      )

    case 'repos':
      return (
        <ReposPanel
          repos={store.repos}
          loading={store.reposLoading}
          onFetch={store.fetchRepos}
          onUpdate={store.updateRepo}
          onDelete={store.deleteRepo}
          onAdd={store.addRepo}
          onBrowse={store.browseDirectory}
        />
      )

    case 'inventory':
      return (
        <InventoryPanel
          inventory={store.inventory}
          loading={store.inventoryLoading}
          onFetch={store.fetchInventory}
          onTriggerArmory={store.triggerArmory}
        />
      )

    default:
      return <div className="text-zinc-500 text-sm">Unknown panel: {type}</div>
  }
}

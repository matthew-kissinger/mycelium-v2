/**
 * Panel - Side panel for drill-in views
 *
 * Thin router that imports panel content from panels/ directory.
 */

import { useEffect } from 'react'
import type { PanelType } from '../flow/types'
import { useSystemStore } from '../stores/system'
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
  RegistryPanel,
  GitHubPanel,
  MaxAlignmentPanel,
} from '../panels'
import { useGitHubStore } from '../stores/githubStore'

interface PanelProps {
  type: PanelType
  nodeId: string | null
  data?: Record<string, unknown>
  onClose: () => void
}

export function Panel({ type, nodeId, data, onClose }: PanelProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const panelTitle = {
    scheduler: 'Scheduler',
    cycle: (data?.label as string) || 'Cycle',
    taskPool: 'Task Pool',
    agent: 'Running Agents',
    alignment: 'Alignment Signals',
    memory: 'Memory (Hyphae)',
    prompts: 'System Prompts',
    logs: `Task Logs${data?.taskTitle ? `: ${(data.taskTitle as string).slice(0, 30)}` : ''}`,
    repos: 'Network Repos',
    inventory: 'Skills & MCPs',
    registry: 'Agent Registry',
    github: 'GitHub Integration',
    maxAlignment: 'Max Alignment',
  }[type || 'scheduler']

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 z-10"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-96 bg-zinc-900 border-l border-zinc-700 z-20 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-100">{panelTitle}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <PanelContent type={type} nodeId={nodeId} data={data} />
        </div>
      </div>
    </>
  )
}

function PanelContent({
  type,
  nodeId,
  data,
}: {
  type: PanelType
  nodeId: string | null
  data?: Record<string, unknown>
}) {
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
                  useSystemStore.getState().openPanel('prompts', 'prompts', { promptId })
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
            useSystemStore.getState().openPanel('logs', 'logs', { taskId, taskTitle })
          }}
        />
      )

    case 'agent':
      return (
        <AgentPanel
          runningTasks={store.runningTasks}
          agentConfigs={store.agentConfigs}
          agentHealth={store.agentHealth}
          clineInfo={store.clineInfo}
          agentStats={store.agentStats}
          loading={store.agentConfigsLoading}
          onFetchConfigs={store.fetchAgentConfigs}
          onFetchHealth={store.fetchAgentHealth}
          onFetchAgentStats={store.fetchAgentStats}
          onUpdateConfig={store.updateAgentConfig}
          onViewLogs={(taskId, taskTitle) => {
            useSystemStore.getState().openPanel('logs', 'logs', { taskId, taskTitle })
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

    case 'registry':
      return <RegistryPanel />

    case 'github': {
      const gh = useGitHubStore()
      return (
        <GitHubPanel
          repos={gh.repos}
          prs={gh.prs}
          rulesets={gh.rulesets}
          securityResults={gh.securityResults}
          loading={gh.loading}
          error={gh.error}
          onFetchRepos={gh.fetchRepos}
          onSetupSecurity={gh.setupSecurity}
          onGetRulesets={gh.getRulesets}
          onApplyRulesets={gh.applyRulesets}
          onMergeTask={gh.mergeTask}
        />
      )
    }

    case 'maxAlignment':
      return <MaxAlignmentPanel />

    default:
      return <div className="text-zinc-500">Unknown panel type</div>
  }
}

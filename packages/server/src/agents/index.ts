export { dispatch, type DispatchOptions } from './dispatch'
export {
  registerProcess,
  unregisterProcess,
  getRunningProcessCount,
  getRunningProcesses,
  killProcess,
  killAllProcesses,
  clearDependencies,
  shutdown as shutdownRegistry,
  type ProcessInfo,
} from './registry'
export {
  acquireClineInstance,
  releaseClineInstance,
  cleanupClineInstances,
  getClinePoolStatus,
} from './cline-instances'
export {
  prepareWorkspace,
  cleanupWorkspace,
  cleanupAllWorkspaces,
  getWorktreeInfo,
  getBranchDiff,
  pushBranchToGithub,
  type WorktreeResult,
  type WorktreeInfo,
  type BranchDiff,
} from './workspace'
export {
  extractError,
  recordSuccess,
  recordFailure,
  isAgentAvailable,
  getAllHealth,
  getHealthSummary,
  checkOpenRouterCredits,
  checkClineCredits,
  getClineProvider,
  getOpenRouterFreeModels,
  checkGroqStatus,
  checkCerebrasStatus,
  checkMistralStatus,
  checkAllProviderStatus,
  resetHealth,
} from './health'

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
  initHealthFromDb,
} from './health'
export {
  initRegistryCache,
  reloadCache,
  isCacheReady,
  _resetCacheForTesting,
  _markInitializedForTesting,
  getCachedAgent,
  getCachedAllAgents,
  getCachedEnabledAgents,
  getCachedProvider,
  getCachedAllProviders,
  getCachedModel,
  getCachedModelsForAgent,
  getCachedModelsForProvider,
  getCachedDefaultModel,
  getCachedFallbackModel,
  getCachedCrossAgentFallback,
  getCachedHealthState,
  getCachedAllHealth,
} from './registry-cache'
export {
  loadCredentials,
  getCredential,
  hasCredential,
  getAvailableCredentialKeys,
  reloadCredentials,
} from './credentials'
export {
  detectAgent,
  detectAllAgents,
  fetchAgentModels,
} from './detect'
export {
  fetchProviderModels,
  fetchAllProviderModels,
  persistFetchedModels,
  type FetchResult,
  type FetchedModel,
} from './fetch-models'
export {
  getAdapter,
  registerAdapter,
  getAllAdapters,
  getClineConfig,
  type AgentAdapter,
  type AdapterOptions,
} from './adapters'

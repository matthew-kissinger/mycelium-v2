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

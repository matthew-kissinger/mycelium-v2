/**
 * Panel components - extracted from Panel.tsx
 *
 * Note: RightPanel.tsx uses React.lazy() to load these components for code splitting.
 * Direct imports here are kept for backwards compatibility and non-lazy use cases.
 */

export { SchedulerPanel } from './SchedulerPanel'
export { CyclePanel } from './CyclePanel'
export { TaskPoolPanel } from './TaskPoolPanel'
export { AgentPanel } from './AgentPanel'
export { AlignmentPanel } from './AlignmentPanel'
export { MemoryPanel } from './MemoryPanel'
export { PromptsPanel } from './PromptsPanel'
export { LiveLogViewer } from './LogsPanel'
export { ReposPanel } from './ReposPanel'
export { InventoryPanel } from './InventoryPanel'
export { RegistryPanel } from './RegistryPanel'
export { GitHubPanel } from './GitHubPanel'
export { MaxAlignmentPanel } from './MaxAlignmentPanel'
export { ConfigInput, ConfigToggle } from './components/ConfigControls'

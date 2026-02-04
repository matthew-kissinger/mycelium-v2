/**
 * MemoryNode - Hyphae patterns and warnings
 *
 * Updated to work with the system architecture flow.
 * Can show global memory or repo-specific memory summary.
 */

import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

// Extended data type for backward compatibility with existing patterns/warnings
interface ExtendedMemoryNodeData {
  label: string
  description?: string
  pattern_count: number
  warning_count: number
  repos_with_memory: number
  patterns?: Array<{
    id: string
    content: string
    tags?: string[]
  }>
  warnings?: Array<{
    id: string
    content: string
    severity: 'low' | 'medium' | 'high'
  }>
  repo_path?: string
}

function MemoryNodeComponent({ data, selected }: NodeProps) {
  const [expanded, setExpanded] = useState(false)

  const nodeData = data as unknown as ExtendedMemoryNodeData
  const label = nodeData.label || ''
  const description = nodeData.description || ''
  const pattern_count = nodeData.pattern_count || 0
  const warning_count = nodeData.warning_count || 0
  const repos_with_memory = nodeData.repos_with_memory || 0
  const patterns = nodeData.patterns || []
  const warnings = nodeData.warnings || []
  const repo_path = nodeData.repo_path || ''

  // Use detailed data if available, otherwise use counts
  const patternCount = patterns.length > 0 ? patterns.length : pattern_count
  const warningCount = warnings.length > 0 ? warnings.length : warning_count

  // Count warnings by severity if detailed data available
  const highWarnings = warnings.filter(w => w.severity === 'high').length
  const mediumWarnings = warnings.filter(w => w.severity === 'medium').length

  // Determine accent color
  const getAccentColor = () => {
    if (highWarnings > 0) return 'border-red-500'
    if (mediumWarnings > 0) return 'border-yellow-500'
    if (warningCount > 0) return 'border-amber-500'
    return 'border-zinc-700'
  }

  const displayTitle = repo_path
    ? repo_path.split('/').pop() || 'Repo Memory'
    : label || 'Memory (Hyphae)'

  return (
    <div
      className={`
        rounded-lg border-2 bg-zinc-900 p-4 min-w-[280px]
        ${selected ? 'border-blue-500' : getAccentColor()}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-zinc-500 !w-2 !h-2"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="font-semibold text-zinc-100">{displayTitle}</span>
        </div>
        {(patterns.length > 0 || warnings.length > 0) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-800"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-zinc-500 mb-3">{description}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-zinc-800 rounded p-2">
          <div className="text-xs text-zinc-500">Patterns</div>
          <div className="text-lg font-semibold text-blue-400">{patternCount}</div>
        </div>
        <div className="bg-zinc-800 rounded p-2">
          <div className="text-xs text-zinc-500">Warnings</div>
          <div className={`text-lg font-semibold ${
            warningCount > 0 ? 'text-amber-400' : 'text-zinc-400'
          }`}>
            {warningCount}
          </div>
        </div>
      </div>

      {/* Warning severity breakdown */}
      {warningCount > 0 && warnings.length > 0 && (
        <div className="flex gap-2 text-xs mb-3">
          {highWarnings > 0 && (
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
              {highWarnings} high
            </span>
          )}
          {mediumWarnings > 0 && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
              {mediumWarnings} medium
            </span>
          )}
        </div>
      )}

      {/* Repos with memory */}
      {repos_with_memory > 0 && !repo_path && (
        <div className="flex justify-between text-sm text-zinc-400 mb-2">
          <span>Repos with Memory</span>
          <span className="text-zinc-200">{repos_with_memory}</span>
        </div>
      )}

      {/* Expanded view with patterns/warnings */}
      {expanded && (patterns.length > 0 || warnings.length > 0) && (
        <div className="mt-3 pt-3 border-t border-zinc-700 space-y-3 max-h-48 overflow-y-auto">
          {/* Patterns */}
          {patterns.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-blue-400 mb-1">Patterns</h4>
              <ul className="space-y-1">
                {patterns.slice(0, 5).map((pattern) => (
                  <li
                    key={pattern.id}
                    className="text-xs text-zinc-400 truncate"
                    title={pattern.content}
                  >
                    {pattern.content}
                  </li>
                ))}
                {patterns.length > 5 && (
                  <li className="text-xs text-zinc-500 italic">
                    ... and {patterns.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-amber-400 mb-1">Warnings</h4>
              <ul className="space-y-1">
                {warnings.slice(0, 5).map((warning) => (
                  <li
                    key={warning.id}
                    className={`text-xs truncate ${
                      warning.severity === 'high'
                        ? 'text-red-400'
                        : warning.severity === 'medium'
                        ? 'text-yellow-400'
                        : 'text-zinc-400'
                    }`}
                    title={`[${warning.severity}] ${warning.content}`}
                  >
                    [{warning.severity[0].toUpperCase()}] {warning.content}
                  </li>
                ))}
                {warnings.length > 5 && (
                  <li className="text-xs text-zinc-500 italic">
                    ... and {warnings.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-zinc-700 flex justify-between text-xs text-zinc-500">
        <span>Click to view all</span>
        <span>Compact available</span>
      </div>

      {/* Output handle - for context feedback loop */}
      <Handle
        type="source"
        position={Position.Left}
        className="!bg-zinc-500 !w-2 !h-2"
      />
    </div>
  )
}

export const MemoryNode = memo(MemoryNodeComponent)
export default MemoryNode

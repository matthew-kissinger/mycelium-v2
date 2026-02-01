import { memo, useState } from 'react'

// Warning severity levels
type Severity = 'low' | 'medium' | 'high'

interface Pattern {
  id: string
  content: string
  tags?: string[]
}

interface Warning {
  id: string
  content: string
  severity: Severity
}

interface MemoryNodeData {
  repo_path?: string // null for global memory
  patterns: Pattern[]
  warnings: Warning[]
  [key: string]: unknown
}

interface MemoryNodeProps {
  data: MemoryNodeData
  selected?: boolean
}

function MemoryNode({ data, selected }: MemoryNodeProps) {
  const [expanded, setExpanded] = useState(false)

  const patternCount = data.patterns.length
  const warningCount = data.warnings.length

  // Count warnings by severity
  const highWarnings = data.warnings.filter((w: Warning) => w.severity === 'high').length
  const mediumWarnings = data.warnings.filter((w: Warning) => w.severity === 'medium').length
  const lowWarnings = data.warnings.filter((w: Warning) => w.severity === 'low').length

  // Determine border color based on warning severity
  const getBorderColor = () => {
    if (highWarnings > 0) return 'border-red-500'
    if (mediumWarnings > 0) return 'border-yellow-500'
    if (lowWarnings > 0) return 'border-blue-500'
    return 'border-muted-foreground'
  }

  const title = data.repo_path
    ? data.repo_path.split('/').pop() || 'Repo Memory'
    : 'Global Memory'

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg transition-all bg-muted/50 ${getBorderColor()} ${selected ? 'ring-2 ring-primary' : ''}`}
      style={{ minWidth: 200 }}
    >
      {/* No handles - memory nodes are informational */}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{title}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Summary counts */}
      <div className="mt-2 flex gap-3">
        <div className="flex items-center gap-1">
          <span className="text-sm text-blue-400">P</span>
          <span className="text-sm text-foreground">{patternCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm text-yellow-400">W</span>
          <span className="text-sm text-foreground">{warningCount}</span>
        </div>
      </div>

      {/* Warning severity breakdown */}
      {warningCount > 0 && (
        <div className="mt-1 flex gap-2 text-xs">
          {highWarnings > 0 && (
            <span className="text-red-400">{highWarnings} high</span>
          )}
          {mediumWarnings > 0 && (
            <span className="text-yellow-400">{mediumWarnings} med</span>
          )}
          {lowWarnings > 0 && (
            <span className="text-blue-400">{lowWarnings} low</span>
          )}
        </div>
      )}

      {/* Expanded view */}
      {expanded && (
        <div className="mt-3 space-y-3 max-h-60 overflow-y-auto">
          {/* Patterns */}
          {patternCount > 0 && (
            <div>
              <h4 className="text-xs font-medium text-blue-400 mb-1">Patterns</h4>
              <ul className="space-y-1">
                {data.patterns.slice(0, 5).map((pattern: Pattern) => (
                  <li key={pattern.id} className="text-xs text-muted-foreground truncate" title={pattern.content}>
                    {pattern.content}
                  </li>
                ))}
                {patternCount > 5 && (
                  <li className="text-xs text-muted-foreground italic">
                    ... and {patternCount - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warningCount > 0 && (
            <div>
              <h4 className="text-xs font-medium text-yellow-400 mb-1">Warnings</h4>
              <ul className="space-y-1">
                {data.warnings.slice(0, 5).map((warning: Warning) => (
                  <li
                    key={warning.id}
                    className={`text-xs truncate ${
                      warning.severity === 'high'
                        ? 'text-red-400'
                        : warning.severity === 'medium'
                        ? 'text-yellow-400'
                        : 'text-blue-400'
                    }`}
                    title={`[${warning.severity}] ${warning.content}`}
                  >
                    [{warning.severity[0].toUpperCase()}] {warning.content}
                  </li>
                ))}
                {warningCount > 5 && (
                  <li className="text-xs text-muted-foreground italic">
                    ... and {warningCount - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Empty state */}
          {patternCount === 0 && warningCount === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No patterns or warnings recorded
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(MemoryNode)

import { memo } from 'react'

// Repo mode types matching the backend
type RepoMode = 'auto' | 'align'

interface RepoNodeData {
  id: string
  name: string
  path: string
  mode: RepoMode
  language?: string
  description?: string
  [key: string]: unknown
}

interface RepoNodeProps {
  data: RepoNodeData
  selected?: boolean
}

function RepoNode({ data, selected }: RepoNodeProps) {
  const modeColors: Record<RepoMode, string> = {
    auto: 'border-blue-500 bg-blue-900/30',
    align: 'border-green-500 bg-green-900/30',
  }

  const modeLabels: Record<RepoMode, string> = {
    auto: 'Auto',
    align: 'Align',
  }

  // Language icons (subset of common ones)
  const languageIcons: Record<string, string> = {
    typescript: 'TS',
    javascript: 'JS',
    python: 'PY',
    rust: 'RS',
    go: 'GO',
    java: 'JV',
    ruby: 'RB',
    php: 'PHP',
    elixir: 'EX',
    clojure: 'CLJ',
    'c++': 'C++',
    c: 'C',
  }

  const langIcon = data.language ? languageIcons[data.language.toLowerCase()] || data.language.slice(0, 2).toUpperCase() : ''

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 shadow-lg transition-all ${modeColors[data.mode]} ${selected ? 'ring-2 ring-primary' : ''}`}
      style={{ minWidth: 180 }}
    >
      {/* No handles - repos don't connect to other nodes */}

      {/* Header: name and mode badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground truncate" title={data.name}>
          {data.name}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${data.mode === 'auto' ? 'bg-blue-500/30 text-blue-300' : 'bg-green-500/30 text-green-300'}`}>
          {modeLabels[data.mode]}
        </span>
      </div>

      {/* Path */}
      <div className="mt-1 text-xs text-muted-foreground truncate" title={data.path}>
        {data.path}
      </div>

      {/* Language badge */}
      {data.language && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50 border border-border text-muted-foreground">
            {langIcon}
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {data.language}
          </span>
        </div>
      )}

      {/* Description */}
      {data.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2" title={data.description}>
          {data.description}
        </p>
      )}
    </div>
  )
}

export default memo(RepoNode)

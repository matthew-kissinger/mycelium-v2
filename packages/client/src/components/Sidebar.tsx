import { useQuery } from '@tanstack/react-query'

interface Repo {
  id: string
  name: string
  path: string
  mode: string
  language?: string
}

export function Sidebar() {
  const { data: repos } = useQuery<Repo[]>({
    queryKey: ['repos'],
    queryFn: async () => {
      const res = await fetch('/api/repos')
      return res.json()
    },
  })

  return (
    <aside className="w-64 border-r border-border bg-muted/50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Network
      </h2>

      <div className="space-y-2">
        {repos?.map((repo) => (
          <div
            key={repo.id}
            className="rounded-lg border border-border bg-background p-3 hover:border-primary/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{repo.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${repo.mode === 'auto' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                {repo.mode}
              </span>
            </div>
            {repo.language && (
              <span className="text-xs text-muted-foreground">{repo.language}</span>
            )}
          </div>
        ))}

        {!repos?.length && (
          <p className="text-sm text-muted-foreground">No repos registered</p>
        )}
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Node Palette
      </h2>

      <div className="space-y-2">
        <PaletteItem label="Discovery" color="bg-purple-900/50" />
        <PaletteItem label="Sequencer" color="bg-purple-900/50" />
        <PaletteItem label="Dispatcher" color="bg-purple-900/50" />
        <PaletteItem label="Shepherd" color="bg-purple-900/50" />
        <PaletteItem label="Claude Agent" color="bg-orange-900/50" />
        <PaletteItem label="Codex Agent" color="bg-blue-900/50" />
        <PaletteItem label="Gemini Agent" color="bg-cyan-900/50" />
      </div>
    </aside>
  )
}

function PaletteItem({ label, color }: { label: string; color: string }) {
  return (
    <div
      draggable
      className={`rounded-lg border border-border ${color} p-2 text-sm cursor-grab hover:border-primary/50 transition-colors`}
    >
      {label}
    </div>
  )
}

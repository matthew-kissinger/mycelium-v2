/**
 * TaskCreateForm - Create new tasks from the UI
 */

import { useState } from 'react'
import { useTaskStore } from '../../stores/taskStore'
import { useRepoStore } from '../../stores/repoStore'
import { useUIStore } from '../../stores/uiStore'

const AGENTS = [
  'claude', 'codex', 'gemini', 'cline', 'cursor',  // original
  'kiro', 'vibe', 'pi', 'opencode', 'copilot',  // new (Feb 2026)
] as const

export function TaskCreateForm({ onClose }: { onClose: () => void }) {
  const createTask = useTaskStore((s) => s.createTask)
  const repos = useRepoStore((s) => s.repos)
  const addToast = useUIStore((s) => s.addToast)

  const [title, setTitle] = useState('')
  const [repoPath, setRepoPath] = useState(repos[0]?.path || '')
  const [agent, setAgent] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [timeout, setTimeout] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!repoPath.trim()) {
      setError('Repo path is required')
      return
    }

    setSubmitting(true)
    try {
      await createTask({
        title: title.trim(),
        repo_path: repoPath.trim(),
        agent: agent || undefined,
        model: model || undefined,
        prompt: prompt || undefined,
        timeout_seconds: timeout ? parseInt(timeout, 10) : undefined,
      })
      addToast('success', `Task created: ${title.trim()}`)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create task'
      setError(msg)
      addToast('error', msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Repo *</label>
        <select
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
        >
          <option value="">Select repo...</option>
          {repos.map((r) => (
            <option key={r.path} value={r.path}>
              {r.name || r.path}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Agent</label>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          >
            <option value="">Auto</option>
            {AGENTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Default"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Task specification..."
          rows={4}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 resize-y"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Timeout (seconds)</label>
        <input
          type="number"
          value={timeout}
          onChange={(e) => setTimeout(e.target.value)}
          placeholder="Default"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-zinc-400 text-white text-sm font-medium px-3 py-1.5 rounded transition-colors"
        >
          {submitting ? 'Creating...' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

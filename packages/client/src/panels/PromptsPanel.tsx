/**
 * PromptsPanel - System prompt viewing and editing with variable inspection
 */

import { useEffect, useState } from 'react'
import { fetchAPI } from '../stores/api'

// Prompt types for panel
interface PromptInfo {
  id: string
  name: string
  description: string
  agent: string
  templateVariables: string[]
  content: string
  customContent?: string
  effectiveContent?: string
  isCustomized: boolean
  contentLength?: number
}

interface VariableInfo {
  value: string
  length: number
}

export function PromptsPanel({
  prompts,
  loading,
  selectedPrompt,
  selectedPromptLoading,
  onFetchPrompts,
  onFetchPrompt,
  onUpdatePrompt,
  onResetPrompt,
  initialPromptId,
}: {
  prompts: PromptInfo[]
  loading: boolean
  selectedPrompt: PromptInfo | null
  selectedPromptLoading: boolean
  onFetchPrompts: () => void
  onFetchPrompt: (id: string) => Promise<void>
  onUpdatePrompt: (id: string, content: string) => Promise<void>
  onResetPrompt: (id: string) => Promise<void>
  initialPromptId?: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialPromptId || null)
  const [editMode, setEditMode] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [variables, setVariables] = useState<Record<string, VariableInfo> | null>(null)
  const [expandedVar, setExpandedVar] = useState<string | null>(null)
  const [variablesLoading, setVariablesLoading] = useState(false)

  // Fetch prompts on mount
  useEffect(() => {
    onFetchPrompts()
  }, [onFetchPrompts])

  // Load selected prompt when ID changes
  useEffect(() => {
    if (selectedId) {
      onFetchPrompt(selectedId)
    }
  }, [selectedId, onFetchPrompt])

  // Reset edit state when prompt loads
  useEffect(() => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.effectiveContent || selectedPrompt.content)
    }
  }, [selectedPrompt])

  // Fetch resolved variables when prompt is selected
  useEffect(() => {
    if (selectedId && selectedPrompt?.templateVariables?.length) {
      setVariablesLoading(true)
      fetchAPI<{ variables: Record<string, VariableInfo> }>(`/prompts/${selectedId}/variables`)
        .then((res) => setVariables(res.variables))
        .catch(() => setVariables(null))
        .finally(() => setVariablesLoading(false))
    } else {
      setVariables(null)
    }
    setExpandedVar(null)
  }, [selectedId, selectedPrompt])

  const handleSave = async () => {
    if (!selectedId || !editedContent) return
    setSaveStatus('saving')
    try {
      await onUpdatePrompt(selectedId, editedContent)
      setSaveStatus('saved')
      setEditMode(false)
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }

  const handleReset = async () => {
    if (!selectedId) return
    if (!confirm('Reset this prompt to its default content?')) return
    try {
      await onResetPrompt(selectedId)
      setEditMode(false)
    } catch {
      // Error handled in store
    }
  }

  const handleCancel = () => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.effectiveContent || selectedPrompt.content)
    }
    setEditMode(false)
    setSaveStatus('idle')
  }

  // Group prompts by agent
  const promptsByAgent = prompts.reduce<Record<string, PromptInfo[]>>((acc, p) => {
    const arr = acc[p.agent] || []
    arr.push(p)
    acc[p.agent] = arr
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-zinc-800 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-semibold text-blue-400">{prompts.length}</div>
            <div className="text-xs text-zinc-500">Total Prompts</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-amber-400">
              {prompts.filter(p => p.isCustomized).length}
            </div>
            <div className="text-xs text-zinc-500">Customized</div>
          </div>
        </div>
      </div>

      {/* Prompt list or detail view */}
      {selectedId && selectedPrompt ? (
        <div className="space-y-4">
          {/* Back button */}
          <button
            onClick={() => {
              setSelectedId(null)
              setEditMode(false)
              setSaveStatus('idle')
            }}
            className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to list
          </button>

          {/* Prompt header */}
          <div className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-sm font-medium text-zinc-100">{selectedPrompt.name}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{selectedPrompt.description}</p>
              </div>
              {selectedPrompt.isCustomized && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                  Customized
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>Agent: <span className="text-zinc-300 capitalize">{selectedPrompt.agent}</span></span>
            </div>

            {/* Template variable chips */}
            {selectedPrompt.templateVariables.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] text-zinc-600 uppercase font-mono mb-1">Template Variables</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPrompt.templateVariables.map((v) => {
                    const info = variables?.[v]
                    const isExpanded = expandedVar === v
                    return (
                      <button
                        key={v}
                        onClick={() => setExpandedVar(isExpanded ? null : v)}
                        className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
                          isExpanded
                            ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30'
                            : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                        }`}
                        title={info ? `${info.length} chars` : 'Click to inspect'}
                      >
                        {`{${v}}`}
                        {info && <span className="ml-1 text-zinc-500">{info.length}c</span>}
                      </button>
                    )
                  })}
                  {variablesLoading && (
                    <span className="text-[10px] text-zinc-600 self-center">loading...</span>
                  )}
                </div>

                {/* Expanded variable content */}
                {expandedVar && variables?.[expandedVar] && (
                  <div className="mt-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-zinc-500 font-mono">{`{${expandedVar}}`} - {variables[expandedVar].length} chars</span>
                      <button
                        onClick={() => setExpandedVar(null)}
                        className="text-zinc-500 hover:text-zinc-300 text-xs"
                      >
                        close
                      </button>
                    </div>
                    <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                      {variables[expandedVar].value}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase font-medium">
                {editMode ? 'Edit Prompt' : 'Content'}
              </span>
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Edit
                </button>
              )}
            </div>

            {editMode ? (
              <textarea
                value={editedContent}
                onChange={(e) => {
                  setEditedContent(e.target.value)
                  setSaveStatus('idle')
                }}
                className="w-full h-64 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono resize-none focus:outline-none focus:border-zinc-600"
                placeholder="Enter prompt content..."
              />
            ) : (
              <div className="bg-zinc-800 rounded-lg p-3 max-h-64 overflow-y-auto">
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">
                  {selectedPrompt.effectiveContent || selectedPrompt.content}
                </pre>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {editMode ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={selectedPromptLoading || editedContent === (selectedPrompt.effectiveContent || selectedPrompt.content)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  saveStatus === 'saved'
                    ? 'bg-green-500/20 text-green-400'
                    : saveStatus === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                } disabled:opacity-50`}
              >
                {saveStatus === 'saving' ? 'Saving...' :
                 saveStatus === 'saved' ? 'Saved!' :
                 saveStatus === 'error' ? 'Error' :
                 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm hover:bg-zinc-600"
              >
                Cancel
              </button>
            </div>
          ) : selectedPrompt.isCustomized ? (
            <button
              onClick={handleReset}
              disabled={selectedPromptLoading}
              className="w-full px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm hover:bg-zinc-600 disabled:opacity-50"
            >
              Reset to Default
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Prompt list by agent */}
          {loading && prompts.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">Loading prompts...</div>
          ) : (
            Object.entries(promptsByAgent).map(([agent, agentPrompts]) => (
              <div key={agent}>
                <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2 capitalize">
                  {agent} Agent
                </h3>
                <div className="space-y-2">
                  {agentPrompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      onClick={() => setSelectedId(prompt.id)}
                      className="w-full bg-zinc-800 rounded-lg p-3 text-left hover:bg-zinc-750 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200">{prompt.name}</div>
                          <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                            {prompt.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {prompt.isCustomized && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                              Custom
                            </span>
                          )}
                          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Refresh button */}
      {!selectedId && (
        <button
          onClick={onFetchPrompts}
          disabled={loading}
          className="w-full px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Prompts'}
        </button>
      )}
    </div>
  )
}

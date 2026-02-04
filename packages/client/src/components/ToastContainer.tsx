/**
 * Toast notification container
 */

import { useUIStore } from '../stores/uiStore'

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-lg text-sm ${
            toast.type === 'error'
              ? 'bg-red-900/90 text-red-200 border border-red-700'
              : toast.type === 'success'
              ? 'bg-green-900/90 text-green-200 border border-green-700'
              : 'bg-zinc-800/90 text-zinc-200 border border-zinc-700'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-current opacity-60 hover:opacity-100 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

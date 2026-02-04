/**
 * Shared config input and toggle components
 */

export function ConfigInput({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-zinc-300">{label}</span>
        {hint && <span className="text-xs text-zinc-500 ml-2">({hint})</span>}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          min={min}
          max={max}
          className="w-20 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200 text-right"
        />
        {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
      </div>
    </div>
  )
}

export function ConfigToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          value ? 'bg-green-500' : 'bg-zinc-600'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

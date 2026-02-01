/**
 * Output formatting helpers for CLI display.
 */

/**
 * Display data as a formatted table.
 */
export function table(data: Record<string, unknown>[]): void {
  if (data.length === 0) {
    console.log('(no data)')
    return
  }

  // Get all keys from all objects
  const keys = new Set<string>()
  for (const row of data) {
    for (const key of Object.keys(row)) {
      keys.add(key)
    }
  }
  const columns = Array.from(keys)

  // Calculate column widths
  const widths = new Map<string, number>()
  for (const col of columns) {
    widths.set(col, col.length)
  }
  for (const row of data) {
    for (const col of columns) {
      const value = formatValue(row[col])
      const currentWidth = widths.get(col) ?? col.length
      widths.set(col, Math.max(currentWidth, value.length))
    }
  }

  // Build header
  const header = columns.map(col => col.padEnd(widths.get(col) ?? col.length)).join('  ')
  const separator = columns.map(col => '-'.repeat(widths.get(col) ?? col.length)).join('  ')

  console.log(header)
  console.log(separator)

  // Build rows
  for (const row of data) {
    const line = columns.map(col => {
      const value = formatValue(row[col])
      return value.padEnd(widths.get(col) ?? col.length)
    }).join('  ')
    console.log(line)
  }
}

/**
 * Display data as formatted JSON.
 */
export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

/**
 * Display a success message.
 */
export function success(message: string): void {
  console.log(`[OK] ${message}`)
}

/**
 * Display an error message.
 */
export function error(message: string): void {
  console.error(`[ERROR] ${message}`)
}

/**
 * Display an info message.
 */
export function info(message: string): void {
  console.log(`[INFO] ${message}`)
}

/**
 * Display a warning message.
 */
export function warn(message: string): void {
  console.log(`[WARN] ${message}`)
}

/**
 * Format a value for table display.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-'
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no'
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return `[${value.length}]`
    }
    return '{...}'
  }
  const str = String(value)
  // Truncate long values for table display
  if (str.length > 50) {
    return str.slice(0, 47) + '...'
  }
  return str
}

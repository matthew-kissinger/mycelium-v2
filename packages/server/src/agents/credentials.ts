/**
 * Centralized credential loading from ~/.config/mk-agent/ and related paths.
 *
 * Sources (checked in priority order):
 *   1. ~/.config/mk-agent/env          - Main env file (export KEY=value or KEY=value)
 *   2. ~/.config/mk-agent/<KEY_FILE>   - Individual key files (raw value or export KEY=value)
 *   3. ~/.config/mk-agent/COPILOT_TOKEN - Mapped to GH_TOKEN and GITHUB_TOKEN
 *   4. ~/.groq/config.json             - Groq API key (apiKey field)
 *   5. ~/.cline/data/secrets.json      - OpenRouter key (openRouterApiKey field)
 *
 * Later sources do not overwrite keys already loaded from earlier sources.
 */

import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MK_AGENT_DIR = join(homedir(), '.config', 'mk-agent')
const ENV_FILE = join(MK_AGENT_DIR, 'env')

/**
 * Individual key files inside ~/.config/mk-agent/ mapped to credential names.
 * The key is the credential name, the value is the filename.
 */
const KEY_FILES: Record<string, string> = {
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  GOOGLE_API_KEY: 'GOOGLE_API_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  OPENROUTER_API_KEY: 'OPENROUTER_API_KEY',
  CEREBRAS_API_KEY: 'CEREBRAS_API_KEY',
  MISTRAL_API_KEY: 'MISTRAL_API_KEY',
}

const COPILOT_TOKEN_FILE = join(MK_AGENT_DIR, 'COPILOT_TOKEN')
const GROQ_CONFIG = join(homedir(), '.groq', 'config.json')
const CLINE_SECRETS = join(homedir(), '.cline', 'data', 'secrets.json')

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cached: Record<string, string> | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip optional surrounding single or double quotes from a value string.
 */
function stripQuotes(value: string): string {
  const v = value.trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * Parse an env file with lines in one of these formats:
 *   export KEY=value
 *   KEY=value
 *   KEY="value"
 *   KEY='value'
 *   # comment (ignored)
 *   blank lines (ignored)
 *
 * Returns a map of key -> value.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!existsSync(filePath)) return result

  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return result
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    // Strip optional "export " prefix
    const stripped = line.startsWith('export ') ? line.slice(7).trim() : line

    const eqIdx = stripped.indexOf('=')
    if (eqIdx < 1) continue

    const key = stripped.slice(0, eqIdx).trim()
    const value = stripQuotes(stripped.slice(eqIdx + 1))
    if (key && value) {
      result[key] = value
    }
  }

  return result
}

/**
 * Read a single key file. The file may contain:
 *   - A raw value (possibly with trailing newline)
 *   - export KEY=value format (single line)
 *   - KEY=value format (single line)
 *
 * Returns the extracted value or null.
 */
function readKeyFile(filePath: string, keyName: string): string | null {
  if (!existsSync(filePath)) return null

  let content: string
  try {
    content = readFileSync(filePath, 'utf-8').trim()
  } catch {
    return null
  }

  if (!content) return null

  // Check for export KEY=value or KEY=value pattern on a single line
  const stripped = content.startsWith('export ')
    ? content.slice(7).trim()
    : content

  const eqIdx = stripped.indexOf('=')
  if (eqIdx !== -1 && !stripped.includes('\n')) {
    // Single line with = sign. Try to match the expected key name.
    const fileKey = stripped.slice(0, eqIdx).trim()
    // Accept if the file key matches the expected key name, or just extract the value
    if (fileKey === keyName || fileKey) {
      const value = stripQuotes(stripped.slice(eqIdx + 1))
      return value || null
    }
  }

  // No = sign found - treat entire content as the raw key value
  // Only accept single-line content (ignore multi-line files without key=value format)
  const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
  if (lines.length === 1) return lines[0].trim()

  return null
}

/**
 * Safely parse a JSON file and return the result, or null on failure.
 */
function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Core loader
// ---------------------------------------------------------------------------

function load(): Record<string, string> {
  const creds: Record<string, string> = {}

  // 1. Parse the main env file (highest priority for all keys it defines)
  const envCreds = parseEnvFile(ENV_FILE)
  for (const [k, v] of Object.entries(envCreds)) {
    creds[k] = v
  }

  // 2. Individual key files (do not overwrite keys already set from env file)
  for (const [keyName, fileName] of Object.entries(KEY_FILES)) {
    if (creds[keyName]) continue
    const filePath = join(MK_AGENT_DIR, fileName)
    const value = readKeyFile(filePath, keyName)
    if (value) {
      creds[keyName] = value
    }
  }

  // 3. Copilot token -> GH_TOKEN and GITHUB_TOKEN
  if (!creds.GH_TOKEN) {
    const copilotToken = readKeyFile(COPILOT_TOKEN_FILE, 'COPILOT_TOKEN')
    if (copilotToken) {
      creds.GH_TOKEN = copilotToken
    }
  }
  // Sync GH_TOKEN <-> GITHUB_TOKEN aliases
  if (creds.GH_TOKEN && !creds.GITHUB_TOKEN) {
    creds.GITHUB_TOKEN = creds.GH_TOKEN
  } else if (creds.GITHUB_TOKEN && !creds.GH_TOKEN) {
    creds.GH_TOKEN = creds.GITHUB_TOKEN
  }

  // 4. Groq config.json
  if (!creds.GROQ_API_KEY) {
    const groqConfig = readJsonFile(GROQ_CONFIG)
    if (groqConfig && typeof groqConfig.apiKey === 'string' && groqConfig.apiKey) {
      creds.GROQ_API_KEY = groqConfig.apiKey
    }
  }

  // 5. Cline secrets.json - OpenRouter key
  if (!creds.OPENROUTER_API_KEY) {
    const clineSecrets = readJsonFile(CLINE_SECRETS)
    if (
      clineSecrets &&
      typeof clineSecrets.openRouterApiKey === 'string' &&
      clineSecrets.openRouterApiKey
    ) {
      creds.OPENROUTER_API_KEY = clineSecrets.openRouterApiKey
    }
  }

  return creds
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load all credentials from known sources. Results are cached after the
 * first call. Use reloadCredentials() to force a refresh.
 */
export function loadCredentials(): Record<string, string> {
  if (cached) return { ...cached }
  cached = load()
  return { ...cached }
}

/**
 * Get a specific credential value by key name.
 * Returns null if the credential is not available.
 */
export function getCredential(key: string): string | null {
  const creds = loadCredentials()
  return creds[key] ?? null
}

/**
 * Check whether a credential is available (non-empty).
 */
export function hasCredential(key: string): boolean {
  return getCredential(key) !== null
}

/**
 * Return the list of credential key names that are currently available.
 * Never exposes actual values.
 */
export function getAvailableCredentialKeys(): string[] {
  const creds = loadCredentials()
  return Object.keys(creds).sort()
}

/**
 * Clear the cache and reload all credentials from disk.
 * Returns the freshly loaded credential map.
 */
export function reloadCredentials(): Record<string, string> {
  cached = null
  return loadCredentials()
}

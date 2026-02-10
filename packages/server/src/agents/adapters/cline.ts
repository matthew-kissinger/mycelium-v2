import { spawn } from 'bun'
import { acquireClineInstance, releaseClineInstance } from '../cline-instances'
import type { AgentAdapter, AdapterOptions } from './types'

/**
 * Map short model names to OpenRouter model IDs.
 * Discovery creates tasks with short names like "kimi-k2.5" or "deepseek-v3.2".
 */
const CLINE_MODEL_MAP: Record<string, string> = {
  'kimi-k2.5': 'moonshotai/kimi-k2.5',
  'kimi-k2': 'moonshotai/kimi-k2-0905',
  'kimi-k2-thinking': 'moonshotai/kimi-k2-thinking',
  'deepseek-v3.2': 'deepseek/deepseek-v3.2',
  'deepseek-r1': 'deepseek/deepseek-r1-0528',
  'qwen3-coder': 'qwen/qwen3-coder',
  'qwen3-coder-next': 'qwen/qwen3-coder-next',
  'glm-4.7': 'z-ai/glm-4.7',
  'glm-4.7-flash': 'z-ai/glm-4.7-flash',
  'devstral': 'mistralai/devstral-2512',
}

/** Track current model and provider per cline instance address */
const clineModelByInstance = new Map<string, string>()
const clineProviderByInstance = new Map<string, string>()

/**
 * Switch cline's model and optionally provider before dispatch.
 * Uses `cline config set` for fast switching.
 */
async function switchClineModel(
  model: string,
  instanceAddress?: string | null,
  provider: 'openrouter' | 'cline' = 'openrouter'
): Promise<void> {
  const modelId = CLINE_MODEL_MAP[model] ?? model
  const address = instanceAddress ?? 'default'

  const currentModel = clineModelByInstance.get(address)
  const currentProvider = clineProviderByInstance.get(address)

  if (currentModel === modelId && currentProvider === provider) return

  console.log(`[Dispatch] Switching cline to ${provider}/${modelId} on ${address}`)

  try {
    const configArgs: string[] = []
    if (currentProvider !== provider) {
      configArgs.push(`act-mode-api-provider=${provider}`)
    }
    if (provider === 'openrouter' && currentModel !== modelId) {
      configArgs.push(`act-mode-open-router-model-id=${modelId}`)
    }

    if (configArgs.length === 0) return

    const proc = spawn({
      cmd: [
        'cline',
        ...(instanceAddress ? ['--address', instanceAddress] : []),
        'config', 'set',
        ...configArgs,
      ],
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    await proc.exited
    clineModelByInstance.set(address, modelId)
    clineProviderByInstance.set(address, provider)
    console.log(`[Dispatch] Cline switched to ${provider}/${modelId} on ${address}`)
  } catch (error) {
    console.error(`[Dispatch] Failed to switch cline config:`, error)
  }
}

/**
 * Get current cline config for an instance.
 */
export async function getClineConfig(instanceAddress?: string | null): Promise<{
  provider: string
  model: string
} | null> {
  try {
    const proc = spawn({
      cmd: [
        'cline',
        ...(instanceAddress ? ['--address', instanceAddress] : []),
        'config', 'list', '-F', 'plain',
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    const providerMatch = output.match(/act-mode-api-provider:\s*(\S+)/)
    const modelMatch = output.match(/act-mode-open-router-model-id:\s*(\S+)/)

    return {
      provider: providerMatch?.[1] ?? 'unknown',
      model: modelMatch?.[1] ?? 'unknown',
    }
  } catch {
    return null
  }
}

export const clineAdapter: AgentAdapter = {
  id: 'cline',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, clineAddress } = options
    // cline task new "prompt" --yolo --mode act [--address <addr>]
    return [
      ...(clineAddress ? ['--address', clineAddress] : []),
      'task', 'new',
      prompt,
      '--yolo',
      '--mode', 'act',
    ]
  },

  buildEnv(): Record<string, string> {
    return {}
  },

  async preSpawn(options: AdapterOptions): Promise<void> {
    const { model, provider, clineAddress } = options
    if (model || provider) {
      await switchClineModel(
        model ?? 'moonshotai/kimi-k2.5',
        clineAddress,
        (provider as 'openrouter' | 'cline') ?? 'openrouter'
      )
    }
  },

  async acquireResources(): Promise<() => void> {
    const address = await acquireClineInstance()
    // Store address so buildArgs can access it - caller sets clineAddress on options
    return () => releaseClineInstance(address)
  },

  tracksOpenRouterUsage(): boolean {
    return true
  },
}

/**
 * Acquire a cline instance and return its address.
 * The caller must set options.clineAddress before calling buildArgs.
 */
export async function acquireClineAddress(): Promise<string> {
  return acquireClineInstance()
}

export function releaseClineAddress(address: string): void {
  releaseClineInstance(address)
}

import type { AgentAdapter, AdapterOptions } from './types'

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',

  buildArgs(options: AdapterOptions): string[] {
    const { prompt, model, sessionId } = options
    // gemini -p "prompt" --model gemini-3-pro-preview --yolo -o json
    // CRITICAL: -p is required for non-interactive (headless) mode.
    // Without it, gemini enters interactive TUI and hangs until timeout.
    return [
      ...(sessionId ? ['--resume', sessionId, '-p', prompt] : ['-p', prompt]),
      ...(model ? ['--model', model] : []),
      '--yolo',
      '-o', 'json',
    ]
  },

  buildEnv(): Record<string, string> {
    // No env var stripping needed. The Gemini CLI respects settings.json
    // selectedType (oauth-personal) and ignores GOOGLE_API_KEY/GEMINI_API_KEY
    // when OAuth is active.
    return {}
  },

  postProcessOutput(output: string): string {
    // With -o json, output is a JSON object with response + stats.
    // Extract just the response text for downstream consumers.
    try {
      const data = JSON.parse(output)
      return data.response ?? output
    } catch {
      return output
    }
  },
}

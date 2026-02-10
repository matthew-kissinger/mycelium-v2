import type { AgentAdapter, AdapterOptions } from './types'

export const kiroAdapter: AgentAdapter = {
  id: 'kiro',

  buildArgs(): string[] {
    // kiro-cli chat --no-interactive --trust-all-tools
    // Note: prompt is piped via stdin, not as arg
    return ['chat', '--no-interactive', '--trust-all-tools']
  },

  buildEnv(): Record<string, string> {
    return {}
  },

  prepareStdin(prompt: string): string {
    return prompt
  },

  postProcessOutput(output: string): string {
    // Skip first ~30 lines of kiro output (banner/startup)
    const lines = output.split('\n')
    const cleanOutput = lines.slice(30).join('\n').trim()
    return cleanOutput || output
  },
}

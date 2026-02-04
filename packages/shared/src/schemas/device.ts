import { z } from 'zod'

// Device types supported by the system
export const DeviceType = z.enum([
  'roku',      // Roku TV (ECP API)
  'yamaha',    // Yamaha soundbar (UPnP)
  'ssh',       // SSH target (PC, phone, tablet)
  'ollama',    // Ollama LLM server
  'http',      // Generic HTTP service
  'flipper',   // Flipper Zero
])
export type DeviceType = z.infer<typeof DeviceType>

// Device connectivity status
export const DeviceStatus = z.enum([
  'online',    // Responding normally
  'offline',   // Not reachable
  'degraded',  // Reachable but errors
  'unknown',   // Not yet checked
])
export type DeviceStatus = z.infer<typeof DeviceStatus>

// Protocol for device communication
export const DeviceProtocol = z.enum([
  'http',
  'https',
  'upnp',
  'ssh',
  'serial',
])
export type DeviceProtocol = z.infer<typeof DeviceProtocol>

// Full device record
export const Device = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: DeviceType,
  host: z.string().min(1),
  port: z.number().int().positive().optional(),
  protocol: DeviceProtocol.default('http'),

  // Health tracking
  status: DeviceStatus.default('unknown'),
  last_seen: z.string().datetime().optional(),
  last_error: z.string().optional(),
  response_time_ms: z.number().int().optional(),

  // Device-specific config (JSON)
  config: z.record(z.string(), z.unknown()).optional(),

  // Metadata
  description: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
})
export type Device = z.infer<typeof Device>

// Device creation input
export const DeviceCreate = z.object({
  name: z.string().min(1),
  type: DeviceType,
  host: z.string().min(1),
  port: z.number().int().positive().optional(),
  protocol: DeviceProtocol.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
})
export type DeviceCreate = z.infer<typeof DeviceCreate>

// Device update input
export const DeviceUpdate = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
  protocol: DeviceProtocol.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
  // Status fields (updated by health check)
  status: DeviceStatus.optional(),
  last_seen: z.string().datetime().optional(),
  last_error: z.string().optional(),
  response_time_ms: z.number().int().optional(),
})
export type DeviceUpdate = z.infer<typeof DeviceUpdate>

// Health check result
export const HealthCheckResult = z.object({
  online: z.boolean(),
  status: DeviceStatus,
  latency_ms: z.number().int().optional(),
  error: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})
export type HealthCheckResult = z.infer<typeof HealthCheckResult>

// Device command request
export const DeviceCommandRequest = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  timeout_ms: z.number().int().positive().optional(),
})
export type DeviceCommandRequest = z.infer<typeof DeviceCommandRequest>

// Device command result
export const DeviceCommandResult = z.object({
  success: z.boolean(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  duration_ms: z.number().int().optional(),
})
export type DeviceCommandResult = z.infer<typeof DeviceCommandResult>

// Roku-specific app IDs
export const ROKU_APPS: Record<string, number> = {
  youtube: 837,
  netflix: 12,
  disney: 291097,
  prime: 13,
  hulu: 2285,
  plex: 13535,
  spotify: 22297,
}

// Roku keypress commands
export const RokuKeypress = z.enum([
  'Home', 'Up', 'Down', 'Left', 'Right', 'Select', 'Back',
  'Play', 'Pause', 'Fwd', 'Rev', 'InstantReplay',
  'VolumeUp', 'VolumeDown', 'VolumeMute', 'Power',
])
export type RokuKeypress = z.infer<typeof RokuKeypress>

// Default ports by device type
export const DEFAULT_PORTS: Record<DeviceType, number> = {
  roku: 8060,
  yamaha: 49152,
  ssh: 22,
  ollama: 11434,
  http: 80,
  flipper: 0, // Serial, no port
}

// Default protocol by device type
export const DEFAULT_PROTOCOLS: Record<DeviceType, DeviceProtocol> = {
  roku: 'http',
  yamaha: 'upnp',
  ssh: 'ssh',
  ollama: 'http',
  http: 'http',
  flipper: 'serial',
}

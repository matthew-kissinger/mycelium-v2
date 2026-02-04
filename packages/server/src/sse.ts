import type { SSEEventType } from '@mycelium/shared'

// Re-export SSETopic for convenience
export type SSETopic = string
import { randomUUID } from 'crypto'

/**
 * SSE Client representation with topic subscriptions.
 */
export interface SSEClient {
  id: string
  controller: ReadableStreamDefaultController<Uint8Array>
  topics: Set<string>
  connectedAt: number
}

// Connected clients indexed by ID
const clients = new Map<string, SSEClient>()

// Text encoder for SSE messages
const encoder = new TextEncoder()

// Heartbeat interval reference
let heartbeatInterval: ReturnType<typeof setInterval> | null = null

// Heartbeat frequency (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * Start the heartbeat sender if not already running.
 */
function startHeartbeat(): void {
  if (heartbeatInterval) return

  heartbeatInterval = setInterval(() => {
    broadcastRaw('system:heartbeat', {
      type: 'system:heartbeat',
      timestamp: new Date().toISOString()
    })
  }, HEARTBEAT_INTERVAL_MS)
}

/**
 * Stop the heartbeat sender if no clients are connected.
 */
function stopHeartbeatIfNoClients(): void {
  if (clients.size === 0 && heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

/**
 * Format an SSE message.
 */
function formatSSEMessage(event: string, data: unknown): Uint8Array {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  return encoder.encode(message)
}

/**
 * Parse topic query parameter into a Set of topics.
 * Example: "task:*,signal:*" -> Set(["task:*", "signal:*"])
 */
export function parseTopics(topicsParam: string | null): Set<string> {
  if (!topicsParam) {
    // Default: subscribe to all
    return new Set(['*'])
  }
  const topics = topicsParam.split(',').map(t => t.trim()).filter(Boolean)
  return new Set(topics.length > 0 ? topics : ['*'])
}

/**
 * Check if a topic pattern matches an event topic.
 * Patterns:
 *   - "*" matches everything
 *   - "task:*" matches "task:created", "task:123", etc.
 *   - "task:123" matches exactly "task:123"
 *   - "repo:/path/to/repo" matches exactly
 */
function topicMatches(pattern: string, eventTopic: string): boolean {
  // Wildcard matches all
  if (pattern === '*') return true

  // Exact match
  if (pattern === eventTopic) return true

  // Category wildcard (e.g., "task:*" matches "task:created")
  if (pattern.endsWith(':*')) {
    const category = pattern.slice(0, -2) // Remove ":*"
    return eventTopic.startsWith(category + ':')
  }

  return false
}

/**
 * Check if a client should receive an event based on subscribed topics.
 */
function clientShouldReceive(client: SSEClient, eventTopic: string): boolean {
  for (const pattern of client.topics) {
    if (topicMatches(pattern, eventTopic)) {
      return true
    }
  }
  return false
}

/**
 * Extract the topic from an SSE event type.
 * Maps event types to topic strings for matching.
 *
 * Event types follow format: category:action (e.g., task:created, signal:responded)
 * Topics can be:
 *   - "*" - all events
 *   - "task:*" - all task events
 *   - "task:abc123" - events for specific task ID
 *   - "signal:*" - all signal events
 *   - "agent:*" - all system agent events (maps to system:*)
 *   - "scheduler:*" - all scheduler events
 *   - "system:*" - all system events (heartbeat, error)
 *   - "repo:/path/to/repo" - events for specific repo
 */
function eventToTopic(event: SSEEventType | string, data?: unknown): string {
  // For specific resource events, include the ID/path for fine-grained filtering
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>

    // Task events: check task_id or task.id
    if (event.startsWith('task:')) {
      const taskId = obj.task_id ?? (obj.task as Record<string, unknown>)?.id
      if (taskId) {
        return `task:${taskId}`
      }
    }

    // Signal events: check signal_id or signal.id
    if (event.startsWith('signal:')) {
      const signalId = obj.signal_id ?? (obj.signal as Record<string, unknown>)?.id
      if (signalId) {
        return `signal:${signalId}`
      }
    }

    // Agent events: check run_id and agent_type
    if (event.startsWith('agent:')) {
      const runId = obj.run_id
      if (runId) {
        // Return both the specific run topic and the general event type
        // so clients can subscribe to agent:* or agent:<run_id>
        return `agent:${runId}`
      }
    }

    // Repo events: use path if available
    if (event.startsWith('repo:') && obj.path) {
      return `repo:${obj.path}`
    }
  }

  // Default: use the event type as the topic
  return event
}

/**
 * Send a message to a specific client.
 * Returns false if the client was disconnected.
 */
function sendToClient(client: SSEClient, event: string, data: unknown): boolean {
  try {
    client.controller.enqueue(formatSSEMessage(event, data))
    return true
  } catch {
    // Client disconnected, remove from set
    removeClient(client.id)
    console.log(`[SSE] Client ${client.id} disconnected (send failed)`)
    return false
  }
}

/**
 * Remove a client from the connected set.
 */
function removeClient(clientId: string): void {
  clients.delete(clientId)
  stopHeartbeatIfNoClients()
}

/**
 * Create an SSE response for a client connection.
 * Accepts optional topics query parameter for subscriptions.
 */
export function createSSEResponse(topicsParam: string | null = null): Response {
  const clientId = randomUUID()
  const topics = parseTopics(topicsParam)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const client: SSEClient = {
        id: clientId,
        controller,
        topics,
        connectedAt: Date.now(),
      }

      clients.set(clientId, client)
      startHeartbeat()

      // Send initial connection event
      sendToClient(client, 'connected', {
        clientId,
        time: Date.now(),
        topics: Array.from(topics),
      })

      console.log(`[SSE] Client ${clientId} connected (topics: ${Array.from(topics).join(', ')})`)
    },
    cancel() {
      removeClient(clientId)
      console.log(`[SSE] Client ${clientId} disconnected (stream cancelled)`)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

/**
 * Broadcast an event to all connected clients (ignoring topic filtering).
 * Used for heartbeats and system-wide events.
 */
function broadcastRaw(event: string, data: unknown): void {
  const encoded = formatSSEMessage(event, data)

  for (const [clientId, client] of clients) {
    try {
      client.controller.enqueue(encoded)
    } catch {
      removeClient(clientId)
      console.log(`[SSE] Client ${clientId} disconnected (broadcast failed)`)
    }
  }
}

/**
 * Broadcast an event to clients subscribed to matching topics.
 */
export function broadcast(event: SSEEventType, data: unknown): void {
  const eventTopic = eventToTopic(event, data)

  for (const [clientId, client] of clients) {
    // Check if client is subscribed to this event's topic
    if (!clientShouldReceive(client, eventTopic)) {
      continue
    }

    if (!sendToClient(client, event, data)) {
      console.log(`[SSE] Client ${clientId} removed during broadcast`)
    }
  }
}

/**
 * Subscribe a client to additional topics.
 */
export function subscribe(clientId: string, topic: SSETopic): boolean {
  const client = clients.get(clientId)
  if (!client) return false

  client.topics.add(topic)
  console.log(`[SSE] Client ${clientId} subscribed to ${topic}`)
  return true
}

/**
 * Unsubscribe a client from a topic.
 */
export function unsubscribe(clientId: string, topic: SSETopic): boolean {
  const client = clients.get(clientId)
  if (!client) return false

  const deleted = client.topics.delete(topic)
  if (deleted) {
    console.log(`[SSE] Client ${clientId} unsubscribed from ${topic}`)
  }
  return deleted
}

/**
 * Get current connected client count.
 */
export function getClientCount(): number {
  return clients.size
}

/**
 * Get all clients subscribed to a specific topic.
 */
export function getTopicSubscribers(topic: SSETopic): SSEClient[] {
  const subscribers: SSEClient[] = []
  for (const client of clients.values()) {
    if (clientShouldReceive(client, topic)) {
      subscribers.push(client)
    }
  }
  return subscribers
}

/**
 * Get info about all connected clients.
 */
export function getClientInfo(): Array<{
  id: string
  topics: string[]
  connectedAt: number
  uptimeMs: number
}> {
  const now = Date.now()
  return Array.from(clients.values()).map(client => ({
    id: client.id,
    topics: Array.from(client.topics),
    connectedAt: client.connectedAt,
    uptimeMs: now - client.connectedAt,
  }))
}

/**
 * Disconnect a client by ID.
 */
export function disconnectClient(clientId: string): boolean {
  const client = clients.get(clientId)
  if (!client) return false

  try {
    client.controller.close()
  } catch {
    // Ignore close errors
  }

  removeClient(clientId)
  console.log(`[SSE] Client ${clientId} forcibly disconnected`)
  return true
}

/**
 * Cleanup: disconnect all clients and stop heartbeat.
 * Call this during server shutdown.
 */
export function shutdown(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }

  for (const [clientId, client] of clients) {
    try {
      client.controller.close()
    } catch {
      // Ignore close errors
    }
    console.log(`[SSE] Client ${clientId} disconnected (shutdown)`)
  }

  clients.clear()
}

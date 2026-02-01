import type { SSEEventType } from '@mycelium/shared'

// Connected clients for SSE
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>()

/**
 * Create an SSE response for a client connection.
 */
export function createSSEResponse(): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clients.add(controller)

      // Send initial connection event
      const data = `event: connected\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`
      controller.enqueue(encoder.encode(data))
    },
    cancel(controller) {
      clients.delete(controller)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/**
 * Broadcast an event to all connected clients.
 */
export function broadcast(event: SSEEventType, data: unknown): void {
  const encoder = new TextEncoder()
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  const encoded = encoder.encode(message)

  for (const client of clients) {
    try {
      client.enqueue(encoded)
    } catch {
      // Client disconnected, remove from set
      clients.delete(client)
    }
  }
}

/**
 * Get current connected client count.
 */
export function getClientCount(): number {
  return clients.size
}

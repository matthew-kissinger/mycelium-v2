/**
 * API client wrapper for communicating with the mycelium backend.
 */

export interface ApiClientOptions {
  baseUrl: string
}

export interface ApiClient {
  baseUrl: string

  /**
   * Perform a GET request.
   */
  get<T>(path: string, params?: Record<string, string>): Promise<T>

  /**
   * Perform a POST request.
   */
  post<T>(path: string, body?: unknown): Promise<T>

  /**
   * Perform a PATCH request.
   */
  patch<T>(path: string, body: unknown): Promise<T>

  /**
   * Perform a DELETE request.
   */
  delete(path: string): Promise<void>
}

/**
 * Error thrown when an API request fails.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: unknown
  ) {
    super(`API Error: ${status} ${statusText}`)
    this.name = 'ApiError'
  }
}

/**
 * Create an API client for the given base URL.
 */
export function createClient(baseUrl: string): ApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')

  async function request<T>(
    method: string,
    path: string,
    options?: {
      params?: Record<string, string>
      body?: unknown
    }
  ): Promise<T> {
    let url = `${normalizedBaseUrl}${path}`

    if (options?.params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== '') {
          searchParams.set(key, value)
        }
      }
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }

    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        // Ignore JSON parse errors for error responses
      }
      throw new ApiError(response.status, response.statusText, body)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    return response.json() as Promise<T>
  }

  return {
    baseUrl: normalizedBaseUrl,

    get<T>(path: string, params?: Record<string, string>): Promise<T> {
      return request<T>('GET', path, { params })
    },

    post<T>(path: string, body?: unknown): Promise<T> {
      return request<T>('POST', path, { body })
    },

    patch<T>(path: string, body: unknown): Promise<T> {
      return request<T>('PATCH', path, { body })
    },

    delete(path: string): Promise<void> {
      return request<void>('DELETE', path)
    },
  }
}

/**
 * Global client instance, set by the CLI entry point.
 */
let globalClient: ApiClient | null = null

/**
 * Set the global API client.
 */
export function setGlobalClient(client: ApiClient): void {
  globalClient = client
}

/**
 * Get the global API client. Throws if not set.
 */
export function getClient(): ApiClient {
  if (!globalClient) {
    throw new Error('API client not initialized. This is a bug in the CLI.')
  }
  return globalClient
}

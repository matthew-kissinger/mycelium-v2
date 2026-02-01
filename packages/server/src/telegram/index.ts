/**
 * Telegram Bot Integration for Mycelium v2
 *
 * Provides 2-way communication with agents via Telegram:
 * - Outbound: Agents send notifications, screenshots, and questions to users
 * - Inbound: Users reply to questions, give direction, or send messages
 *
 * Configuration:
 * - Environment: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * - Config file: ~/.config/mycelium-v2/telegram.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// =============================================================================
// Types
// =============================================================================

export interface TelegramConfig {
  botToken: string
  chatId: string
  enabled: boolean
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramMessage {
  message_id: number
  chat: {
    id: number
  }
  text?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  date: number
  reply_to_message?: TelegramMessage
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramCallbackQuery {
  id: string
  data?: string
  message?: TelegramMessage
}

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

export interface TelegramBotInfo {
  id: number
  is_bot: boolean
  first_name: string
  username: string
  can_join_groups: boolean
  can_read_all_group_messages: boolean
  supports_inline_queries: boolean
}

export interface SendMessageOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  replyMarkup?: InlineKeyboardMarkup | ForceReply
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export interface ForceReply {
  force_reply: true
  input_field_placeholder?: string
  selective?: boolean
}

export interface TelegramService {
  isConnected(): boolean
  getBotUsername(): string | null
  getLastUpdateId(): number
  sendMessage(text: string, options?: SendMessageOptions): Promise<number | null>
  sendPhoto(photoPath: string, caption?: string): Promise<number | null>
  sendDocument(filePath: string, caption?: string): Promise<number | null>
  sendButtons(text: string, options: string[], columns?: number): Promise<number | null>
  getUpdates(timeout?: number): Promise<TelegramUpdate[]>
  getFile(fileId: string): Promise<Buffer | null>
  startPolling(onUpdate: (update: TelegramUpdate) => Promise<void>): void
  stopPolling(): void
}

// =============================================================================
// Configuration
// =============================================================================

const CONFIG_DIR = join(homedir(), '.config', 'mycelium-v2')
const CONFIG_PATH = join(CONFIG_DIR, 'telegram.json')

export function loadConfig(): TelegramConfig | null {
  // First check environment variables
  const envToken = process.env.TELEGRAM_BOT_TOKEN
  const envChatId = process.env.TELEGRAM_CHAT_ID

  if (envToken && envChatId) {
    return {
      botToken: envToken,
      chatId: envChatId,
      enabled: true,
    }
  }

  // Fall back to config file
  if (!existsSync(CONFIG_PATH)) {
    return null
  }

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    const data = JSON.parse(content)
    return {
      botToken: data.bot_token || data.botToken,
      chatId: String(data.chat_id || data.chatId),
      enabled: data.enabled !== false,
    }
  } catch (error) {
    console.error('[Telegram] Error loading config:', error)
    return null
  }
}

export function saveConfig(config: TelegramConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify({
    bot_token: config.botToken,
    chat_id: config.chatId,
    enabled: config.enabled,
  }, null, 2))
}

// =============================================================================
// Telegram API Client
// =============================================================================

class TelegramClient implements TelegramService {
  private config: TelegramConfig
  private baseUrl: string
  private lastUpdateId: number = 0
  private botInfo: TelegramBotInfo | null = null
  private connected: boolean = false
  private pollingActive: boolean = false
  private pollAbortController: AbortController | null = null

  constructor(config: TelegramConfig) {
    this.config = config
    this.baseUrl = `https://api.telegram.org/bot${config.botToken}`
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  async connect(): Promise<boolean> {
    try {
      const response = await this.request('getMe')
      if (response.ok && response.result) {
        this.botInfo = response.result as TelegramBotInfo
        this.connected = true
        console.log(`[Telegram] Connected as @${this.botInfo.username}`)
        return true
      }
      return false
    } catch (error) {
      console.error('[Telegram] Failed to connect:', error)
      return false
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  getBotUsername(): string | null {
    return this.botInfo?.username ?? null
  }

  getLastUpdateId(): number {
    return this.lastUpdateId
  }

  // ---------------------------------------------------------------------------
  // Low-level API Request
  // ---------------------------------------------------------------------------

  private async request(
    method: string,
    data?: Record<string, unknown>,
    files?: Record<string, { filename: string; data: Buffer; contentType: string }>
  ): Promise<{ ok: boolean; result?: unknown; error_code?: number; description?: string }> {
    const url = `${this.baseUrl}/${method}`

    try {
      let response: Response

      if (files) {
        // Multipart form data for file uploads
        const formData = new FormData()

        // Add regular fields
        if (data) {
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
              formData.append(key, typeof value === 'string' ? value : JSON.stringify(value))
            }
          }
        }

        // Add files
        for (const [key, file] of Object.entries(files)) {
          // Convert Buffer to ArrayBuffer slice for Blob compatibility
          const arrayBuffer = file.data.buffer.slice(
            file.data.byteOffset,
            file.data.byteOffset + file.data.byteLength
          ) as ArrayBuffer
          const blob = new Blob([arrayBuffer], { type: file.contentType })
          formData.append(key, blob, file.filename)
        }

        response = await fetch(url, {
          method: 'POST',
          body: formData,
        })
      } else if (data) {
        // JSON POST
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      } else {
        // GET
        response = await fetch(url)
      }

      const result = await response.json()
      return result as { ok: boolean; result?: unknown; error_code?: number; description?: string }
    } catch (error) {
      console.error(`[Telegram] API error (${method}):`, error)
      return { ok: false, description: String(error) }
    }
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  async sendMessage(text: string, options?: SendMessageOptions): Promise<number | null> {
    const data: Record<string, unknown> = {
      chat_id: this.config.chatId,
      text,
      parse_mode: options?.parseMode ?? 'HTML',
    }

    if (options?.replyMarkup) {
      data.reply_markup = options.replyMarkup
    }

    const response = await this.request('sendMessage', data)
    if (response.ok && response.result) {
      const msg = response.result as TelegramMessage
      return msg.message_id
    }
    console.error('[Telegram] Failed to send message:', response.description)
    return null
  }

  async sendPhoto(photoPath: string, caption?: string): Promise<number | null> {
    const { readFileSync, existsSync } = await import('fs')
    const { basename, extname } = await import('path')

    if (!existsSync(photoPath)) {
      console.error(`[Telegram] Photo not found: ${photoPath}`)
      return null
    }

    const photoData = readFileSync(photoPath)
    const filename = basename(photoPath)
    const ext = extname(photoPath).toLowerCase()
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'

    const data: Record<string, unknown> = {
      chat_id: this.config.chatId,
    }
    if (caption) {
      data.caption = caption
      data.parse_mode = 'HTML'
    }

    const files = {
      photo: { filename, data: photoData, contentType },
    }

    const response = await this.request('sendPhoto', data, files)
    if (response.ok && response.result) {
      const msg = response.result as TelegramMessage
      return msg.message_id
    }
    console.error('[Telegram] Failed to send photo:', response.description)
    return null
  }

  async sendDocument(filePath: string, caption?: string): Promise<number | null> {
    const { readFileSync, existsSync } = await import('fs')
    const { basename } = await import('path')

    if (!existsSync(filePath)) {
      console.error(`[Telegram] File not found: ${filePath}`)
      return null
    }

    const fileData = readFileSync(filePath)
    const filename = basename(filePath)

    const data: Record<string, unknown> = {
      chat_id: this.config.chatId,
    }
    if (caption) {
      data.caption = caption
    }

    const files = {
      document: { filename, data: fileData, contentType: 'application/octet-stream' },
    }

    const response = await this.request('sendDocument', data, files)
    if (response.ok && response.result) {
      const msg = response.result as TelegramMessage
      return msg.message_id
    }
    console.error('[Telegram] Failed to send document:', response.description)
    return null
  }

  async sendButtons(text: string, options: string[], columns: number = 1): Promise<number | null> {
    // Build keyboard rows
    const keyboard: InlineKeyboardButton[][] = []
    let row: InlineKeyboardButton[] = []

    for (const opt of options) {
      row.push({ text: opt, callback_data: opt })
      if (row.length >= columns) {
        keyboard.push(row)
        row = []
      }
    }
    if (row.length > 0) {
      keyboard.push(row)
    }

    return this.sendMessage(text, {
      replyMarkup: { inline_keyboard: keyboard },
    })
  }

  // ---------------------------------------------------------------------------
  // Updates (Polling)
  // ---------------------------------------------------------------------------

  async getUpdates(timeout: number = 30): Promise<TelegramUpdate[]> {
    const data: Record<string, unknown> = {
      timeout,
      allowed_updates: ['message', 'callback_query'],
    }

    if (this.lastUpdateId > 0) {
      data.offset = this.lastUpdateId + 1
    }

    const response = await this.request('getUpdates', data)

    if (response.ok && Array.isArray(response.result)) {
      const updates = response.result as TelegramUpdate[]

      if (updates.length > 0) {
        this.lastUpdateId = Math.max(...updates.map(u => u.update_id))
      }

      return updates
    }

    return []
  }

  async answerCallbackQuery(queryId: string, text?: string): Promise<boolean> {
    const data: Record<string, unknown> = {
      callback_query_id: queryId,
    }
    if (text) {
      data.text = text
    }

    const response = await this.request('answerCallbackQuery', data)
    return response.ok
  }

  // ---------------------------------------------------------------------------
  // File Download
  // ---------------------------------------------------------------------------

  async getFile(fileId: string): Promise<Buffer | null> {
    const response = await this.request('getFile', { file_id: fileId })

    if (!response.ok || !response.result) {
      console.error('[Telegram] Failed to get file info:', response.description)
      return null
    }

    const fileInfo = response.result as { file_path?: string }
    if (!fileInfo.file_path) {
      console.error('[Telegram] No file path in response')
      return null
    }

    const fileUrl = `https://api.telegram.org/file/bot${this.config.botToken}/${fileInfo.file_path}`

    try {
      const downloadResponse = await fetch(fileUrl)
      if (!downloadResponse.ok) {
        console.error(`[Telegram] Failed to download file: ${downloadResponse.status}`)
        return null
      }
      const arrayBuffer = await downloadResponse.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (error) {
      console.error('[Telegram] Error downloading file:', error)
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // Polling Loop
  // ---------------------------------------------------------------------------

  startPolling(onUpdate: (update: TelegramUpdate) => Promise<void>): void {
    if (this.pollingActive) {
      console.warn('[Telegram] Polling already active')
      return
    }

    this.pollingActive = true
    this.pollAbortController = new AbortController()
    console.log('[Telegram] Starting polling...')

    const poll = async () => {
      while (this.pollingActive) {
        try {
          const updates = await this.getUpdates(30)

          for (const update of updates) {
            try {
              await onUpdate(update)
            } catch (error) {
              console.error('[Telegram] Error handling update:', error)
            }
          }
        } catch (error) {
          if (this.pollingActive) {
            console.error('[Telegram] Polling error:', error)
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        }
      }
    }

    // Start polling in background
    poll().catch(console.error)
  }

  stopPolling(): void {
    console.log('[Telegram] Stopping polling...')
    this.pollingActive = false
    this.pollAbortController?.abort()
    this.pollAbortController = null
  }
}

// =============================================================================
// Service Factory & Global Instance
// =============================================================================

let telegramService: TelegramClient | null = null

export async function createTelegramService(config?: TelegramConfig): Promise<TelegramService | null> {
  const cfg = config ?? loadConfig()
  if (!cfg || !cfg.enabled) {
    console.log('[Telegram] Not configured or disabled')
    return null
  }

  const client = new TelegramClient(cfg)
  const connected = await client.connect()

  if (!connected) {
    return null
  }

  return client
}

export async function initTelegramService(): Promise<TelegramService | null> {
  if (telegramService) {
    return telegramService
  }

  const service = await createTelegramService()
  if (service) {
    telegramService = service as TelegramClient
  }
  return telegramService
}

export function getTelegramService(): TelegramService | null {
  return telegramService
}

export function shutdownTelegramService(): void {
  if (telegramService) {
    telegramService.stopPolling()
    telegramService = null
  }
}

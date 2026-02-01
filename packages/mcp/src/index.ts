#!/usr/bin/env bun
/**
 * Mycelium MCP Server
 *
 * Exposes mycelium functionality as MCP tools for Claude Code and other MCP clients.
 *
 * Usage:
 *   bun run packages/mcp/src/index.ts
 *
 * Or add to Claude Code MCP config (~/.claude/mcp.json):
 *   {
 *     "mcpServers": {
 *       "mycelium": {
 *         "command": "mycelium-mcp"
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { tools, handleToolCall } from './tools/index.js'

const server = new Server(
  {
    name: 'mycelium',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}))

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return handleToolCall(request.params.name, request.params.arguments ?? {})
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Mycelium MCP server running on stdio')
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error)
  process.exit(1)
})

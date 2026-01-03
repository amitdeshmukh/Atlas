/**
 * MCP (Model Context Protocol) server for AxOntology.
 * Provides a tool-based interface for LLM agents to interact with the world model.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { WorldModel } from '../core/worldModel.js';
import { registerTools, handleToolCall } from './tools.js';
import { registerResources, handleResourceRead } from './resources.js';

export interface MCPServerOptions {
  worldModel: WorldModel;
}

/**
 * Creates and starts the MCP server.
 */
export async function createMCPServer(options: MCPServerOptions): Promise<Server> {
  const { worldModel } = options;

  const server = new Server(
    {
      name: 'axontology',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: registerTools(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleToolCall(worldModel, request.params.name, request.params.arguments ?? {});
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: await registerResources(worldModel),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return handleResourceRead(worldModel, request.params.uri);
  });

  return server;
}

/**
 * Starts the MCP server with stdio transport.
 */
export async function startMCPServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Server started');
}


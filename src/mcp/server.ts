/**
 * MCP (Model Context Protocol) server for AxOntology.
 * Provides a tool-based interface for LLM agents to interact with the world model.
 */

import { FastMCP } from 'fastmcp';
import type { WorldModel } from '../core/worldModel.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';

export interface MCPServerOptions {
  worldModel: WorldModel;
}

/**
 * Creates the MCP server with all tools and resources registered.
 */
export function createMCPServer(options: MCPServerOptions): FastMCP {
  const { worldModel } = options;

  const server = new FastMCP({
    name: 'axontology',
    version: '1.0.0',
  });

  // Register tools and resources
  registerTools(server, worldModel);
  registerResources(server, worldModel);

  return server;
}

/**
 * Starts the MCP server with stdio transport.
 */
export function startMCPServer(server: FastMCP): void {
  server.start({ transportType: 'stdio' });
}


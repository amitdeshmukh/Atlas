/**
 * Standalone MCP Server Entry Point
 *
 * This starts only the MCP server with stdio transport for testing.
 */

import { createStorageAdapter } from './adapters/index.js';
import { WorldModel } from './core/worldModel.js';
import { createMCPServer, startMCPServer } from './mcp/server.js';
import { runOntologyBootstrap } from './bootstrap/ontologyBootstrap.js';

async function main() {
  try {
    // Create storage adapter (defaults to SurrealDB)
    const adapter = createStorageAdapter('surreal');

    // Create world model with the adapter
    const worldModel = new WorldModel(adapter);

    // Optional ontology bootstrap (idempotent, may be empty)
    await runOntologyBootstrap();

    // Create MCP server
    const server = createMCPServer({ worldModel });

    // Start the MCP server with stdio transport
    startMCPServer(server);

    console.error('[MCP] Server started successfully');
    console.error('[MCP] Listening on stdio transport');
  } catch (err) {
    console.error('[MCP] Fatal error starting server:', err);
    process.exit(1);
  }
}

main();

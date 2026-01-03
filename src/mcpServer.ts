/**
 * Standalone MCP Server Entry Point
 *
 * This starts only the MCP server with stdio transport for testing.
 */

import { createStorageAdapter } from './adapters/index.js';
import { WorldModel } from './core/worldModel.js';
import { createMCPServer, startMCPServer } from './mcp/server.js';
import { runOntologyBootstrap } from './bootstrap/ontologyBootstrap.js';

// Set MCP_MODE immediately (though imports have already run by now)
process.env.MCP_MODE = 'true';

// Suppress all non-MCP output for clean stdio JSON-RPC communication
console.log = () => {};
console.error = () => {};
console.warn = () => {};
console.info = () => {};
console.debug = () => {};

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

    // Server is now running and handling stdio
  } catch (err) {
    // For fatal errors, we can log to stderr before exit
    const errorMsg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`MCP Server fatal error: ${errorMsg}\n`);
    process.exit(1);
  }
}

main();

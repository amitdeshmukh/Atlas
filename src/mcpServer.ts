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
    // Set MCP mode flag to prevent .env file loading
    // MCP servers should receive env vars from Claude Desktop config
    process.env.MCP_MODE = 'true';

    // Suppress all non-MCP output when running as MCP server
    // MCP protocol requires clean stdio for JSON-RPC communication
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;

    console.error = (...args: any[]) => {
      // Only allow MCP protocol messages through
      const msg = args[0];
      if (typeof msg === 'string' && msg.startsWith('[MCP]')) {
        return; // Suppress even MCP logging for clean stdio
      }
    };
    console.log = () => {}; // Suppress all console.log

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

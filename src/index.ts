/**
 * Atlas - Entry Point
 *
 * Starts the GraphQL server and optionally the MCP server.
 * Uses the new layered architecture with WorldModel and StorageAdapter.
 */

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorageAdapter } from './adapters/index.js';
import { WorldModel } from './core/worldModel.js';
import { createGraphQLServer, startGraphQLServer } from './graphql/server.js';
import { runOntologyBootstrap } from './bootstrap/ontologyBootstrap.js';
import { getServerConfig, getSurrealConfig } from './config.js';
import { registerConfigRoutes } from './api/configRoutes.js';

async function main() {
  // Create storage adapter (defaults to SurrealDB)
  const adapter = createStorageAdapter('surreal');

  // Create world model with the adapter
  const worldModel = new WorldModel(adapter);

  // Optional ontology bootstrap (idempotent, may be empty)
  await runOntologyBootstrap();

  // Create and configure GraphQL server
  const app = await createGraphQLServer({
    worldModel,
    adapter,
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
  });

  // Register API routes
  await registerConfigRoutes(app);

  // Register static file serving for visualizer
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'web'),
    prefix: '/ui/',
  });

  // Start the server
  const { port } = getServerConfig();
  await startGraphQLServer(app, '0.0.0.0', port);

  const { url: surrealUrl, namespace, database } = getSurrealConfig();

  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║                   Atlas is running                ║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('');
  console.log('  GraphQL API:    http://localhost:' + port + '/graphql');
  console.log('  GraphiQL UI:    http://localhost:' + port + '/graphiql');
  console.log('  Visualizer:     http://localhost:' + port + '/ui/');
  console.log('');
  console.log('  MCP Server:     stdio (local) — runs alongside via npm run dev');
  console.log('');
  console.log('  SurrealDB:      ' + surrealUrl);
  console.log('  Namespace:      ' + namespace);
  console.log('  Database:       ' + database);
  console.log('');
  console.log('  ─── Claude Desktop MCP config ───');
  console.log('  Add to ~/Library/Application Support/Claude/claude_desktop_config.json:');
  console.log('');
  console.log('  {');
  console.log('    "mcpServers": {');
  console.log('      "atlas": {');
  console.log('        "command": "node",');
  console.log('        "args": ["' + path.resolve(__dirname, '..', 'dist', 'mcpServer.js') + '"],');
  console.log('        "env": {');
  console.log('          "SURREAL_URL": "' + surrealUrl + '",');
  console.log('          "SURREAL_NS": "' + namespace + '",');
  console.log('          "SURREAL_DB": "' + database + '"');
  console.log('        }');
  console.log('      }');
  console.log('    }');
  console.log('  }');
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error starting server', err);
  process.exit(1);
});

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
import { getServerConfig } from './config.js';
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
    prefix: '/graph/',
  });

  // Start the server
  const { port } = getServerConfig();
  await startGraphQLServer(app, '0.0.0.0', port);

  console.log(`[GraphQL] Server running at http://localhost:${port}/graphql`);
  console.log(`[GraphQL] GraphiQL available at http://localhost:${port}/graphiql`);
  console.log(`[Visualizer] UI available at http://localhost:${port}/graph/`);
}

main().catch((err) => {
  console.error('Fatal error starting server', err);
  process.exit(1);
});

/**
 * AxOntology - Entry Point
 *
 * Starts the GraphQL server and optionally the MCP server.
 * Uses the new layered architecture with WorldModel and StorageAdapter.
 */

import cors from '@fastify/cors';
import { createStorageAdapter } from './adapters/index.js';
import { WorldModel } from './core/worldModel.js';
import { createGraphQLServer, startGraphQLServer } from './graphql/server.js';
import { runOntologyBootstrap } from './bootstrap/ontologyBootstrap.js';
import { getServerConfig } from './config.js';

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

  // Start the server
  const { port } = getServerConfig();
  await startGraphQLServer(app, '0.0.0.0', port);

  console.log(`[GraphQL] Server running at http://localhost:${port}/graphql`);
  console.log(`[GraphQL] GraphiQL available at http://localhost:${port}/graphiql`);
}

main().catch((err) => {
  console.error('Fatal error starting server', err);
  process.exit(1);
});

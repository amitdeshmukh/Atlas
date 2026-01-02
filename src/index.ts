import Fastify from 'fastify';
import mercurius from 'mercurius';
import cors from '@fastify/cors';
import { schemaSDL } from './schema/sdl.js';
import { buildResolvers } from './schema/resolvers.js';
import { createSurrealGraphDbAdapter } from './storage/surrealAdapter.js';
import { runOntologyBootstrap } from './bootstrap/ontologyBootstrap.js';
import { getServerConfig } from './config.js';

async function main() {
  const fastify = Fastify({
    logger: true,
  });

  await fastify.register(cors, {
    origin: true,
  });

  // Optional ontology bootstrap (idempotent, may be empty)
  await runOntologyBootstrap();

  const adapter = createSurrealGraphDbAdapter();
  const resolvers = buildResolvers(adapter) as any;

  await fastify.register(mercurius, {
    schema: schemaSDL,
    resolvers,
    graphiql: true,
    context: (request) => {
      // Global default asOf = NOW(), but queries can override via args
      const now = new Date();
      return {
        asOf: now.toISOString(),
        request,
        graphDb: adapter,
      };
    },
  });

  const { port } = getServerConfig();
  await fastify.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error starting server', err);
  process.exit(1);
});



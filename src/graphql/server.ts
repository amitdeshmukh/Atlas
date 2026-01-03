/**
 * GraphQL server setup using Fastify + Mercurius.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import type { WorldModel } from '../core/worldModel.js';
import type { StorageAdapter } from '../adapters/types.js';
import { schemaSDL } from './sdl.js';
import { buildResolvers } from './resolvers.js';

export interface GraphQLServerOptions {
  worldModel: WorldModel;
  adapter: StorageAdapter;
  host?: string;
  port?: number;
}

/**
 * Creates and configures the GraphQL server.
 */
export async function createGraphQLServer(
  options: GraphQLServerOptions,
): Promise<FastifyInstance> {
  const { worldModel, adapter, host = '0.0.0.0', port = 4000 } = options;

  const app = Fastify({
    logger: true,
  });

  const resolvers = buildResolvers(worldModel, adapter);

  await app.register(mercurius, {
    schema: schemaSDL,
    resolvers: resolvers as any,
    graphiql: true,
    context: () => ({
      asOf: new Date().toISOString(),
      worldModel,
      adapter,
    }),
  });

  return app;
}

/**
 * Starts the GraphQL server.
 */
export async function startGraphQLServer(
  app: FastifyInstance,
  host: string = '0.0.0.0',
  port: number = 4000,
): Promise<void> {
  await app.listen({ host, port });
}


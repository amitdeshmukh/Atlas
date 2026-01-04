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

  // Store initial worldModel and adapter in app context
  (app as any).worldModel = worldModel;
  (app as any).adapter = adapter;

  const resolvers = buildResolvers(worldModel, adapter);

  await app.register(mercurius, {
    schema: schemaSDL,
    resolvers: resolvers as any,
    graphiql: true,
    context: () => {
      // Use dynamic worldModel/adapter if available (updated via API)
      // Otherwise fall back to initial ones
      const currentWorldModel = (app as any).worldModel || worldModel;
      const currentAdapter = (app as any).adapter || adapter;

      return {
        asOf: new Date().toISOString(),
        worldModel: currentWorldModel,
        adapter: currentAdapter,
      };
    },
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


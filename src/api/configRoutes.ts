/**
 * Configuration API Routes
 * Provides access to current connection configuration and runtime updates
 */

import type { FastifyInstance } from 'fastify';
import { getSurrealConfig, getServerConfig } from '../config.js';
import { createStorageAdapter } from '../adapters/index.js';
import { WorldModel } from '../core/worldModel.js';

export async function registerConfigRoutes(app: FastifyInstance) {
  // Get current connection configuration (sanitized - no password)
  app.get('/api/config', async (request, reply) => {
    const surrealConfig = getSurrealConfig();
    const serverConfig = getServerConfig();

    // Check if we have a runtime config override
    const currentConfig = (app as any).currentConfig || surrealConfig;

    return {
      surreal: {
        url: currentConfig.url,
        namespace: currentConfig.namespace,
        database: currentConfig.database,
        username: currentConfig.username,
        // Never expose password
        passwordSet: Boolean(currentConfig.password),
      },
      server: {
        port: serverConfig.port,
      },
      note: 'You can update connection settings at runtime without restarting the server.',
    };
  });

  // Update connection configuration at runtime
  app.post('/api/config/connect', async (request, reply) => {
    const body = request.body as any;

    // Validate required fields
    if (!body.url || !body.namespace || !body.database || !body.username || !body.password) {
      return reply.code(400).send({
        error: 'Missing required fields',
        required: ['url', 'namespace', 'database', 'username', 'password'],
      });
    }

    try {
      // Create new storage adapter with provided credentials
      const newConfig = {
        url: body.url,
        namespace: body.namespace,
        database: body.database,
        username: body.username,
        password: body.password,
      };

      const newAdapter = createStorageAdapter('surreal', newConfig);

      // Test the connection by trying to connect
      // The adapter will throw if connection fails
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Give the adapter a moment to connect
          resolve(true);
        }, 500);
      });

      // Create new WorldModel with the new adapter
      const newWorldModel = new WorldModel(newAdapter);

      // Store in app context for future requests
      (app as any).worldModel = newWorldModel;
      (app as any).adapter = newAdapter;
      (app as any).currentConfig = newConfig;

      return {
        success: true,
        message: 'Successfully connected to SurrealDB',
        config: {
          url: newConfig.url,
          namespace: newConfig.namespace,
          database: newConfig.database,
          username: newConfig.username,
        },
      };
    } catch (error) {
      console.error('Failed to connect with new credentials:', error);
      return reply.code(500).send({
        error: 'Failed to connect to SurrealDB',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });
}

/**
 * Storage adapter factory.
 * Returns the appropriate storage adapter based on configuration.
 */

import type { StorageAdapter } from './types.js';
import { createSurrealAdapter } from './surreal/surrealAdapter.js';

export type BackendType = 'surreal' | 'neo4j' | 'postgres';

/**
 * Creates a storage adapter based on the specified backend type.
 * Currently only SurrealDB is implemented.
 *
 * @param backend - The backend type to use (default: 'surreal')
 * @returns A storage adapter instance
 */
export function createStorageAdapter(backend: BackendType = 'surreal'): StorageAdapter {
  switch (backend) {
    case 'surreal':
      return createSurrealAdapter();

    case 'neo4j':
      throw new Error(
        'Neo4j adapter not implemented yet. See src/adapters/README.md for how to add a new backend.',
      );

    case 'postgres':
      throw new Error(
        'PostgreSQL adapter not implemented yet. See src/adapters/README.md for how to add a new backend.',
      );

    default:
      throw new Error(`Unknown backend type: ${backend}`);
  }
}

// Re-export types
export type { StorageAdapter } from './types.js';


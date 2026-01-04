# Adding a New Storage Backend

This guide explains how to implement a new storage adapter for Atlas.

## Overview

Atlas uses an adapter pattern to abstract the storage layer. This allows the system to support multiple graph databases (SurrealDB, Neo4j, PostgreSQL, etc.) without changing the core business logic.

## StorageAdapter Interface

All adapters must implement the `StorageAdapter` interface defined in `types.ts`. The interface includes:

### Node Operations
- `getNodeById(id, asOf)` - Get a node by ID at a point in time
- `getNodesByType(type, asOf, limit)` - Get nodes of a type
- `upsertNode(input)` - Create or update a node
- `invalidateRecord(id, invalidAt)` - Soft delete a record

### Edge Operations
- `getEdgesForNode(nodeId, direction, asOf, includeHistorical?)` - Get edges connected to a node. When `includeHistorical=true`, returns ALL edges regardless of temporal validity.
- `upsertEdge(input)` - Create or update an edge

### List Operations
- `getListDefinitionByName(name, asOf)` - Get a list definition
- `upsertListDefinition(input)` - Create or update a list definition

### Ontology Operations
- `getTypeByName(name)` - Get a type definition
- `getRelationByName(name)` - Get a relation type definition
- `getPropertiesForType(typeName)` - Get properties for a type
- `getOutgoingRelationsForType(typeName)` - Get outgoing relations
- `getIncomingRelationsForType(typeName)` - Get incoming relations
- `upsertTypeDef(name, description, properties)` - Create/update a type
- `upsertRelationTypeDef(name, description, sourceType, targetType)` - Create/update a relation type
- `searchOntology(query, limit)` - Semantic search over ontology
- `findOntologyPaths(fromType, toType, maxDepth)` - Find paths between types
- `findInstancePaths(fromNodeId, toNodeId, maxDepth)` - Find paths between nodes

### Summary
- `getOntologySummary()` - Get counts of types, relations, lists

## Implementation Steps

### 1. Create the adapter directory

```
src/adapters/
  └── neo4j/               # Your new backend
      └── neo4jAdapter.ts
```

### 2. Implement the StorageAdapter interface

```typescript
// src/adapters/neo4j/neo4jAdapter.ts
import type { StorageAdapter } from '../types.js';

export function createNeo4jAdapter(): StorageAdapter {
  // Initialize your database connection

  return {
    async getNodeById(id, asOf) {
      // Your implementation
    },
    // ... implement all methods
  };
}
```

### 3. Register in the factory

```typescript
// src/adapters/index.ts
import { createNeo4jAdapter } from './neo4j/neo4jAdapter.js';

export function createStorageAdapter(backend: BackendType = 'surreal'): StorageAdapter {
  switch (backend) {
    case 'surreal':
      return createSurrealAdapter();
    case 'neo4j':
      return createNeo4jAdapter();
    // ...
  }
}
```

### 4. Add configuration

Update `src/config.ts` to include configuration for your new backend:

```typescript
export function getNeo4jConfig() {
  return {
    url: process.env.NEO4J_URL || 'bolt://localhost:7687',
    username: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  };
}
```

### 5. Add tests

Create integration tests for your adapter:

```typescript
// src/test/neo4j.test.ts
import { describe, it, expect } from 'vitest';
import { createNeo4jAdapter } from '../adapters/neo4j/neo4jAdapter.js';

describe('Neo4j Adapter', () => {
  it('should create and retrieve nodes', async () => {
    const adapter = createNeo4jAdapter();
    // Test implementation
  });
});
```

## Key Considerations

### Temporal Modeling

All state is temporal with `validAt` and `invalidAt` timestamps:
- Nodes and edges are never deleted, only invalidated
- Queries always filter by `asOf` timestamp
- Handle `invalidAt = null` as "still valid"

### Canonical Names

Type and relation names are always uppercase. Use `canonicalName()` from `core/types.ts`.

### Ontology as Data

The ontology (types, relations, properties) is stored as data, not code. Your adapter must:
- Store type definitions with properties
- Store relation type definitions with source/target types
- Maintain graph edges for ontology relationships (e.g., ALLOWS_RELATION, TARGET_TYPE)

### Semantic Search

The `searchOntology` method uses embedding-based search. You can:
- Use the existing `embedText()` and `cosineSimilarity()` from `embeddings/embeddingService.js`
- Or implement native vector search if your database supports it

### Path Finding

Path finding between types and instances should use your database's native graph traversal capabilities if available, or fall back to BFS.

## Reference Implementation

See `surreal/surrealAdapter.ts` for a complete reference implementation using SurrealDB.


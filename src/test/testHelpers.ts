import { Surreal } from 'surrealdb';
import { runOntologyBootstrap } from '../bootstrap/ontologyBootstrap.js';
import { buildResolvers } from '../schema/resolvers.js';
import { schemaSDL } from '../schema/sdl.js';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import type {
  GraphDbAdapter,
  StoredNode,
  StoredEdge,
  Direction,
  FilterDSL,
  ListDefinitionRecord,
} from '../storage/types.js';

function canonicalName(name: string): string {
  return name.trim().toUpperCase();
}

function fromNodeRecord(rec: any): StoredNode {
  return {
    id: rec.id,
    type: rec.type,
    properties: rec.properties ?? {},
    validAt: rec.validAt,
    invalidAt: rec.invalidAt ?? null,
  };
}

function fromEdgeRecord(rec: any): StoredEdge {
  return {
    id: rec.id,
    relationType: rec.relationType,
    fromId: rec.fromId,
    toId: rec.toId,
    properties: rec.properties ?? {},
    validAt: rec.validAt,
    invalidAt: rec.invalidAt ?? null,
  };
}

/**
 * Convert a RELATE edge record to StoredEdge.
 * RELATE edges have `in` (source) and `out` (target) fields.
 */
function fromRelateEdgeRecord(rec: any, relationType: string): StoredEdge {
  return {
    id: String(rec.id),
    relationType,
    fromId: String(rec.fromId ?? rec.in),
    toId: String(rec.toId ?? rec.out),
    properties: rec.properties ?? {},
    validAt: rec.validAt,
    invalidAt: rec.invalidAt ?? null,
  };
}

function createTestAdapter(db: Surreal): GraphDbAdapter {
  return {
    async getNodeById(id, asOf) {
      const [rows] = (await db.query(
        /* surrealql */ `
        SELECT * FROM type::thing($id)
        WHERE validAt <= $asOf
          AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf)
        LIMIT 1;
        `,
        { id, asOf },
      )) as any[];

      if (!rows?.[0]) return null;
      return fromNodeRecord(rows[0]);
    },

    async getNodesByType(type, asOf, limit, filter) {
      const [rows] = (await db.query(
        /* surrealql */ `
        SELECT * FROM node
        WHERE type = $type
          AND validAt <= $asOf
          AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf)
        LIMIT $limit;
        `,
        { type, asOf, limit },
      )) as any[];
      return (rows ?? []).map(fromNodeRecord);
    },

    async upsertNode(input) {
      const now = new Date().toISOString();
      const id = input.id ?? undefined;
      const validAt = input.validAt ?? now;

      if (id) {
        await db.query(
          /* surrealql */ `
          UPDATE node
          SET invalidAt = $validAt
          WHERE id = $id
            AND (invalidAt = NONE OR invalidAt > $validAt);
        `,
          { id, validAt },
        );
      }

      const [createRes] = (await db.create('node', {
        id,
        type: canonicalName(input.type),
        properties: input.properties ?? {},
        validAt,
      })) as any[];

      return fromNodeRecord(createRes);
    },

    async invalidateRecord(id, invalidAt) {
      const [rows] = (await db.query(
        /* surrealql */ `
        UPDATE type::thing($id) SET invalidAt = $invalidAt
        WHERE (invalidAt = NONE OR invalidAt = null OR invalidAt > $invalidAt);
        `,
        { id, invalidAt },
      )) as any[];
      return (rows ?? []).length > 0;
    },

    async getEdgesForNode(nodeId, direction, asOf) {
      // With RELATE, each relationType is its own edge table.
      // Query all relation types from the ontology.
      const [relTypes] = (await db.query(
        /* surrealql */ `SELECT name FROM relationTypeDef;`,
      )) as any[];
      
      const relationTypeNames: string[] = (relTypes ?? []).map((r: any) => r.name);
      
      if (relationTypeNames.length === 0) {
        return [];
      }

      const allEdges: StoredEdge[] = [];
      
      for (const relType of relationTypeNames) {
        // Validate relation type name
        if (!/^[A-Z][A-Z0-9_]*$/.test(relType)) continue;
        
        let query: string;
        if (direction === 'OUTGOING') {
          query = `
            SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
            FROM ${relType}
            WHERE in = type::thing($nodeId)
              AND validAt <= $asOf
              AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
          `;
        } else if (direction === 'INCOMING') {
          query = `
            SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
            FROM ${relType}
            WHERE out = type::thing($nodeId)
              AND validAt <= $asOf
              AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
          `;
        } else {
          query = `
            SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
            FROM ${relType}
            WHERE (in = type::thing($nodeId) OR out = type::thing($nodeId))
              AND validAt <= $asOf
              AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
          `;
        }
        
        const [rows] = (await db.query(query, { nodeId, asOf })) as any[];
        
        for (const row of rows ?? []) {
          allEdges.push(fromRelateEdgeRecord(row, relType));
        }
      }
      
      return allEdges;
    },

    async upsertEdge(input) {
      const now = new Date().toISOString();
      const validAt = input.validAt ?? now;
      const relationType = canonicalName(input.relationType);

      // Validate relation type name to prevent SQL injection
      if (!/^[A-Z][A-Z0-9_]*$/.test(relationType)) {
        throw new Error(`Invalid relation type name: ${relationType}`);
      }

      // Create edge using RELATE syntax
      const results = (await db.query(
        /* surrealql */ `
        LET $from = type::thing($fromId);
        LET $to = type::thing($toId);
        
        UPDATE ${relationType}
        SET invalidAt = $validAt
        WHERE in = $from 
          AND out = $to
          AND (invalidAt = NONE OR invalidAt > $validAt);
        
        RELATE $from->${relationType}->$to
        SET validAt = $validAt,
            properties = $properties;
        `,
        {
          fromId: input.fromId,
          toId: input.toId,
          validAt,
          properties: input.properties ?? {},
        },
      )) as any[];

      // Results: [LET, LET, UPDATE, RELATE] - RELATE is at index 3
      const created = results[3]?.[0];
      return fromRelateEdgeRecord(created, relationType);
    },

    async getOntologySummary() {
      const [typeRows] = (await db.query(
        /* surrealql */ `SELECT COUNT() AS count FROM typeDef;`,
      )) as any[];
      const [relRows] = (await db.query(
        /* surrealql */ `SELECT COUNT() AS count FROM relationTypeDef;`,
      )) as any[];
      const [listRows] = (await db.query(
        /* surrealql */ `SELECT COUNT() AS count FROM listDef;`,
      )) as any[];

      // SurrealDB returns results as arrays directly
      const typeCount = typeRows?.[0]?.count ?? 0;
      const relCount = relRows?.[0]?.count ?? 0;
      const listCount = listRows?.[0]?.count ?? 0;

      return {
        typeCount: typeof typeCount === 'number' ? typeCount : 0,
        relationCount: typeof relCount === 'number' ? relCount : 0,
        listCount: typeof listCount === 'number' ? listCount : 0,
      };
    },

    async getListDefinitionByName(name, asOf) {
      const [rows] = (await db.query(
        /* surrealql */ `
        SELECT * FROM listDef
        WHERE name = $name
          AND validAt <= $asOf
          AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf)
        LIMIT 1;
        `,
        { name, asOf },
      )) as any[];

      if (!rows?.[0]) return null;
      const rec = rows[0];
      return {
        name: rec.name,
        description: rec.description,
        targetType: rec.targetType,
        filter: rec.filter,
        validAt: rec.validAt,
        invalidAt: rec.invalidAt ?? null,
      };
    },

    async upsertListDefinition(input) {
      const now = new Date().toISOString();
      const validAt = input.validAt ?? now;

      await db.query(
        /* surrealql */ `
        UPDATE listDef
        SET invalidAt = $validAt
        WHERE name = $name
          AND (invalidAt = NONE OR invalidAt > $validAt);
      `,
        { name: input.name, validAt },
      );

      const [createRes] = (await db.create('listDef', {
        name: input.name,
        description: input.description,
        targetType: canonicalName(input.targetType),
        filter: input.filter,
        validAt,
      })) as any[];

      return {
        name: createRes.name,
        description: createRes.description,
        targetType: createRes.targetType,
        filter: createRes.filter,
        validAt: createRes.validAt,
        invalidAt: createRes.invalidAt ?? null,
      };
    },
  };
}

export interface TestContext {
  db: Surreal;
  adapter: GraphDbAdapter;
  app: ReturnType<typeof Fastify>;
  namespace: string;
  database: string;
}

/**
 * Set up a test database with bootstrap.
 * Uses a unique namespace/database per test run to avoid conflicts.
 */
export async function setupTestDatabase(
  bootstrapEnabled = true,
): Promise<TestContext> {
  const timestamp = Date.now();
  const namespace = `test_${timestamp}`;
  const database = `test_${timestamp}`;

  const url = process.env.SURREAL_URL ?? 'http://127.0.0.1:8000/rpc';
  const username = process.env.SURREAL_USER ?? '';
  const password = process.env.SURREAL_PASS ?? '';

  // Save original env vars
  const originalNs = process.env.SURREAL_NS;
  const originalDb = process.env.SURREAL_DB;
  const originalBootstrapEnabled = process.env.ONTOLOGY_BOOTSTRAP_ENABLED;
  const originalBootstrapDir = process.env.ONTOLOGY_BOOTSTRAP_DIR;

  // Set test database in env (for ontology functions)
  process.env.SURREAL_NS = namespace;
  process.env.SURREAL_DB = database;

  const db = new Surreal();
  await db.connect(url);
  await db.signin({ username, password });
  await db.use({ namespace, database });

  if (bootstrapEnabled) {
    process.env.ONTOLOGY_BOOTSTRAP_ENABLED = 'true';
    process.env.ONTOLOGY_BOOTSTRAP_DIR =
      process.env.ONTOLOGY_BOOTSTRAP_DIR ??
      './examples/bootstrap_ontologies';
    await runOntologyBootstrap();
  }

  // Restore original env (but keep test NS/DB for the test context)
  if (originalBootstrapEnabled !== undefined) {
    process.env.ONTOLOGY_BOOTSTRAP_ENABLED = originalBootstrapEnabled;
  } else {
    delete process.env.ONTOLOGY_BOOTSTRAP_ENABLED;
  }
  if (originalBootstrapDir !== undefined) {
    process.env.ONTOLOGY_BOOTSTRAP_DIR = originalBootstrapDir;
  } else {
    delete process.env.ONTOLOGY_BOOTSTRAP_DIR;
  }

  const adapter = createTestAdapter(db);

  const app = Fastify({ logger: false });
  const resolvers = buildResolvers(adapter) as any;

  await app.register(mercurius, {
    schema: schemaSDL,
    resolvers,
    context: () => ({
      asOf: new Date().toISOString(),
      graphDb: adapter,
    }),
  });

  return { db, adapter, app, namespace, database };
}

/**
 * Clean up test database and namespace
 */
export async function teardownTestDatabase(ctx: TestContext): Promise<void> {
  console.log(`[Teardown] Cleaning up test namespace: ${ctx.namespace}, database: ${ctx.database}`);
  
  try {
    // Ensure we're using the test namespace/database context
    await ctx.db.use({
      namespace: ctx.namespace,
      database: ctx.database,
    });

    // Remove the database first (this removes all tables/data)
    // SurrealDB requires database names to be quoted if they contain special characters
    try {
      const [result] = await ctx.db.query(`REMOVE DATABASE ${ctx.database}`);
      console.log(`[Teardown] Removed database: ${ctx.database}`);
    } catch (err: any) {
      // Database might already be removed or not exist
      if (!err.message?.includes('does not exist')) {
        console.warn(`[Teardown] Failed to remove database ${ctx.database}:`, err.message);
      }
    }

    // Switch to root namespace context to remove the namespace
    // We need to be in a different namespace to remove the test namespace
    const url = process.env.SURREAL_URL ?? 'http://127.0.0.1:8000/rpc';
    const username = process.env.SURREAL_USER ?? '';
    const password = process.env.SURREAL_PASS ?? '';
    
    // Create a temporary connection to root namespace to remove the test namespace
    const tempDb = new Surreal();
    try {
      await tempDb.connect(url);
      await tempDb.signin({ username, password });
      
      // Remove the namespace (must be done from root context)
      try {
        const [result] = await tempDb.query(`REMOVE NAMESPACE ${ctx.namespace}`);
        console.log(`[Teardown] Removed namespace: ${ctx.namespace}`);
      } catch (err: any) {
        if (!err.message?.includes('does not exist')) {
          console.warn(`[Teardown] Failed to remove namespace ${ctx.namespace}:`, err.message);
        }
      }
      
      await tempDb.close();
    } catch (err) {
      console.warn('[Teardown] Error creating temp connection for namespace removal:', err);
    }

  } catch (err) {
    console.warn('[Teardown] Error during teardown:', err);
  } finally {
    // Always close connections and restore env vars
    try {
      await ctx.db.close();
    } catch (err) {
      // Ignore close errors
    }

    try {
      await ctx.app.close();
    } catch (err) {
      // Ignore close errors
    }

    // Restore original env vars
    if (process.env.SURREAL_NS === ctx.namespace) {
      delete process.env.SURREAL_NS;
    }
    if (process.env.SURREAL_DB === ctx.database) {
      delete process.env.SURREAL_DB;
    }
    
    console.log(`[Teardown] Cleanup complete for ${ctx.namespace}/${ctx.database}`);
  }
}

/**
 * Execute a GraphQL query against the test server
 */
export async function graphqlQuery<T = unknown>(
  app: ReturnType<typeof Fastify>,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: T; errors?: unknown[] }> {
  const response = await app.inject({
    method: 'POST',
    url: '/graphql',
    payload: {
      query,
      variables,
    },
  });

  return JSON.parse(response.body);
}


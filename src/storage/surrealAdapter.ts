import { Surreal } from 'surrealdb';
import { getSurrealConfig } from '../config.js';
import type {
  Direction,
  FilterDSL,
  GraphDbAdapter,
  ListDefinitionRecord,
  StoredEdge,
  StoredNode,
} from './types.js';

function canonicalName(name: string): string {
  return name.trim().toUpperCase();
}

export function createSurrealGraphDbAdapter(): GraphDbAdapter {
  const db = new Surreal();

  let isConnected = false;

  async function ensureConnection() {
    if (isConnected) return;
    const surreal = getSurrealConfig();

    await db.connect(surreal.url);
    await db.signin({
      username: surreal.username,
      password: surreal.password,
    });
    await db.use({
      namespace: surreal.namespace,
      database: surreal.database,
    });

    isConnected = true;
  }

  return {
    async getNodeById(id, asOf) {
      await ensureConnection();
      // Use type::thing() to convert string ID to record ID
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
      await ensureConnection();
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
      const nodes = (rows ?? []).map(fromNodeRecord);
      if (!filter) return nodes;
      // Filter DSL evaluation can be added later with SurrealQL translation.
      return nodes;
    },

    async upsertNode(input) {
      await ensureConnection();
      const now = new Date().toISOString();
      const id = input.id ?? undefined;
      const validAt = input.validAt ?? now;

      if (id) {
        // Invalidate previous version
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
      await ensureConnection();
      // Use type::thing() to convert string ID to record ID
      // Works for both nodes (node:xxx) and RELATE edges (RELATION_TYPE:xxx)
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
      await ensureConnection();
      
      // With RELATE, each relationType is its own edge table.
      // We need to query all relation types from the ontology.
      const [relTypes] = (await db.query(
        /* surrealql */ `SELECT name FROM relationTypeDef;`,
      )) as any[];
      
      const relationTypeNames: string[] = (relTypes ?? []).map((r: any) => r.name);
      
      if (relationTypeNames.length === 0) {
        return [];
      }

      // Build a query that unions results from all relation type edge tables
      const allEdges: StoredEdge[] = [];
      
      for (const relType of relationTypeNames) {
        // Validate relation type name (should already be valid from ontology, but be safe)
        if (!/^[A-Z][A-Z0-9_]*$/.test(relType)) continue;
        
        let query: string;
        if (direction === 'OUTGOING') {
          // Get outgoing edges: node -[relType]-> ?
          query = `
            SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
            FROM ${relType}
            WHERE in = type::thing($nodeId)
              AND validAt <= $asOf
              AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
          `;
        } else if (direction === 'INCOMING') {
          // Get incoming edges: ? -[relType]-> node
          query = `
            SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
            FROM ${relType}
            WHERE out = type::thing($nodeId)
              AND validAt <= $asOf
              AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
          `;
        } else {
          // Get both directions
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
      await ensureConnection();
      const now = new Date().toISOString();
      const validAt = input.validAt ?? now;
      const relationType = canonicalName(input.relationType);

      // Validate relation type name to prevent SQL injection
      // Only allow alphanumeric and underscore
      if (!/^[A-Z][A-Z0-9_]*$/.test(relationType)) {
        throw new Error(`Invalid relation type name: ${relationType}`);
      }

      // Invalidate previous edge between same nodes with same relation type
      // and create new edge using RELATE syntax
      // Note: RELATE requires literal table names, so we interpolate it safely
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

      // Results: [LET result, LET result, UPDATE result, RELATE result]
      // The RELATE result is at index 3 (after two LETs and the UPDATE)
      const relateResult = results[3];
      const created = relateResult?.[0];
      return fromRelateEdgeRecord(created, relationType);
    },

    async getListDefinitionByName(name, asOf) {
      await ensureConnection();
      const [rows] = (await db.query(
        /* surrealql */ `
        SELECT * FROM listDefinition
        WHERE name = $name
          AND validAt <= $asOf
          AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf)
        ORDER BY validAt DESC
        LIMIT 1;
        `,
        { name, asOf },
      )) as any[];
      if (!rows?.[0]) return null;
      return fromListRecord(rows[0]);
    },

    async upsertListDefinition(input) {
      await ensureConnection();
      const now = new Date().toISOString();
      const validAt = input.validAt ?? now;

      await db.query(
        /* surrealql */ `
        UPDATE listDefinition
        SET invalidAt = $validAt
        WHERE name = $name
          AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $validAt);
        `,
        { name: input.name, validAt },
      );

      const [createRes] = (await db.create('listDefinition', {
        name: input.name,
        description: input.description,
        targetType: canonicalName(input.targetType),
        filter: input.filter,
        validAt,
        invalidAt: input.invalidAt ?? null,
      })) as any[];

      return fromListRecord(createRes);
    },

    async getOntologySummary() {
      await ensureConnection();
      const [typesRows, relsRows, listsRows] = (await db.query(
        /* surrealql */ `
        SELECT count() AS typeCount FROM typeDef GROUP ALL;
        SELECT count() AS relationCount FROM relationTypeDef GROUP ALL;
        SELECT count(name) AS listCount FROM (SELECT name FROM listDefinition GROUP BY name);
      `,
      )) as any[];

      const typeCount = typesRows?.[0]?.typeCount ?? 0;
      const relationCount = relsRows?.[0]?.relationCount ?? 0;
      const listCount = listsRows?.[0]?.listCount ?? 0;

      return { typeCount, relationCount, listCount };
    },
  };
}

function fromNodeRecord(row: any): StoredNode {
  return {
    id: String(row.id),
    type: row.type,
    properties: row.properties ?? {},
    validAt: row.validAt,
    invalidAt: row.invalidAt ?? null,
  };
}

function fromEdgeRecord(row: any): StoredEdge {
  return {
    id: String(row.id),
    relationType: row.relationType,
    fromId: row.fromId,
    toId: row.toId,
    properties: row.properties ?? {},
    validAt: row.validAt,
    invalidAt: row.invalidAt ?? null,
  };
}

/**
 * Convert a RELATE edge record to StoredEdge.
 * RELATE edges have `in` (source) and `out` (target) fields.
 */
function fromRelateEdgeRecord(row: any, relationType: string): StoredEdge {
  return {
    id: String(row.id),
    relationType,
    fromId: String(row.fromId ?? row.in),
    toId: String(row.toId ?? row.out),
    properties: row.properties ?? {},
    validAt: row.validAt,
    invalidAt: row.invalidAt ?? null,
  };
}

function fromListRecord(row: any): ListDefinitionRecord {
  return {
    name: row.name,
    description: row.description,
    targetType: row.targetType,
    filter: row.filter as FilterDSL,
    validAt: row.validAt,
    invalidAt: row.invalidAt ?? null,
  };
}

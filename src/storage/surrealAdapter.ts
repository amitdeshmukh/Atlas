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
      let query: string;
      if (direction === 'OUTGOING') {
        query = `
          SELECT * FROM edge
          WHERE fromId = $nodeId
            AND validAt <= $asOf
            AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
        `;
      } else if (direction === 'INCOMING') {
        query = `
          SELECT * FROM edge
          WHERE toId = $nodeId
            AND validAt <= $asOf
            AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
        `;
      } else {
        query = `
          SELECT * FROM edge
          WHERE (fromId = $nodeId OR toId = $nodeId)
            AND validAt <= $asOf
            AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
        `;
      }
      const [rows] = (await db.query(query, {
        nodeId,
        asOf,
      })) as any[];
      return (rows ?? []).map(fromEdgeRecord);
    },

    async upsertEdge(input) {
      await ensureConnection();
      const now = new Date().toISOString();
      const validAt = input.validAt ?? now;

      if (input.id) {
        await db.query(
          /* surrealql */ `
          UPDATE edge
          SET invalidAt = $validAt
          WHERE id = $id
            AND (invalidAt = NONE OR invalidAt > $validAt);
        `,
          { id: input.id, validAt },
        );
      }

      const [createRes] = (await db.create('edge', {
        relationType: canonicalName(input.relationType),
        fromId: input.fromId,
        toId: input.toId,
        properties: input.properties ?? {},
        validAt,
      })) as any[];

      return fromEdgeRecord(createRes);
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
        SELECT count(type) AS typeCount FROM (SELECT type FROM node GROUP BY type);
        SELECT count(relationType) AS relationCount FROM (SELECT relationType FROM edge GROUP BY relationType);
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

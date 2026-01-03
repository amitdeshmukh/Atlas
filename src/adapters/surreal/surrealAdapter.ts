/**
 * SurrealDB storage adapter implementation.
 * Implements the full StorageAdapter interface for SurrealDB.
 */

import { Surreal } from 'surrealdb';
import { getSurrealConfig, type SurrealConfig } from '../../config.js';
import { cosineSimilarity, embedText } from '../../embeddings/embeddingService.js';
import type { StorageAdapter } from '../types.js';
import type {
  Entity,
  Relationship,
  ListDefinition,
  TypeDef,
  RelationTypeDef,
  PropertyDef,
  FilterDSL,
  OntologySummary,
  OntologyPath,
  InstancePath,
  Direction,
} from '../../core/types.js';
import { canonicalName } from '../../core/types.js';

/**
 * Creates a SurrealDB storage adapter.
 * @param config - Optional configuration (if not provided, uses environment variables)
 */
export function createSurrealAdapter(config?: SurrealConfig): StorageAdapter {
  const db = new Surreal();
  let isConnected = false;

  async function ensureConnection(): Promise<void> {
    if (isConnected) return;
    const surreal = config || getSurrealConfig();

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

  // ===========================================================================
  // Node Operations
  // ===========================================================================

  async function getNodeById(id: string, asOf: string): Promise<Entity | null> {
    await ensureConnection();
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
  }

  async function getNodesByType(
    type: string,
    asOf: string,
    limit: number,
  ): Promise<Entity[]> {
    await ensureConnection();
    const [rows] = (await db.query(
      /* surrealql */ `
      SELECT * FROM node
      WHERE type = $type
        AND validAt <= $asOf
        AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf)
      LIMIT $limit;
      `,
      { type: canonicalName(type), asOf, limit },
    )) as any[];
    return (rows ?? []).map(fromNodeRecord);
  }

  async function upsertNode(input: {
    id?: string | null;
    type: string;
    properties: Record<string, unknown>;
    validAt: string;
    invalidAt?: string | null;
  }): Promise<Entity> {
    await ensureConnection();
    const id = input.id ?? undefined;
    const validAt = input.validAt;

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
  }

  async function invalidateRecord(id: string, invalidAt: string): Promise<boolean> {
    await ensureConnection();
    const [rows] = (await db.query(
      /* surrealql */ `
      UPDATE type::thing($id) SET invalidAt = $invalidAt
      WHERE (invalidAt = NONE OR invalidAt = null OR invalidAt > $invalidAt);
      `,
      { id, invalidAt },
    )) as any[];
    return (rows ?? []).length > 0;
  }

  // ===========================================================================
  // Edge Operations
  // ===========================================================================

  async function getEdgesForNode(
    nodeId: string,
    direction: Direction,
    asOf: string,
  ): Promise<Relationship[]> {
    await ensureConnection();

    const [relTypes] = (await db.query(
      /* surrealql */ `SELECT name FROM relationTypeDef;`,
    )) as any[];

    const relationTypeNames: string[] = (relTypes ?? []).map((r: any) => r.name);

    if (relationTypeNames.length === 0) {
      return [];
    }

    const allEdges: Relationship[] = [];

    for (const relType of relationTypeNames) {
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
  }

  async function upsertEdge(input: {
    id?: string | null;
    relationType: string;
    fromId: string;
    toId: string;
    properties?: Record<string, unknown>;
    validAt: string;
  }): Promise<Relationship> {
    await ensureConnection();
    const validAt = input.validAt;
    const relationType = canonicalName(input.relationType);

    if (!/^[A-Z][A-Z0-9_]*$/.test(relationType)) {
      throw new Error(`Invalid relation type name: ${relationType}`);
    }

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

    const relateResult = results[3];
    const created = relateResult?.[0];
    return fromRelateEdgeRecord(created, relationType);
  }

  // ===========================================================================
  // List Operations
  // ===========================================================================

  async function getListDefinitionByName(
    name: string,
    asOf: string,
  ): Promise<ListDefinition | null> {
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
  }

  async function upsertListDefinition(input: {
    name: string;
    description: string;
    targetType: string;
    filter: FilterDSL;
    validAt: string;
    invalidAt?: string | null;
  }): Promise<ListDefinition> {
    await ensureConnection();
    const validAt = input.validAt;

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
  }

  // ===========================================================================
  // Ontology Operations
  // ===========================================================================

  async function getTypeByName(name: string): Promise<TypeDef | null> {
    await ensureConnection();
    const upper = canonicalName(name);
    const [rows] = (await db.query(
      /* surrealql */ `
      SELECT * FROM typeDef
      WHERE name = $name
      LIMIT 1;
      `,
      { name: upper },
    )) as any[];
    const row = rows?.[0];
    if (!row) return null;
    return {
      name: row.name,
      description: row.description,
      properties: (row.properties ?? []).map((p: any) => ({
        name: p.name,
        description: p.description,
        dataType: p.dataType,
      })),
    };
  }

  async function getRelationByName(name: string): Promise<RelationTypeDef | null> {
    await ensureConnection();
    const upper = canonicalName(name);
    const [rows] = (await db.query(
      /* surrealql */ `
      SELECT * FROM relationTypeDef
      WHERE name = $name
      LIMIT 1;
      `,
      { name: upper },
    )) as any[];
    const row = rows?.[0];
    if (!row) return null;
    return {
      name: row.name,
      description: row.description,
      sourceType: row.sourceType,
      targetType: row.targetType,
    };
  }

  async function getPropertiesForType(typeName: string): Promise<PropertyDef[]> {
    await ensureConnection();
    const [rows] = (await db.query(
      /* surrealql */ `
      SELECT properties
      FROM typeDef
      WHERE name = $typeName
      LIMIT 1;
      `,
      { typeName: canonicalName(typeName) },
    )) as any[];
    const row: any = rows?.[0] ?? {};
    const props: any[] = row.properties ?? [];
    return props.map((p) => ({
      name: p.name,
      description: p.description,
      dataType: p.dataType,
    }));
  }

  async function getOutgoingRelationsForType(
    typeName: string,
  ): Promise<RelationTypeDef[]> {
    await ensureConnection();
    const [rows] = (await db.query(
      /* surrealql */ `
      SELECT ->allows_relation->relationTypeDef.* AS rels
      FROM typeDef
      WHERE name = $typeName;
      `,
      { typeName: canonicalName(typeName) },
    )) as any[];
    const rels: any[] = (rows ?? []).flatMap((row: any) => row.rels ?? []);
    return rels.map((r) => ({
      name: r.name,
      description: r.description,
      sourceType: r.sourceType,
      targetType: r.targetType,
    }));
  }

  async function getIncomingRelationsForType(
    typeName: string,
  ): Promise<RelationTypeDef[]> {
    await ensureConnection();
    const [rows] = (await db.query(
      /* surrealql */ `
      SELECT <-target_type<-relationTypeDef.* AS rels
      FROM typeDef
      WHERE name = $typeName;
      `,
      { typeName: canonicalName(typeName) },
    )) as any[];
    const rels: any[] = (rows ?? []).flatMap((row: any) => row.rels ?? []);
    return rels.map((r) => ({
      name: r.name,
      description: r.description,
      sourceType: r.sourceType,
      targetType: r.targetType,
    }));
  }

  async function upsertTypeDef(
    name: string,
    description: string,
    properties?: PropertyDef[],
  ): Promise<TypeDef> {
    await ensureConnection();
    const canonical = canonicalName(name);
    await db.query(
      /* surrealql */ `
      UPSERT typeDef:${canonical} SET name = $name, description = $description, properties = $properties;
      `,
      {
        name: canonical,
        description,
        properties: properties ?? [],
      },
    );
    return {
      name: canonical,
      description,
      properties,
    };
  }

  async function upsertRelationTypeDef(
    name: string,
    description: string,
    sourceType: string,
    targetType: string,
  ): Promise<RelationTypeDef> {
    await ensureConnection();
    const canonical = canonicalName(name);
    const source = canonicalName(sourceType);
    const target = canonicalName(targetType);

    await db.query(
      /* surrealql */ `
      UPSERT relationTypeDef:${canonical}
      SET name = $name,
          description = $description,
          sourceType = $sourceType,
          targetType = $targetType;
      `,
      {
        name: canonical,
        description,
        sourceType: source,
        targetType: target,
      },
    );

    // Maintain ontology graph edges
    await db.query(
      /* surrealql */ `
      LET $src = type::thing('typeDef', $sourceType);
      LET $rel = type::thing('relationTypeDef', $name);
      LET $tgt = type::thing('typeDef', $targetType);

      DELETE allows_relation WHERE in = $src AND out = $rel;
      RELATE $src->allows_relation->$rel;

      DELETE target_type WHERE in = $rel AND out = $tgt;
      RELATE $rel->target_type->$tgt;
      `,
      {
        sourceType: source,
        targetType: target,
        name: canonical,
      },
    );

    return {
      name: canonical,
      description,
      sourceType: source,
      targetType: target,
    };
  }

  async function searchOntology(
    query: string,
    limit: number,
    asOf?: string,
  ): Promise<{
    types: Array<{ type: TypeDef; score: number; matchReason?: string }>;
    relations: Array<{ relation: RelationTypeDef; score: number; matchReason?: string }>;
    lists: Array<{ list: ListDefinition; score: number; matchReason?: string }>;
  }> {
    await ensureConnection();
    const now = asOf ?? new Date().toISOString();
    
    const [typesRows, relsRows, listsRows] = (await db.query(
      /* surrealql */ `
      SELECT * FROM typeDef;
      SELECT * FROM relationTypeDef;
      SELECT * FROM listDefinition
        WHERE validAt <= $asOf
          AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf);
      `,
      { asOf: now },
    )) as any[];

    const types: any[] = typesRows ?? [];
    const relations: any[] = relsRows ?? [];
    const lists: any[] = listsRows ?? [];

    if (types.length === 0 && relations.length === 0 && lists.length === 0) {
      return { types: [], relations: [], lists: [] };
    }

    const queryEmbedding = await embedText(query);

    const typeHits = await Promise.all(
      types.map(async (t) => {
        const desc: string = t.description ?? '';
        const emb = await embedText(desc);
        const score = cosineSimilarity(queryEmbedding, emb);
        return {
          type: {
            name: t.name,
            description: t.description,
            properties: (t.properties ?? []).map((p: any) => ({
              name: p.name,
              description: p.description,
              dataType: p.dataType,
            })),
          },
          score,
          matchReason: t.description,
        };
      }),
    );

    const relationHits = await Promise.all(
      relations.map(async (r) => {
        const desc: string = r.description ?? '';
        const emb = await embedText(desc);
        const score = cosineSimilarity(queryEmbedding, emb);
        return {
          relation: {
            name: r.name,
            description: r.description,
            sourceType: r.sourceType,
            targetType: r.targetType,
          },
          score,
          matchReason: r.description,
        };
      }),
    );

    const listHits = await Promise.all(
      lists.map(async (l) => {
        const desc: string = l.description ?? '';
        const emb = await embedText(desc);
        const score = cosineSimilarity(queryEmbedding, emb);
        return {
          list: fromListRecord(l),
          score,
          matchReason: l.description,
        };
      }),
    );

    typeHits.sort((a, b) => b.score - a.score);
    relationHits.sort((a, b) => b.score - a.score);
    listHits.sort((a, b) => b.score - a.score);

    return {
      types: typeHits.slice(0, limit),
      relations: relationHits.slice(0, limit),
      lists: listHits.slice(0, limit),
    };
  }

  // ===========================================================================
  // Path Finding
  // ===========================================================================

  async function findOntologyPaths(
    fromType: string,
    toType: string,
    maxDepth: number,
  ): Promise<OntologyPath[]> {
    await ensureConnection();
    const from = canonicalName(fromType);
    const to = canonicalName(toType);

    if (from === to) {
      return [{ steps: [], pathDescription: `${from} (same type)`, depth: 0 }];
    }

    // Get all relations for building adjacency
    const [results] = (await db.query(
      /* surrealql */ `
      SELECT name, description, sourceType, targetType
      FROM relationTypeDef;
      `,
    )) as any[];

    const allRelations: RelationTypeDef[] = (results ?? []).map((r: any) => ({
      name: r.name,
      description: r.description,
      sourceType: r.sourceType,
      targetType: r.targetType,
    }));

    // Build adjacency maps
    const outgoingMap = new Map<
      string,
      Array<{ relation: RelationTypeDef; targetType: string }>
    >();
    const incomingMap = new Map<
      string,
      Array<{ relation: RelationTypeDef; sourceType: string }>
    >();

    for (const rel of allRelations) {
      if (!outgoingMap.has(rel.sourceType)) {
        outgoingMap.set(rel.sourceType, []);
      }
      outgoingMap.get(rel.sourceType)!.push({ relation: rel, targetType: rel.targetType });

      if (!incomingMap.has(rel.targetType)) {
        incomingMap.set(rel.targetType, []);
      }
      incomingMap.get(rel.targetType)!.push({ relation: rel, sourceType: rel.sourceType });
    }

    const paths: OntologyPath[] = [];

    interface QueueItem {
      currentType: string;
      steps: Array<{
        relation: RelationTypeDef;
        direction: 'OUTGOING' | 'INCOMING';
        targetType: string;
      }>;
      visitedTypes: Set<string>;
    }

    const queue: QueueItem[] = [
      { currentType: from, steps: [], visitedTypes: new Set([from]) },
    ];

    while (queue.length > 0) {
      const item = queue.shift()!;

      if (item.steps.length >= maxDepth) continue;

      // Try outgoing relations
      const outgoing = outgoingMap.get(item.currentType) ?? [];
      for (const { relation, targetType } of outgoing) {
        if (item.visitedTypes.has(targetType)) continue;

        const newSteps = [
          ...item.steps,
          { relation, direction: 'OUTGOING' as const, targetType },
        ];

        if (targetType === to) {
          let desc = from;
          for (const step of newSteps) {
            desc += ` -->[${step.relation.name}]--> ${step.targetType}`;
          }
          paths.push({ steps: newSteps, pathDescription: desc, depth: newSteps.length });
        } else {
          const newVisited = new Set(item.visitedTypes);
          newVisited.add(targetType);
          queue.push({
            currentType: targetType,
            steps: newSteps,
            visitedTypes: newVisited,
          });
        }
      }

      // Try incoming relations (reverse traversal)
      const incoming = incomingMap.get(item.currentType) ?? [];
      for (const { relation, sourceType } of incoming) {
        if (item.visitedTypes.has(sourceType)) continue;

        const newSteps = [
          ...item.steps,
          { relation, direction: 'INCOMING' as const, targetType: sourceType },
        ];

        if (sourceType === to) {
          let desc = from;
          for (const step of newSteps) {
            const arrow = step.direction === 'OUTGOING' ? '-->' : '<--';
            desc += ` ${arrow}[${step.relation.name}]${arrow} ${step.targetType}`;
          }
          paths.push({ steps: newSteps, pathDescription: desc, depth: newSteps.length });
        } else {
          const newVisited = new Set(item.visitedTypes);
          newVisited.add(sourceType);
          queue.push({
            currentType: sourceType,
            steps: newSteps,
            visitedTypes: newVisited,
          });
        }
      }
    }

    paths.sort((a, b) => a.depth - b.depth);
    return paths;
  }

  async function findInstancePaths(
    fromNodeId: string,
    toNodeId: string,
    maxDepth: number,
  ): Promise<InstancePath[]> {
    if (fromNodeId === toNodeId) {
      return [{ edges: [], pathDescription: `${fromNodeId} (same node)`, depth: 0 }];
    }

    await ensureConnection();

    // Get all relation type names
    const [relTypeRows] = (await db.query(
      /* surrealql */ `SELECT name FROM relationTypeDef;`,
    )) as any[];

    const relationTypes: string[] = (relTypeRows ?? []).map((r: any) => r.name);

    if (relationTypes.length === 0) {
      return [];
    }

    type EdgeRecord = {
      id: string;
      relationType: string;
      fromId: string;
      toId: string;
      validAt: string;
      invalidAt: string | null;
    };

    async function getEdgesForNodeBFS(nodeId: string): Promise<EdgeRecord[]> {
      const edges: EdgeRecord[] = [];

      for (const relType of relationTypes) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(relType)) continue;

        const [rows] = (await db.query(
          /* surrealql */ `
          SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
          FROM ${relType}
          WHERE (in = type::thing($nodeId) OR out = type::thing($nodeId))
            AND (invalidAt = NONE OR invalidAt IS NULL OR invalidAt > time::now());
          `,
          { nodeId },
        )) as any[];

        for (const row of rows ?? []) {
          edges.push({
            id: String(row.id),
            relationType: relType,
            fromId: String(row.fromId),
            toId: String(row.toId),
            validAt: row.validAt,
            invalidAt: row.invalidAt ?? null,
          });
        }
      }

      return edges;
    }

    const paths: InstancePath[] = [];

    interface QueueItem {
      currentNode: string;
      edgePath: EdgeRecord[];
      visited: Set<string>;
    }

    const queue: QueueItem[] = [
      { currentNode: fromNodeId, edgePath: [], visited: new Set([fromNodeId]) },
    ];

    while (queue.length > 0 && paths.length < 10) {
      const item = queue.shift()!;

      if (item.edgePath.length >= maxDepth) continue;

      const edges = await getEdgesForNodeBFS(item.currentNode);

      for (const edge of edges) {
        const nextNode = edge.fromId === item.currentNode ? edge.toId : edge.fromId;

        if (item.visited.has(nextNode)) continue;

        const newPath = [...item.edgePath, edge];

        if (nextNode === toNodeId) {
          const desc = newPath.map((e) => `--[${e.relationType}]-->`).join(' ');
          paths.push({
            edges: newPath,
            pathDescription: `${fromNodeId} ${desc} ${toNodeId}`,
            depth: newPath.length,
          });
        } else if (newPath.length < maxDepth) {
          const newVisited = new Set(item.visited);
          newVisited.add(nextNode);
          queue.push({ currentNode: nextNode, edgePath: newPath, visited: newVisited });
        }
      }
    }

    paths.sort((a, b) => a.depth - b.depth);
    return paths;
  }

  // ===========================================================================
  // Summary
  // ===========================================================================

  async function getOntologySummary(): Promise<OntologySummary> {
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
  }

  // ===========================================================================
  // Return the adapter
  // ===========================================================================

  return {
    // Nodes
    getNodeById,
    getNodesByType,
    upsertNode,
    invalidateRecord,

    // Edges
    getEdgesForNode,
    upsertEdge,

    // Lists
    getListDefinitionByName,
    upsertListDefinition,

    // Ontology
    getTypeByName,
    getRelationByName,
    getPropertiesForType,
    getOutgoingRelationsForType,
    getIncomingRelationsForType,
    upsertTypeDef,
    upsertRelationTypeDef,
    searchOntology,
    findOntologyPaths,
    findInstancePaths,

    // Summary
    getOntologySummary,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function fromNodeRecord(row: any): Entity {
  return {
    id: String(row.id),
    type: row.type,
    properties: row.properties ?? {},
    validAt: row.validAt,
    invalidAt: row.invalidAt ?? null,
  };
}

function fromRelateEdgeRecord(row: any, relationType: string): Relationship {
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

function fromListRecord(row: any): ListDefinition {
  return {
    name: row.name,
    description: row.description,
    targetType: row.targetType,
    filter: row.filter as FilterDSL,
    validAt: row.validAt,
    invalidAt: row.invalidAt ?? null,
  };
}


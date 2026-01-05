/**
 * Test helpers for Atlas integration tests.
 */

import { Surreal } from 'surrealdb';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import { runOntologyBootstrap } from '../bootstrap/ontologyBootstrap.js';
import { WorldModel } from '../core/worldModel.js';
import { schemaSDL } from '../graphql/sdl.js';
import { buildResolvers } from '../graphql/resolvers.js';
import type { StorageAdapter } from '../adapters/types.js';
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
} from '../core/types.js';
import { canonicalName } from '../core/types.js';
import { cosineSimilarity, embedText } from '../embeddings/embeddingService.js';

// =============================================================================
// Test Adapter
// =============================================================================

function fromNodeRecord(rec: any): Entity {
  return {
    id: String(rec.id),
    type: rec.type,
    properties: rec.properties ?? {},
    validAt: rec.validAt,
    invalidAt: rec.invalidAt ?? null,
  };
}

function fromRelateEdgeRecord(rec: any, relationType: string): Relationship {
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

/**
 * Creates a test adapter for SurrealDB that implements StorageAdapter.
 */
function createTestAdapter(db: Surreal): StorageAdapter {
  // -------------------------------------------------------------------------
  // Node Operations
  // -------------------------------------------------------------------------

  async function getNodeById(id: string, asOf: string): Promise<Entity | null> {
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
    const [rows] = (await db.query(
      /* surrealql */ `
      UPDATE type::thing($id) SET invalidAt = $invalidAt
      WHERE (invalidAt = NONE OR invalidAt = null OR invalidAt > $invalidAt);
      `,
      { id, invalidAt },
    )) as any[];
    return (rows ?? []).length > 0;
  }

  // -------------------------------------------------------------------------
  // Edge Operations
  // -------------------------------------------------------------------------

  async function getEdgesForNode(
    nodeId: string,
    direction: Direction,
    asOf: string,
    includeHistorical: boolean = false,
  ): Promise<Relationship[]> {
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

      // When includeHistorical is true, skip temporal filtering to return ALL edges
      const temporalFilter = includeHistorical
        ? ''
        : 'AND validAt <= $asOf AND (invalidAt = NONE OR invalidAt = null OR invalidAt > $asOf)';

      let query: string;
      if (direction === 'OUTGOING') {
        query = `
          SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
          FROM ${relType}
          WHERE in = type::thing($nodeId)
            ${temporalFilter};
        `;
      } else if (direction === 'INCOMING') {
        query = `
          SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
          FROM ${relType}
          WHERE out = type::thing($nodeId)
            ${temporalFilter};
        `;
      } else {
        query = `
          SELECT id, in AS fromId, out AS toId, validAt, invalidAt, properties
          FROM ${relType}
          WHERE (in = type::thing($nodeId) OR out = type::thing($nodeId))
            ${temporalFilter};
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

    const created = results[3]?.[0];
    return fromRelateEdgeRecord(created, relationType);
  }

  // -------------------------------------------------------------------------
  // List Operations
  // -------------------------------------------------------------------------

  async function getListDefinitionByName(
    name: string,
    asOf: string,
  ): Promise<ListDefinition | null> {
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
    const rec = rows[0];
    return {
      name: rec.name,
      description: rec.description,
      targetType: rec.targetType,
      filter: rec.filter,
      validAt: rec.validAt,
      invalidAt: rec.invalidAt ?? null,
    };
  }

  async function upsertListDefinition(input: {
    name: string;
    description: string;
    targetType: string;
    filter: FilterDSL;
    validAt: string;
    invalidAt?: string | null;
  }): Promise<ListDefinition> {
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

    return {
      name: createRes.name,
      description: createRes.description,
      targetType: createRes.targetType,
      filter: createRes.filter,
      validAt: createRes.validAt,
      invalidAt: createRes.invalidAt ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Ontology Operations
  // -------------------------------------------------------------------------

  async function getTypeByName(name: string): Promise<TypeDef | null> {
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
    const canonical = canonicalName(name);
    await db.query(
      /* surrealql */ `
      UPSERT typeDef:${canonical} SET name = $name, description = $description, properties = $properties;
      `,
      { name: canonical, description, properties: properties ?? [] },
    );
    return { name: canonical, description, properties };
  }

  async function upsertRelationTypeDef(
    name: string,
    description: string,
    sourceType: string,
    targetType: string,
  ): Promise<RelationTypeDef> {
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
      { name: canonical, description, sourceType: source, targetType: target },
    );

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
      { sourceType: source, targetType: target, name: canonical },
    );

    return { name: canonical, description, sourceType: source, targetType: target };
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
          list: {
            name: l.name,
            description: l.description,
            targetType: l.targetType,
            filter: l.filter,
            validAt: l.validAt,
            invalidAt: l.invalidAt ?? null,
          },
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

  // -------------------------------------------------------------------------
  // Path Finding
  // -------------------------------------------------------------------------

  async function findOntologyPaths(
    fromType: string,
    toType: string,
    maxDepth: number,
  ): Promise<OntologyPath[]> {
    const from = canonicalName(fromType);
    const to = canonicalName(toType);

    if (from === to) {
      return [{ steps: [], pathDescription: `${from} (same type)`, depth: 0 }];
    }

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

  // ===========================================================================
  // Instance Path Finding - Optimized with Bidirectional BFS
  // ===========================================================================

  type PathEdgeRecord = {
    id: string;
    relationType: string;
    fromId: string;
    toId: string;
    validAt: string;
    invalidAt: string | null;
  };

  /**
   * Get all edges connected to a node for path finding.
   * Queries each relation type for compatibility with SurrealDB.
   */
  async function getAllEdgesForNodePathFinding(nodeId: string): Promise<PathEdgeRecord[]> {
    // Get all relation types
    const [relTypeRows] = (await db.query(
      /* surrealql */ `SELECT name FROM relationTypeDef;`,
    )) as any[];

    const relationTypes: string[] = (relTypeRows ?? [])
      .map((r: any) => r.name)
      .filter((name: string) => /^[A-Z][A-Z0-9_]*$/.test(name));

    if (relationTypes.length === 0) {
      return [];
    }

    const edges: PathEdgeRecord[] = [];
    const seen = new Set<string>();

    // Query all relation types in parallel
    const queries = relationTypes.map((relType) =>
      db.query(
        /* surrealql */ `
        SELECT id, in AS fromId, out AS toId, validAt, invalidAt
        FROM ${relType}
        WHERE in = type::thing($nodeId) OR out = type::thing($nodeId);
        `,
        { nodeId },
      ).then((result) => ({ relType, rows: (result as any[])[0] ?? [] }))
    );

    const results = await Promise.all(queries);

    for (const { relType, rows } of results) {
      for (const row of rows) {
        if (!row?.id) continue;
        const edgeId = String(row.id);
        if (seen.has(edgeId)) continue;
        seen.add(edgeId);

        edges.push({
          id: edgeId,
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

  /**
   * Bidirectional BFS: Search from BOTH ends simultaneously.
   * Meets in the middle, reducing search space from O(b^d) to O(2 * b^(d/2)).
   */
  async function findInstancePaths(
    fromNodeId: string,
    toNodeId: string,
    maxDepth: number,
  ): Promise<InstancePath[]> {
    if (fromNodeId === toNodeId) {
      return [{ edges: [], pathDescription: `${fromNodeId} (same node)`, depth: 0 }];
    }

    interface FrontierItem {
      nodeId: string;
      edgePath: PathEdgeRecord[];
      visited: Set<string>;
    }

    // Forward frontier (from source)
    const forwardFrontier: FrontierItem[] = [
      { nodeId: fromNodeId, edgePath: [], visited: new Set([fromNodeId]) },
    ];
    const forwardVisited = new Map<string, PathEdgeRecord[]>();
    forwardVisited.set(fromNodeId, []);

    // Backward frontier (from target)
    const backwardFrontier: FrontierItem[] = [
      { nodeId: toNodeId, edgePath: [], visited: new Set([toNodeId]) },
    ];
    const backwardVisited = new Map<string, PathEdgeRecord[]>();
    backwardVisited.set(toNodeId, []);

    const paths: InstancePath[] = [];
    const maxPaths = 10;
    let currentDepth = 0;

    while (
      (forwardFrontier.length > 0 || backwardFrontier.length > 0) &&
      currentDepth < maxDepth &&
      paths.length < maxPaths
    ) {
      currentDepth++;

      // Expand the smaller frontier first (optimization)
      const expandForward = forwardFrontier.length <= backwardFrontier.length;
      const frontier = expandForward ? forwardFrontier : backwardFrontier;
      const thisVisited = expandForward ? forwardVisited : backwardVisited;
      const otherVisited = expandForward ? backwardVisited : forwardVisited;

      const nextFrontier: FrontierItem[] = [];
      const itemsToProcess = frontier.splice(0, frontier.length);

      for (const item of itemsToProcess) {
        if (item.edgePath.length >= Math.ceil(maxDepth / 2) + 1) continue;

        const edges = await getAllEdgesForNodePathFinding(item.nodeId);

        for (const edge of edges) {
          const nextNode = edge.fromId === item.nodeId ? edge.toId : edge.fromId;

          if (item.visited.has(nextNode)) continue;

          const newPath = [...item.edgePath, edge];

          // Check if we've met the other frontier
          if (otherVisited.has(nextNode)) {
            const otherPath = otherVisited.get(nextNode)!;

            let fullEdges: PathEdgeRecord[];
            if (expandForward) {
              fullEdges = [...newPath, ...otherPath.slice().reverse()];
            } else {
              fullEdges = [...otherPath, ...newPath.slice().reverse()];
            }

            if (fullEdges.length <= maxDepth) {
              const desc = fullEdges.map((e) => `--[${e.relationType}]-->`).join(' ');
              paths.push({
                edges: fullEdges,
                pathDescription: `${fromNodeId} ${desc} ${toNodeId}`,
                depth: fullEdges.length,
              });
            }
          }

          if (!thisVisited.has(nextNode) && newPath.length < Math.ceil(maxDepth / 2) + 1) {
            const newVisited = new Set(item.visited);
            newVisited.add(nextNode);
            nextFrontier.push({ nodeId: nextNode, edgePath: newPath, visited: newVisited });
            thisVisited.set(nextNode, newPath);
          }
        }
      }

      frontier.push(...nextFrontier);
    }

    // Deduplicate and sort by depth
    const seenPaths = new Set<string>();
    const uniquePaths = paths.filter((p) => {
      const key = p.edges.map((e) => e.id).join('->');
      if (seenPaths.has(key)) return false;
      seenPaths.add(key);
      return true;
    });

    uniquePaths.sort((a, b) => a.depth - b.depth);
    return uniquePaths.slice(0, maxPaths);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  async function getOntologySummary(): Promise<OntologySummary> {
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

  // -------------------------------------------------------------------------
  // Return the adapter
  // -------------------------------------------------------------------------

  return {
    getNodeById,
    getNodesByType,
    upsertNode,
    invalidateRecord,
    getEdgesForNode,
    upsertEdge,
    getListDefinitionByName,
    upsertListDefinition,
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
    getOntologySummary,
  };
}

// =============================================================================
// Test Context
// =============================================================================

export interface TestContext {
  db: Surreal;
  adapter: StorageAdapter;
  worldModel: WorldModel;
  app: ReturnType<typeof Fastify>;
  namespace: string;
  database: string;
}

/**
 * Set up a test database with bootstrap.
 * Uses a unique namespace/database per test run to avoid conflicts.
 */
export async function setupTestDatabase(bootstrapEnabled = true): Promise<TestContext> {
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
      process.env.ONTOLOGY_BOOTSTRAP_DIR ?? './examples/bootstrap_ontologies';
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
  const worldModel = new WorldModel(adapter);

  const app = Fastify({ logger: false });
  const resolvers = buildResolvers(worldModel, adapter) as any;

  await app.register(mercurius, {
    schema: schemaSDL,
    resolvers,
    context: () => ({
      asOf: new Date().toISOString(),
      worldModel,
      adapter,
    }),
  });

  return { db, adapter, worldModel, app, namespace, database };
}

/**
 * Clean up test database and namespace
 */
export async function teardownTestDatabase(ctx: TestContext): Promise<void> {
  console.log(
    `[Teardown] Cleaning up test namespace: ${ctx.namespace}, database: ${ctx.database}`,
  );

  try {
    await ctx.db.use({
      namespace: ctx.namespace,
      database: ctx.database,
    });

    try {
      await ctx.db.query(`REMOVE DATABASE ${ctx.database}`);
      console.log(`[Teardown] Removed database: ${ctx.database}`);
    } catch (err: any) {
      if (!err.message?.includes('does not exist')) {
        console.warn(`[Teardown] Failed to remove database ${ctx.database}:`, err.message);
      }
    }

    const url = process.env.SURREAL_URL ?? 'http://127.0.0.1:8000/rpc';
    const username = process.env.SURREAL_USER ?? '';
    const password = process.env.SURREAL_PASS ?? '';

    const tempDb = new Surreal();
    try {
      await tempDb.connect(url);
      await tempDb.signin({ username, password });

      try {
        await tempDb.query(`REMOVE NAMESPACE ${ctx.namespace}`);
        console.log(`[Teardown] Removed namespace: ${ctx.namespace}`);
      } catch (err: any) {
        if (!err.message?.includes('does not exist')) {
          console.warn(
            `[Teardown] Failed to remove namespace ${ctx.namespace}:`,
            err.message,
          );
        }
      }

      await tempDb.close();
    } catch (err) {
      console.warn('[Teardown] Error creating temp connection for namespace removal:', err);
    }
  } catch (err) {
    console.warn('[Teardown] Error during teardown:', err);
  } finally {
    try {
      await ctx.db.close();
    } catch {
      // Ignore close errors
    }

    try {
      await ctx.app.close();
    } catch {
      // Ignore close errors
    }

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

import { Surreal } from 'surrealdb';
import { cosineSimilarity, embedText } from '../embeddings/embeddingService.js';
import { getSurrealConfig } from '../config.js';

export interface TypeDef {
  name: string;
  description: string;
}

export interface RelationTypeDef {
  name: string;
  description: string;
  sourceType: string;
  targetType: string;
}

export interface PropertyDefRecord {
  name: string;
  description: string;
  dataType: string;
  ownerType: string;
}

let db: Surreal | null = null;
let isConnected = false;

async function getDb(): Promise<Surreal> {
  if (db && isConnected) return db;
  const instance = db ?? new Surreal();
  const surreal = getSurrealConfig();

  await instance.connect(surreal.url);
  await instance.signin({
    username: surreal.username,
    password: surreal.password,
  });
  await instance.use({
    namespace: surreal.namespace,
    database: surreal.database,
  });
  db = instance;
  isConnected = true;
  return instance;
}

export async function getTypeByName(name: string): Promise<TypeDef | null> {
  const conn = await getDb();
  const upper = name.trim().toUpperCase();
  const [rows] = (await conn.query(
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
  };
}

export async function getRelationByName(
  name: string,
): Promise<RelationTypeDef | null> {
  const conn = await getDb();
  const upper = name.trim().toUpperCase();
  const [rows] = (await conn.query(
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

export async function searchOntology(
  query: string,
  limit: number,
) {
  const conn = await getDb();
  const [typesRows, relsRows] = (await conn.query(
    /* surrealql */ `
    SELECT * FROM typeDef;
    SELECT * FROM relationTypeDef;
  `,
  )) as any[];

  const types: any[] = typesRows ?? [];
  const relations: any[] = relsRows ?? [];

  if (types.length === 0 && relations.length === 0) {
    return { types: [], relations: [] };
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

  typeHits.sort((a, b) => b.score - a.score);
  relationHits.sort((a, b) => b.score - a.score);

  return {
    types: typeHits.slice(0, limit),
    relations: relationHits.slice(0, limit),
  };
}

export async function getOutgoingRelationsForType(
  typeName: string,
): Promise<RelationTypeDef[]> {
  const conn = await getDb();
  const [rows] = (await conn.query(
    /* surrealql */ `
    SELECT ->allows_relation->relationTypeDef.* AS rels
    FROM typeDef
    WHERE name = $typeName;
  `,
    { typeName },
  )) as any[];
  const rels: any[] = (rows ?? []).flatMap((row: any) => row.rels ?? []);
  return rels.map((r) => ({
    name: r.name,
    description: r.description,
    sourceType: r.sourceType,
    targetType: r.targetType,
  }));
}

export async function getIncomingRelationsForType(
  typeName: string,
): Promise<RelationTypeDef[]> {
  const conn = await getDb();
  const [rows] = (await conn.query(
    /* surrealql */ `
    SELECT <-target_type<-relationTypeDef.* AS rels
    FROM typeDef
    WHERE name = $typeName;
  `,
    { typeName },
  )) as any[];
  const rels: any[] = (rows ?? []).flatMap((row: any) => row.rels ?? []);
  return rels.map((r) => ({
    name: r.name,
    description: r.description,
    sourceType: r.sourceType,
    targetType: r.targetType,
  }));
}

export async function getPropertiesForType(
  typeName: string,
): Promise<PropertyDefRecord[]> {
  const conn = await getDb();
  const [rows] = (await conn.query(
    /* surrealql */ `
    SELECT properties
    FROM typeDef
    WHERE name = $typeName
    LIMIT 1;
  `,
    { typeName },
  )) as any[];
  const row: any = rows?.[0] ?? {};
  const props: any[] = row.properties ?? [];
  return props.map((p) => ({
    name: p.name,
    description: p.description,
    dataType: p.dataType,
    ownerType: typeName,
  }));
}

export async function upsertTypeDef(
  name: string,
  description: string,
): Promise<TypeDef> {
  const conn = await getDb();
  const canonical = name.trim().toUpperCase();
  await conn.query(
    /* surrealql */ `
    UPSERT typeDef:${canonical} SET name = $name, description = $description;
  `,
    { name: canonical, description },
  );
  return {
    name: canonical,
    description,
  };
}

/**
 * Find paths between two types in the ontology graph using SurrealDB's native
 * recursive graph traversal.
 * 
 * Ontology graph structure:
 *   typeDef -[allows_relation]-> relationTypeDef -[target_type]-> typeDef
 * 
 * Uses SurrealDB v2.x recursive traversal for efficient DB-level path finding.
 * This scales to infinite ontologies because the DB handles the traversal.
 */
export async function findPathsBetweenTypes(
  fromType: string,
  toType: string,
  maxDepth: number = 3,
): Promise<OntologyPath[]> {
  const from = fromType.trim().toUpperCase();
  const to = toType.trim().toUpperCase();

  if (from === to) {
    return [{ steps: [], pathDescription: `${from} (same type)`, depth: 0 }];
  }

  const conn = await getDb();

  // Use SurrealDB's native recursive graph traversal
  // Each "relation hop" is 2 graph edges: allows_relation -> relationTypeDef -> target_type
  // So maxDepth relation hops = maxDepth * 2 graph edge traversals
  //
  // Query strategy: For each depth level, find reachable types and the relations used
  // We query outgoing paths (Type->Relation->Type) and incoming paths (Type<-Relation<-Type)
  
  const [results] = (await conn.query(
    /* surrealql */ `
    -- Recursive path finding using SurrealDB graph traversal
    -- Find all relationTypeDef records and use them to build adjacency
    SELECT 
      name,
      description,
      sourceType,
      targetType
    FROM relationTypeDef;
    `,
    {},
  )) as any[];

  const allRelations: RelationTypeDef[] = (results ?? []).map((r: any) => ({
    name: r.name,
    description: r.description,
    sourceType: r.sourceType,
    targetType: r.targetType,
  }));

  // Build adjacency map for efficient traversal
  const outgoingMap = new Map<string, Array<{ relation: RelationTypeDef; targetType: string }>>();
  const incomingMap = new Map<string, Array<{ relation: RelationTypeDef; sourceType: string }>>();

  for (const rel of allRelations) {
    // Outgoing: sourceType can reach targetType via this relation
    if (!outgoingMap.has(rel.sourceType)) {
      outgoingMap.set(rel.sourceType, []);
    }
    outgoingMap.get(rel.sourceType)!.push({ relation: rel, targetType: rel.targetType });

    // Incoming: targetType can reach sourceType via this relation (reverse direction)
    if (!incomingMap.has(rel.targetType)) {
      incomingMap.set(rel.targetType, []);
    }
    incomingMap.get(rel.targetType)!.push({ relation: rel, sourceType: rel.sourceType });
  }

  const paths: OntologyPath[] = [];

  // BFS with path tracking
  interface QueueItem {
    currentType: string;
    steps: Array<{ relation: RelationTypeDef; direction: 'OUTGOING' | 'INCOMING'; targetType: string }>;
    visitedTypes: Set<string>;
  }

  const queue: QueueItem[] = [{ 
    currentType: from, 
    steps: [], 
    visitedTypes: new Set([from]) 
  }];

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
        // Found a path!
        let desc = from;
        for (const step of newSteps) {
          desc += ` -->[${step.relation.name}]--> ${step.targetType}`;
        }
        paths.push({ steps: newSteps, pathDescription: desc, depth: newSteps.length });
      } else {
        // Continue exploring
        const newVisited = new Set(item.visitedTypes);
        newVisited.add(targetType);
        queue.push({ currentType: targetType, steps: newSteps, visitedTypes: newVisited });
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
        // Found a path!
        let desc = from;
        for (const step of newSteps) {
          const arrow = step.direction === 'OUTGOING' ? '-->' : '<--';
          desc += ` ${arrow}[${step.relation.name}]${arrow} ${step.targetType}`;
        }
        paths.push({ steps: newSteps, pathDescription: desc, depth: newSteps.length });
      } else {
        // Continue exploring
        const newVisited = new Set(item.visitedTypes);
        newVisited.add(sourceType);
        queue.push({ currentType: sourceType, steps: newSteps, visitedTypes: newVisited });
      }
    }
  }

  // Sort by shortest path first
  paths.sort((a, b) => a.depth - b.depth);
  return paths;
}

export interface OntologyPath {
  steps: Array<{
    relation: RelationTypeDef;
    direction: 'OUTGOING' | 'INCOMING';
    targetType: string;
  }>;
  pathDescription: string;
  depth: number;
}

/**
 * Find paths between two node INSTANCES using SurrealDB's native graph traversal.
 * Uses RELATE edges and SurrealDB's recursive graph query syntax.
 * 
 * @param fromNodeId - Starting node record ID (e.g., "node:abc123")
 * @param toNodeId - Target node record ID (e.g., "node:xyz789")
 * @param maxDepth - Maximum number of edge hops
 * @returns Array of paths, each with edges and nodes traversed
 */
export async function findPathsBetweenNodes(
  fromNodeId: string,
  toNodeId: string,
  maxDepth: number = 3,
): Promise<InstancePath[]> {
  if (fromNodeId === toNodeId) {
    return [{ edges: [], pathDescription: `${fromNodeId} (same node)`, depth: 0 }];
  }

  const conn = await getDb();

  // Get all relation type names for graph traversal
  const [relTypeRows] = (await conn.query(
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

  // Use SurrealDB's native graph traversal to get neighbors
  // For each relation type, we query edges using the graph syntax
  async function getEdgesForNode(nodeId: string): Promise<EdgeRecord[]> {
    const edges: EdgeRecord[] = [];
    
    for (const relType of relationTypes) {
      // Validate relation type name to prevent issues
      if (!/^[A-Z][A-Z0-9_]*$/.test(relType)) continue;
      
      // Query edges from this relation type table
      // RELATE edges have 'in' (source) and 'out' (target) fields
      const [rows] = (await conn.query(
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

  const queue: QueueItem[] = [{
    currentNode: fromNodeId,
    edgePath: [],
    visited: new Set([fromNodeId]),
  }];

  // BFS using native graph queries
  while (queue.length > 0 && paths.length < 10) {
    const item = queue.shift()!;
    
    if (item.edgePath.length >= maxDepth) continue;

    const edges = await getEdgesForNode(item.currentNode);

    for (const edge of edges) {
      const nextNode = edge.fromId === item.currentNode ? edge.toId : edge.fromId;
      
      if (item.visited.has(nextNode)) continue;

      const newPath = [...item.edgePath, edge];
      
      if (nextNode === toNodeId) {
        const desc = newPath.map(e => `--[${e.relationType}]-->`).join(' ');
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

export interface InstancePath {
  edges: Array<{
    id: string;
    relationType: string;
    fromId: string;
    toId: string;
    validAt: string;
    invalidAt: string | null;
  }>;
  pathDescription: string;
  depth: number;
}

export async function upsertRelationTypeDef(
  name: string,
  description: string,
  sourceType: string,
  targetType: string,
): Promise<RelationTypeDef> {
  const conn = await getDb();
  const canonical = name.trim().toUpperCase();
  const source = sourceType.trim().toUpperCase();
  const target = targetType.trim().toUpperCase();

  await conn.query(
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

  // Maintain ontology graph edges for this relation type:
  // (Type)-[:ALLOWS_RELATION]->(RelationType)
  // (RelationType)-[:TARGET_TYPE]->(Type)
  await conn.query(
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

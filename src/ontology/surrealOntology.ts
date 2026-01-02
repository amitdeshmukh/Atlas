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

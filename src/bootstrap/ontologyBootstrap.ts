import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Surreal } from 'surrealdb';
import { getBootstrapConfig, getSurrealConfig } from '../config.js';

interface BootstrapProperty {
  name: string;
  description: string;
  dataType: string;
  ownerType: string;
}

interface BootstrapType {
  name: string;
  description: string;
  properties?: BootstrapProperty[];
}

interface BootstrapRelation {
  name: string;
  description: string;
  sourceType: string;
  targetType: string;
}

interface BootstrapOntologyFile {
  types?: BootstrapType[];
  relations?: BootstrapRelation[];
  properties?: BootstrapProperty[];
}

export async function runOntologyBootstrap(): Promise<void> {
  const bootstrap = getBootstrapConfig();

  if (!bootstrap.enabled) {
    console.log('[Bootstrap] Skipped (ONTOLOGY_BOOTSTRAP_ENABLED=false)');
    return;
  }

  const dir = bootstrap.directory;

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    console.log(`[Bootstrap] Skipped (directory not found: ${dir})`);
    return;
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.log(`[Bootstrap] Skipped (no JSON files in ${dir})`);
    return;
  }

  console.log(`[Bootstrap] Loading ${jsonFiles.length} ontology file(s) from ${dir}`);

  const db = new Surreal();
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

  let totalTypes = 0;
  let totalRelations = 0;

  for (const file of jsonFiles) {
    const fullPath = path.join(dir, file);
    const raw = await fs.readFile(fullPath, 'utf8');
    const parsed = JSON.parse(raw) as BootstrapOntologyFile;
    const counts = await applyOntologyFile(db, parsed);
    totalTypes += counts.types;
    totalRelations += counts.relations;
    console.log(`[Bootstrap]   ${file}: ${counts.types} types, ${counts.relations} relations`);
  }

  console.log(`[Bootstrap] Complete: ${totalTypes} types, ${totalRelations} relations`);
}

async function applyOntologyFile(
  db: Surreal,
  data: BootstrapOntologyFile,
): Promise<{ types: number; relations: number }> {
  const types = data.types ?? [];
  const relations = data.relations ?? [];

  // Build a map of ontology-level property metadata per type.
  // These are NOT runtime values, just allowed-property definitions.
  const propertyMap = new Map<string, BootstrapProperty[]>();

  // Properties defined at the top level
  for (const p of data.properties ?? []) {
    const owner = canonicalName(p.ownerType);
    const name = canonicalName(p.name);
    const list = propertyMap.get(owner) ?? [];
    list.push({
      ...p,
      name,
      ownerType: owner,
    });
    propertyMap.set(owner, list);
  }

  // Properties defined inline on types
  for (const t of types) {
    const owner = canonicalName(t.name);
    if (!t.properties) continue;
    const existing = propertyMap.get(owner) ?? [];
    const merged: BootstrapProperty[] = [...existing];
    for (const p of t.properties) {
      const name = canonicalName(p.name);
      merged.push({
        ...p,
        name,
        ownerType: owner,
      });
    }
    propertyMap.set(owner, merged);
  }

  // Types
  for (const t of types) {
    const name = canonicalName(t.name);
    const typeProperties = propertyMap.get(name) ?? [];
    await db.query(
      /* surrealql */ `
      UPSERT typeDef:${name}
      SET name = $name,
          description = $description,
          properties = $properties;
    `,
      { name, description: t.description, properties: typeProperties },
    );
  }

  // Relations
  for (const r of relations) {
    const name = canonicalName(r.name);
    const sourceType = canonicalName(r.sourceType);
    const targetType = canonicalName(r.targetType);
    await db.query(
      /* surrealql */ `
      UPSERT relationTypeDef:${name}
      SET name = $name,
          description = $description,
          sourceType = $sourceType,
          targetType = $targetType;
    `,
      { name, description: r.description, sourceType, targetType },
    );

    // Ensure ontology graph edges exist:
    // (Type)-[:ALLOWS_RELATION]->(RelationType)
    // (RelationType)-[:TARGET_TYPE]->(Type)
    await db.query(
      /* surrealql */ `
      LET $src     = type::thing('typeDef', $sourceType);
      LET $rel     = type::thing('relationTypeDef', $name);
      LET $tgt     = type::thing('typeDef', $targetType);

      -- Idempotent ALLOWS_RELATION edge
      DELETE allows_relation WHERE in = $src AND out = $rel;
      RELATE $src->allows_relation->$rel;

      -- Idempotent TARGET_TYPE edge
      DELETE target_type WHERE in = $rel AND out = $tgt;
      RELATE $rel->target_type->$tgt;
    `,
      { sourceType, targetType, name },
    );
  }

  return { types: types.length, relations: relations.length };
}

function canonicalName(name: string): string {
  return name.trim().toUpperCase();
}



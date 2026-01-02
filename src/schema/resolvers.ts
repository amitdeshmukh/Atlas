import { GraphQLScalarType, Kind } from 'graphql';
import type { MercuriusContext } from 'mercurius';
import type {
  Direction,
  FilterDSL,
  GraphDbAdapter,
  StoredNode,
} from '../storage/types.js';
import {
  getIncomingRelationsForType,
  getOutgoingRelationsForType,
  getPropertiesForType,
  getRelationByName,
  getTypeByName,
  searchOntology,
  upsertRelationTypeDef,
  upsertTypeDef,
  type TypeDef,
  type RelationTypeDef,
} from '../ontology/surrealOntology.js';

type ResolverContext = MercuriusContext & {
  asOf: string;
  graphDb: GraphDbAdapter;
};

export function buildResolvers(graphDb: GraphDbAdapter) {
  const DateTime = new GraphQLScalarType({
    name: 'DateTime',
    serialize(value: unknown): string {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string') return value;
      throw new TypeError('DateTime must be a Date or ISO string');
    },
    parseValue(value: unknown): string {
      if (typeof value === 'string') return value;
      throw new TypeError('DateTime must be an ISO string');
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.STRING) return ast.value;
      return null;
    },
  });

  const JSONScalar = new GraphQLScalarType({
    name: 'JSON',
    serialize(value: unknown): unknown {
      return value;
    },
    parseValue(value: unknown): unknown {
      return value;
    },
    parseLiteral(ast) {
      switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
          return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
          return Number(ast.value);
        case Kind.OBJECT: {
          const value: Record<string, unknown> = {};
          for (const field of ast.fields) {
            value[field.name.value] = (field.value as any).value;
          }
          return value;
        }
        case Kind.LIST:
          return ast.values.map((v) => (v as any).value);
        case Kind.NULL:
          return null;
        default:
          return null;
      }
    },
  });

  return {
    DateTime,
    JSON: JSONScalar,
    Query: {
      async ontologySummary(
        _root: unknown,
        _args: unknown,
        ctx: ResolverContext,
      ) {
        return ctx.graphDb.getOntologySummary();
      },

      async nodes(
        _root: unknown,
        args: { type: string; filter?: any; asOf?: string; limit?: number },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const type = canonicalName(args.type);
        const nodes = await ctx.graphDb.getNodesByType(
          type,
          asOf,
          args.limit ?? 100,
        );
        const filtered =
          args.filter == null
            ? nodes
            : await filterNodesByDSL(nodes, args.filter, ctx, asOf);
        return filtered.map(toGenericNode);
      },

      async node(
        _root: unknown,
        args: { id: string; asOf?: string },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const node = await ctx.graphDb.getNodeById(args.id, asOf);
        if (!node) return null;
        return toGenericNode(node);
      },

      async searchOntology(
        _root: unknown,
        args: { query: string; limit?: number },
      ) {
        const limit = args.limit ?? 10;
        return searchOntology(args.query, limit);
      },

      async type(
        _root: unknown,
        args: { name: string },
      ) {
        return getTypeByName(args.name);
      },

      async relation(
        _root: unknown,
        args: { name: string },
      ) {
        return getRelationByName(args.name);
      },

      async list(
        _root: unknown,
        args: { name: string; asOf?: string },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const def = await ctx.graphDb.getListDefinitionByName(args.name, asOf);
        if (!def) return null;
        const members = await ctx.graphDb.getNodesByType(
          canonicalName(def.targetType),
          asOf,
          10_000,
        );
        const filteredMembers = await filterNodesByDSL(
          members,
          def.filter,
          ctx,
          asOf,
        );
        return {
          name: def.name,
          description: def.description,
          definitionUsed: def.filter,
          members: filteredMembers.map(toGenericNode),
        };
      },
    },

    NodeType: {
      async properties(root: { name: string }) {
        return getPropertiesForType(root.name);
      },
      async outgoingRelations(root: { name: string }) {
        return getOutgoingRelationsForType(root.name);
      },
      async incomingRelations(root: { name: string }) {
        return getIncomingRelationsForType(root.name);
      },
    },

    RelationType: {
      async sourceType(root: { sourceType: string }) {
        return getTypeByName(root.sourceType);
      },
      async targetType(root: { targetType: string }) {
        return getTypeByName(root.targetType);
      },
    },

    Mutation: {
      async upsertNode(
        _root: unknown,
        args: {
          type: string;
          properties: Record<string, unknown>;
          id?: string | null;
          validAt?: string | null;
        },
        ctx: ResolverContext,
      ) {
        const type = canonicalName(args.type);

        // Validate against ontology: type must exist, properties must be defined
        await validateNodeAgainstOntology(type, args.properties);

        // Default validAt to the request asOf to avoid temporal skew where
        // newly created nodes are "in the future" relative to lookups.
        const validAt = args.validAt ?? ctx.asOf;
        const node = await ctx.graphDb.upsertNode({
          id: args.id ?? null,
          type,
          properties: args.properties,
          validAt,
          invalidAt: null,
        });
        return toGenericNode(node);
      },

      async upsertEdge(
        _root: unknown,
        args: {
          relationType: string;
          fromId: string;
          toId: string;
          properties?: Record<string, unknown> | null;
          validAt?: string | null;
        },
        ctx: ResolverContext,
      ) {
        const relationType = canonicalName(args.relationType);
        const asOf = ctx.asOf;

        // Fetch both nodes to validate their types against the relation
        const fromNode = await ctx.graphDb.getNodeById(args.fromId, asOf);
        const toNode = await ctx.graphDb.getNodeById(args.toId, asOf);

        if (!fromNode) {
          throw new Error(`From-node "${args.fromId}" not found.`);
        }
        if (!toNode) {
          throw new Error(`To-node "${args.toId}" not found.`);
        }

        // Validate against ontology: relation must exist, types must match
        await validateEdgeAgainstOntology(relationType, fromNode.type, toNode.type);

        const now = new Date().toISOString();
        const edge = await ctx.graphDb.upsertEdge({
          relationType,
          fromId: args.fromId,
          toId: args.toId,
          properties: args.properties ?? {},
          validAt: args.validAt ?? now,
        });
        return edge;
      },

      async upsertEdgeByNodeRef(
        _root: unknown,
        args: {
          relationType: string;
          from: { id?: string | null; type?: string | null; key?: string | null; value?: unknown };
          to: { id?: string | null; type?: string | null; key?: string | null; value?: unknown };
          properties?: Record<string, unknown> | null;
          validAt?: string | null;
        },
        ctx: ResolverContext,
      ) {
        const relationType = canonicalName(args.relationType);
        const asOf = ctx.asOf;
        const now = new Date().toISOString();

        const fromId = await resolveNodeRef(args.from, ctx, asOf);
        const toId = await resolveNodeRef(args.to, ctx, asOf);

        // Fetch both nodes to validate their types against the relation
        const fromNode = await ctx.graphDb.getNodeById(fromId, asOf);
        const toNode = await ctx.graphDb.getNodeById(toId, asOf);

        if (!fromNode) {
          throw new Error(`From-node "${fromId}" not found.`);
        }
        if (!toNode) {
          throw new Error(`To-node "${toId}" not found.`);
        }

        // Validate against ontology: relation must exist, types must match
        await validateEdgeAgainstOntology(relationType, fromNode.type, toNode.type);

        const edge = await ctx.graphDb.upsertEdge({
          relationType,
          fromId,
          toId,
          properties: args.properties ?? {},
          validAt: args.validAt ?? now,
        });
        return edge;
      },

      async invalidate(
        _root: unknown,
        args: { id: string; invalidAt?: string | null },
        ctx: ResolverContext,
      ) {
        const invalidAt = args.invalidAt ?? new Date().toISOString();
        const asOf = ctx.asOf;

        // Fetch the record to validate temporal window
        const node = await ctx.graphDb.getNodeById(args.id, asOf);
        if (node) {
          assertValidTemporalWindow(node.validAt, invalidAt);
        } else {
          // Might be an edge - check edges for this node
          // For now, we'll let the DB handle it; edges don't have a direct getById
        }

        return ctx.graphDb.invalidateRecord(args.id, invalidAt);
      },

      async defineList(
        _root: unknown,
        args: {
          name: string;
          description: string;
          targetType: string;
          filter: any;
          validAt?: string | null;
        },
        ctx: ResolverContext,
      ) {
        assertValidDescription(args.description);
        const now = new Date().toISOString();
        const def = await ctx.graphDb.upsertListDefinition({
          name: args.name,
          description: args.description,
          targetType: canonicalName(args.targetType),
          filter: args.filter,
          validAt: args.validAt ?? now,
        });
        return def;
      },

      async upsertType(
        _root: unknown,
        args: { name: string; description: string },
      ) {
        assertValidDescription(args.description);
        return upsertTypeDef(args.name, args.description);
      },

      async upsertRelation(
        _root: unknown,
        args: {
          name: string;
          description: string;
          sourceType: string;
          targetType: string;
        },
      ) {
        assertValidDescription(args.description);
        return upsertRelationTypeDef(
          args.name,
          args.description,
          args.sourceType,
          args.targetType,
        );
      },
    },

    Node: {
      __resolveType() {
        return 'GenericNode';
      },
    },

    GenericNode: {
      async relationships(
        root: any,
        args: { direction?: Direction; asOf?: string | null },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const direction = (args.direction ?? 'BOTH') as Direction;
        const edges = await ctx.graphDb.getEdgesForNode(root.id, direction, asOf);
        return edges.map((edge) => {
          // Compute actual direction relative to the queried node
          const isOutgoing = edge.fromId === root.id;
          return {
            id: edge.id,
            relationType: edge.relationType,
            direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
            otherNodeId: isOutgoing ? edge.toId : edge.fromId,
            validAt: edge.validAt,
            invalidAt: edge.invalidAt,
          };
        });
      },
    },

    GraphEdge: {
      async otherNode(
        root: { otherNodeId: string },
        _args: unknown,
        ctx: ResolverContext,
      ) {
        const node = await ctx.graphDb.getNodeById(root.otherNodeId, ctx.asOf);
        return node ? toGenericNode(node) : null;
      },
    },

    Edge: {
      async fromNode(
        root: { fromId: string },
        _args: unknown,
        ctx: ResolverContext,
      ) {
        const node = await ctx.graphDb.getNodeById(root.fromId, ctx.asOf);
        return node ? toGenericNode(node) : null;
      },
      async toNode(
        root: { toId: string },
        _args: unknown,
        ctx: ResolverContext,
      ) {
        const node = await ctx.graphDb.getNodeById(root.toId, ctx.asOf);
        return node ? toGenericNode(node) : null;
      },
    },
  };
}

function canonicalName(name: string): string {
  return name.trim().toUpperCase();
}

function assertValidDescription(description: string) {
  const value = description.trim();
  if (value.length < 10) {
    throw new Error(
      'Description must be at least 10 characters long for ontology elements and lists.',
    );
  }
  const upper = value.toUpperCase();
  if (upper.includes('TODO') || upper.includes('TBD')) {
    throw new Error('Description must not contain TODO or TBD placeholders.');
  }
}

/**
 * Validate that validAt < invalidAt when both are present.
 * This ensures temporal windows are logically valid.
 */
function assertValidTemporalWindow(
  validAt: string,
  invalidAt: string | null | undefined,
): void {
  if (invalidAt == null) return; // Open-ended window is always valid
  if (validAt >= invalidAt) {
    throw new Error(
      `Invalid temporal window: validAt (${validAt}) must be strictly before invalidAt (${invalidAt}).`,
    );
  }
}

/**
 * Validate that a node's type exists in the ontology and all its properties
 * are defined for that type.
 */
async function validateNodeAgainstOntology(
  type: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const typeDef = await getTypeByName(type);
  if (!typeDef) {
    throw new Error(
      `Type "${type}" is not defined in the ontology. Define it first with upsertType.`,
    );
  }

  const allowedProps = await getPropertiesForType(type);
  const allowedPropNames = new Set(allowedProps.map((p) => p.name.toLowerCase()));

  const providedKeys = Object.keys(properties);
  const unknownKeys = providedKeys.filter(
    (k) => !allowedPropNames.has(k.toLowerCase()),
  );

  if (unknownKeys.length > 0) {
    const allowed = allowedProps.map((p) => p.name).join(', ') || '(none)';
    throw new Error(
      `Unknown properties for type "${type}": ${unknownKeys.join(', ')}. ` +
        `Allowed properties: ${allowed}.`,
    );
  }
}

/**
 * Validate that an edge's relationType exists in the ontology and the
 * source/target node types match the relation's definition.
 */
async function validateEdgeAgainstOntology(
  relationType: string,
  fromNodeType: string,
  toNodeType: string,
): Promise<void> {
  const relationDef = await getRelationByName(relationType);
  if (!relationDef) {
    throw new Error(
      `RelationType "${relationType}" is not defined in the ontology. ` +
        `Define it first with upsertRelation.`,
    );
  }

  if (relationDef.sourceType !== fromNodeType) {
    throw new Error(
      `RelationType "${relationType}" expects source type "${relationDef.sourceType}", ` +
        `but the from-node is of type "${fromNodeType}".`,
    );
  }

  if (relationDef.targetType !== toNodeType) {
    throw new Error(
      `RelationType "${relationType}" expects target type "${relationDef.targetType}", ` +
        `but the to-node is of type "${toNodeType}".`,
    );
  }
}

async function filterNodesByDSL(
  nodes: StoredNode[],
  filter: FilterDSL,
  ctx: ResolverContext,
  asOf: string,
): Promise<StoredNode[]> {
  const result: StoredNode[] = [];
  for (const node of nodes) {
    if (await matchesFilter(node, filter, ctx, asOf)) {
      result.push(node);
    }
  }
  return result;
}

async function matchesFilter(
  node: StoredNode,
  filter: FilterDSL,
  ctx: ResolverContext,
  asOf: string,
): Promise<boolean> {
  const op = filter.operator;
  switch (op) {
    case 'AND':
      return Promise.all(
        (filter.operands ?? []).map((f) => matchesFilter(node, f, ctx, asOf)),
      ).then((vals) => vals.every(Boolean));
    case 'OR':
      return Promise.all(
        (filter.operands ?? []).map((f) => matchesFilter(node, f, ctx, asOf)),
      ).then((vals) => vals.some(Boolean));
    case 'NOT':
      return Promise.all(
        (filter.operands ?? []).map((f) => matchesFilter(node, f, ctx, asOf)),
      ).then((vals) => !vals.some(Boolean));
    case 'EQUALS': {
      if (!filter.field) return true;
      const v = node.properties[filter.field];
      return v === filter.value;
    }
    case 'GT': {
      if (!filter.field) return true;
      const v = node.properties[filter.field] as number | undefined;
      const target = filter.value as number | undefined;
      if (typeof v !== 'number' || typeof target !== 'number') return false;
      return v > target;
    }
    case 'LT': {
      if (!filter.field) return true;
      const v = node.properties[filter.field] as number | undefined;
      const target = filter.value as number | undefined;
      if (typeof v !== 'number' || typeof target !== 'number') return false;
      return v < target;
    }
    case 'CONTAINS': {
      if (!filter.field) return true;
      const v = node.properties[filter.field];
      if (Array.isArray(v)) {
        return v.includes(filter.value);
      }
      if (typeof v === 'string' && typeof filter.value === 'string') {
        return v.includes(filter.value);
      }
      return false;
    }
    case 'HAS_RELATION': {
      const relationType = canonicalName(filter.relationType ?? '');
      if (!relationType) return false;
      const edges = await ctx.graphDb.getEdgesForNode(node.id, 'BOTH', asOf);
      const matchingEdges = edges.filter(
        (edge) => edge.relationType === relationType,
      );
      if (matchingEdges.length === 0) return false;

      // If no targetFilter, just check if relationship exists
      if (!filter.targetFilter) return true;

      // Check if ANY of the related nodes match the targetFilter
      for (const edge of matchingEdges) {
        const otherNodeId =
          edge.fromId === node.id ? edge.toId : edge.fromId;
        const otherNode = await ctx.graphDb.getNodeById(otherNodeId, asOf);
        if (otherNode && (await matchesFilter(otherNode, filter.targetFilter, ctx, asOf))) {
          return true;
        }
      }
      return false;
    }
    default:
      return true;
  }
}

async function resolveNodeRef(
  ref: { id?: string | null; type?: string | null; key?: string | null; value?: unknown },
  ctx: ResolverContext,
  asOf: string,
): Promise<string> {
  if (ref.id) {
    return ref.id;
  }

  const type = ref.type ? canonicalName(ref.type) : null;
  const key = ref.key ?? null;
  const value = ref.value;

  if (!type || !key) {
    throw new Error(
      'NodeRefInput must include either id, or type + key + value.',
    );
  }

  const candidates = await ctx.graphDb.getNodesByType(type, asOf, 10_000);
  const matches = candidates.filter((n) => n.properties[key] === value);

  if (matches.length === 0) {
    throw new Error(
      `No node found for NodeRefInput (type=${type}, key=${key}).`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple nodes matched NodeRefInput (type=${type}, key=${key}); key must be unique.`,
    );
  }

  return matches[0].id;
}

function toGenericNode(node: {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  validAt: string;
  invalidAt: string | null;
}) {
  return {
    __typename: 'GenericNode',
    id: node.id,
    type: node.type,
    properties: node.properties,
    validAt: node.validAt,
    invalidAt: node.invalidAt,
  };
}



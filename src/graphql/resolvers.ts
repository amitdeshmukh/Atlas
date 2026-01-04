/**
 * GraphQL resolvers for Atlas.
 * These are thin wrappers around the WorldModel and StorageAdapter.
 */

import { GraphQLScalarType, Kind } from 'graphql';
import type { MercuriusContext } from 'mercurius';
import type { WorldModel } from '../core/worldModel.js';
import type { StorageAdapter } from '../adapters/types.js';
import type { Entity, Relationship, FilterDSL, Direction } from '../core/types.js';
import { canonicalName, validateDescription, validateTemporalWindow } from '../core/types.js';
import { matchesFilter, type FilterContext } from '../core/filterEvaluator.js';
import { embedText, cosineSimilarity } from '../embeddings/embeddingService.js';

/**
 * Context passed to all resolvers.
 */
export type ResolverContext = MercuriusContext & {
  asOf: string;
  worldModel: WorldModel;
  adapter: StorageAdapter;
};

/**
 * Build GraphQL resolvers using the WorldModel and StorageAdapter.
 */
export function buildResolvers(worldModel: WorldModel, adapter: StorageAdapter) {
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
      async ontologySummary(_root: unknown, _args: unknown, ctx: ResolverContext) {
        return ctx.worldModel.getOntologySummary();
      },

      async nodes(
        _root: unknown,
        args: { type: string; filter?: FilterDSL | null; asOf?: string; limit?: number },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const entities = await ctx.worldModel.findEntities(
          args.type,
          args.filter,
          asOf,
          args.limit ?? 100,
        );
        return entities.map(toGenericNode);
      },

      async node(
        _root: unknown,
        args: { id: string; asOf?: string },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const entity = await ctx.worldModel.getEntity(args.id, asOf);
        return entity ? toGenericNode(entity) : null;
      },

      async searchOntology(
        _root: unknown,
        args: { query: string; limit?: number; asOf?: string },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        return ctx.worldModel.searchConcepts(args.query, args.limit ?? 10, asOf);
      },

      async type(_root: unknown, args: { name: string }, ctx: ResolverContext) {
        const info = await ctx.worldModel.getTypeInfo(args.name);
        return info?.type ?? null;
      },

      async relation(_root: unknown, args: { name: string }, ctx: ResolverContext) {
        return ctx.worldModel.getRelationInfo(args.name);
      },

      async list(
        _root: unknown,
        args: { name: string; asOf?: string },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const def = await ctx.worldModel.getListDefinition(args.name, asOf);
        if (!def) return null;

        const members = await ctx.worldModel.getListMembers(args.name, asOf);
        return {
          name: def.name,
          description: def.description,
          definitionUsed: def.filter,
          members: members.map(toGenericNode),
        };
      },


      async findOntologyPath(
        _root: unknown,
        args: { fromType: string; toType: string; maxDepth?: number },
        ctx: ResolverContext,
      ) {
        const paths = await ctx.worldModel.findOntologyPaths(
          args.fromType,
          args.toType,
          args.maxDepth ?? 3,
        );
        return paths.map((path) => ({
          pathDescription: path.pathDescription,
          depth: path.depth,
          steps: path.steps.map((step) => ({
            relation: step.relation,
            direction: step.direction,
            targetTypeName: step.targetType,
          })),
        }));
      },

      async suggestType(
        _root: unknown,
        args: { description: string; limit?: number },
        ctx: ResolverContext,
      ) {
        const limit = args.limit ?? 3;
        const results = await ctx.worldModel.searchConcepts(args.description, limit);
        return results.types.map((hit) => ({
          type: hit.type,
          confidence: hit.score,
          reason: hit.matchReason ?? hit.type.description,
        }));
      },

      async searchRelationships(
        _root: unknown,
        args: { nodeId: string; query: string; asOf?: string; limit?: number },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const limit = args.limit ?? 10;
        const relationships = await ctx.worldModel.getRelationships(args.nodeId, 'BOTH', asOf);

        if (relationships.length === 0) return [];

        const queryEmbedding = await embedText(args.query);

        const scoredEdges = await Promise.all(
          relationships.map(async (edge) => {
            const otherNodeId = edge.direction === 'OUTGOING' ? edge.toId : edge.fromId;
            const otherNode = await ctx.worldModel.getEntity(otherNodeId, asOf);

            const otherNodeDesc = otherNode
              ? `${otherNode.type}: ${JSON.stringify(otherNode.properties)}`
              : '';
            const edgeText = `${edge.relationType} ${otherNodeDesc}`;

            const edgeEmbedding = await embedText(edgeText);
            const score = cosineSimilarity(queryEmbedding, edgeEmbedding);

            return {
              edge: {
                id: edge.id,
                relationType: edge.relationType,
                direction: edge.direction,
                otherNodeId,
                validAt: edge.validAt,
                invalidAt: edge.invalidAt,
              },
              score,
              matchReason: edgeText,
            };
          }),
        );

        scoredEdges.sort((a, b) => b.score - a.score);
        return scoredEdges.slice(0, limit);
      },

      async findInstancePath(
        _root: unknown,
        args: { fromNodeId: string; toNodeId: string; maxDepth?: number },
        ctx: ResolverContext,
      ) {
        const paths = await ctx.worldModel.findInstancePaths(
          args.fromNodeId,
          args.toNodeId,
          args.maxDepth ?? 3,
        );
        return paths.map((path) => ({
          pathDescription: path.pathDescription,
          depth: path.depth,
          edges: path.edges.map((e) => ({
            id: e.id,
            relationType: e.relationType,
            fromId: e.fromId,
            toId: e.toId,
          })),
        }));
      },
    },

    NodeType: {
      async properties(root: { name: string }, _args: unknown, ctx: ResolverContext) {
        return ctx.adapter.getPropertiesForType(root.name);
      },
      async outgoingRelations(root: { name: string }, _args: unknown, ctx: ResolverContext) {
        return ctx.adapter.getOutgoingRelationsForType(root.name);
      },
      async incomingRelations(root: { name: string }, _args: unknown, ctx: ResolverContext) {
        return ctx.adapter.getIncomingRelationsForType(root.name);
      },
    },

    RelationType: {
      async sourceType(root: { sourceType: string }, _args: unknown, ctx: ResolverContext) {
        return ctx.adapter.getTypeByName(root.sourceType);
      },
      async targetType(root: { targetType: string }, _args: unknown, ctx: ResolverContext) {
        return ctx.adapter.getTypeByName(root.targetType);
      },
    },

    OntologyPathStep: {
      async targetType(root: { targetTypeName: string }, _args: unknown, ctx: ResolverContext) {
        return ctx.adapter.getTypeByName(root.targetTypeName);
      },
    },

    TypeSuggestion: {
      async availableProperties(
        root: { type: { name: string } },
        _args: unknown,
        ctx: ResolverContext,
      ) {
        return ctx.adapter.getPropertiesForType(root.type.name);
      },
    },

    RelationshipSearchHit: {
      edge(root: any) {
        return root.edge;
      },
    },

    InstancePathEdge: {
      async fromNode(root: { fromId: string }, _args: unknown, ctx: ResolverContext) {
        const node = await ctx.worldModel.getEntity(root.fromId, ctx.asOf);
        return node ? toGenericNode(node) : null;
      },
      async toNode(root: { toId: string }, _args: unknown, ctx: ResolverContext) {
        const node = await ctx.worldModel.getEntity(root.toId, ctx.asOf);
        return node ? toGenericNode(node) : null;
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
        const validAt = args.validAt ?? ctx.asOf;

        if (args.id) {
          // Update existing node
          const entity = await ctx.worldModel.updateEntity(args.id, args.properties, validAt);
          return toGenericNode(entity);
        } else {
          // Create new node
          const entity = await ctx.worldModel.createEntity(args.type, args.properties, validAt);
          return toGenericNode(entity);
        }
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
        const validAt = args.validAt ?? new Date().toISOString();
        const edge = await ctx.worldModel.linkEntities(
          args.fromId,
          args.relationType,
          args.toId,
          args.properties ?? undefined,
          validAt,
        );
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
        const asOf = ctx.asOf;

        const fromId = await resolveNodeRef(args.from, ctx, asOf);
        const toId = await resolveNodeRef(args.to, ctx, asOf);

        const validAt = args.validAt ?? new Date().toISOString();
        const edge = await ctx.worldModel.linkEntities(
          fromId,
          args.relationType,
          toId,
          args.properties ?? undefined,
          validAt,
        );
        return edge;
      },

      async invalidate(
        _root: unknown,
        args: { id: string; invalidAt?: string | null },
        ctx: ResolverContext,
      ) {
        const invalidAt = args.invalidAt ?? new Date().toISOString();
        return ctx.worldModel.invalidate(args.id, invalidAt);
      },

      async defineList(
        _root: unknown,
        args: {
          name: string;
          description: string;
          targetType: string;
          filter: FilterDSL;
          validAt?: string | null;
        },
        ctx: ResolverContext,
      ) {
        const validAt = args.validAt ?? new Date().toISOString();
        return ctx.worldModel.defineList(
          args.name,
          args.description,
          args.targetType,
          args.filter,
          validAt,
        );
      },

      async upsertType(
        _root: unknown,
        args: { name: string; description: string },
        ctx: ResolverContext,
      ) {
        return ctx.worldModel.upsertType(args.name, args.description);
      },

      async upsertRelation(
        _root: unknown,
        args: {
          name: string;
          description: string;
          sourceType: string;
          targetType: string;
        },
        ctx: ResolverContext,
      ) {
        return ctx.worldModel.upsertRelationType(
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
        root: { id: string },
        args: { direction?: Direction; asOf?: string | null },
        ctx: ResolverContext,
      ) {
        const asOf = args.asOf ?? ctx.asOf;
        const direction = (args.direction ?? 'BOTH') as Direction;
        const edges = await ctx.adapter.getEdgesForNode(root.id, direction, asOf);

        return edges.map((edge) => ({
          id: edge.id,
          relationType: edge.relationType,
          direction: edge.fromId === root.id ? 'OUTGOING' : 'INCOMING',
          otherNodeId: edge.fromId === root.id ? edge.toId : edge.fromId,
          validAt: edge.validAt,
          invalidAt: edge.invalidAt,
        }));
      },
    },

    GraphEdge: {
      async otherNode(root: { otherNodeId: string }, _args: unknown, ctx: ResolverContext) {
        const node = await ctx.worldModel.getEntity(root.otherNodeId, ctx.asOf);
        return node ? toGenericNode(node) : null;
      },
    },

    Edge: {
      async fromNode(root: { fromId: string }, _args: unknown, ctx: ResolverContext) {
        const node = await ctx.worldModel.getEntity(root.fromId, ctx.asOf);
        return node ? toGenericNode(node) : null;
      },
      async toNode(root: { toId: string }, _args: unknown, ctx: ResolverContext) {
        const node = await ctx.worldModel.getEntity(root.toId, ctx.asOf);
        return node ? toGenericNode(node) : null;
      },
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

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
    throw new Error('NodeRefInput must include either id, or type + key + value.');
  }

  const candidates = await ctx.worldModel.findEntities(type, null, asOf, 10_000);
  const matches = candidates.filter((n) => n.properties[key] === value);

  if (matches.length === 0) {
    throw new Error(`No node found for NodeRefInput (type=${type}, key=${key}).`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple nodes matched NodeRefInput (type=${type}, key=${key}); key must be unique.`,
    );
  }

  return matches[0].id;
}

function toGenericNode(entity: Entity) {
  return {
    __typename: 'GenericNode',
    id: entity.id,
    type: entity.type,
    properties: entity.properties,
    validAt: entity.validAt,
    invalidAt: entity.invalidAt,
  };
}


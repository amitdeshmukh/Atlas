/**
 * MCP tool definitions for AxOntology.
 * Provides agent-friendly tools for discovering, querying, and mutating the world model.
 */

import type { FastMCP } from 'fastmcp';
import type { WorldModel } from '../core/worldModel.js';
import type { FilterDSL } from '../core/types.js';
import {
  SearchConceptsSchema,
  GetTypeInfoSchema,
  SuggestTypeSchema,
  FindEntitiesSchema,
  GetEntitySchema,
  GetRelationshipsSchema,
  FindPathSchema,
  CreateEntitySchema,
  LinkEntitiesSchema,
  DefineListSchema,
  GetListMembersSchema,
  GetFilterExamplesSchema,
} from './schemas.js';

/**
 * Register all tools with the FastMCP server.
 */
export function registerTools(server: FastMCP, worldModel: WorldModel): void {
  // Discovery Tools
  server.addTool({
    name: 'search_concepts',
    description:
      'Semantic search over the ontology - find types and relations by meaning. ' +
      'Use this to discover what kinds of entities exist (e.g., "people who work at companies").',
    parameters: SearchConceptsSchema,
    execute: async (args) => {
      const result = await worldModel.searchConcepts(args.query, args.limit);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_type_info',
    description:
      'Get detailed information about a specific type including its properties and relationships.',
    parameters: GetTypeInfoSchema,
    execute: async (args) => {
      const result = await worldModel.getTypeInfo(args.typeName);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'suggest_type',
    description:
      'Given a description of what you want to create, suggests the best matching type.',
    parameters: SuggestTypeSchema,
    execute: async (args) => {
      const results = await worldModel.searchConcepts(args.description, args.limit);
      const suggestions = results.types.map((hit) => ({
        type: hit.type,
        confidence: hit.score,
        reason: hit.matchReason ?? hit.type.description,
      }));
      return JSON.stringify(suggestions, null, 2);
    },
  });

  // Query Tools
  server.addTool({
    name: 'find_entities',
    description:
      'Find entities of a specific type, optionally filtered. ' +
      'See worldmodel://help/filter-examples for filter syntax.',
    parameters: FindEntitiesSchema,
    execute: async (args) => {
      const result = await worldModel.findEntities(
        args.type,
        (args.filter as FilterDSL) ?? null,
        undefined,
        args.limit,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_entity',
    description: 'Get a specific entity by its ID.',
    parameters: GetEntitySchema,
    execute: async (args) => {
      const result = await worldModel.getEntity(args.id);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_relationships',
    description: "Get all relationships for an entity. Returns the entity's connections.",
    parameters: GetRelationshipsSchema,
    execute: async (args) => {
      const result = await worldModel.getRelationships(args.entityId, args.direction);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'find_path',
    description:
      'Find how two entities are connected through the graph. ' +
      'Useful for questions like "How is Alice connected to Bob?"',
    parameters: FindPathSchema,
    execute: async (args) => {
      const result = await worldModel.findInstancePaths(
        args.fromId,
        args.toId,
        args.maxDepth,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // Mutation Tools
  server.addTool({
    name: 'create_entity',
    description:
      'Create a new entity in the world model. ' +
      'Use suggest_type first if unsure which type to use.',
    parameters: CreateEntitySchema,
    execute: async (args) => {
      const result = await worldModel.createEntity(args.type, args.properties);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'link_entities',
    description:
      'Create a relationship between two entities. ' +
      'Use search_concepts to discover valid relation types.',
    parameters: LinkEntitiesSchema,
    execute: async (args) => {
      const result = await worldModel.linkEntities(
        args.fromId,
        args.relationType,
        args.toId,
        args.properties,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // List Tools
  server.addTool({
    name: 'define_list',
    description:
      'Define a dynamic list (saved filter). ' +
      'Lists are predicates, not containers - membership is evaluated at query time.',
    parameters: DefineListSchema,
    execute: async (args) => {
      const result = await worldModel.defineList(
        args.name,
        args.description,
        args.targetType,
        args.filter as FilterDSL,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_list_members',
    description: 'Get all entities that match a defined list.',
    parameters: GetListMembersSchema,
    execute: async (args) => {
      const result = await worldModel.getListMembers(args.name);
      return JSON.stringify(result, null, 2);
    },
  });

  // Help Tool
  server.addTool({
    name: 'get_filter_examples',
    description:
      'Get examples of FilterDSL syntax for composing queries and list definitions.',
    parameters: GetFilterExamplesSchema,
    execute: async () => {
      return JSON.stringify(getFilterExamples(), null, 2);
    },
  });
}

/**
 * Helper function to generate filter examples for the help tool.
 */
function getFilterExamples() {
  return {
    description: 'FilterDSL examples for composing queries and list definitions',
    examples: [
      {
        name: 'Exact match',
        filter: { operator: 'EQUALS', field: 'email', value: 'alice@example.com' },
        description: 'Find entities where email equals exactly',
      },
      {
        name: 'Substring match',
        filter: { operator: 'CONTAINS', field: 'name', value: 'Tech' },
        description: 'Find entities where name contains "Tech"',
      },
      {
        name: 'Numeric comparison',
        filter: { operator: 'GT', field: 'revenue', value: 1000000 },
        description: 'Find entities where revenue > 1,000,000',
      },
      {
        name: 'Has relationship',
        filter: { operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' },
        description: 'Find entities that have an EMPLOYED_BY relationship',
      },
      {
        name: 'Relationship with target filter',
        filter: {
          operator: 'HAS_RELATION',
          relationType: 'EMPLOYED_BY',
          targetFilter: { operator: 'CONTAINS', field: 'name', value: 'Tech' },
        },
        description: 'Find people employed by companies with "Tech" in their name',
      },
      {
        name: 'Combine with AND',
        filter: {
          operator: 'AND',
          operands: [
            { operator: 'CONTAINS', field: 'name', value: 'Alice' },
            { operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' },
          ],
        },
        description: 'Find entities matching ALL conditions',
      },
      {
        name: 'Combine with OR',
        filter: {
          operator: 'OR',
          operands: [
            { operator: 'CONTAINS', field: 'name', value: 'Alice' },
            { operator: 'CONTAINS', field: 'name', value: 'Bob' },
          ],
        },
        description: 'Find entities matching ANY condition',
      },
      {
        name: 'Negate with NOT',
        filter: {
          operator: 'NOT',
          operands: [{ operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' }],
        },
        description: 'Find entities that do NOT have an EMPLOYED_BY relationship',
      },
      {
        name: 'Complex: Not employed at Tech companies',
        filter: {
          operator: 'NOT',
          operands: [
            {
              operator: 'HAS_RELATION',
              relationType: 'EMPLOYED_BY',
              targetFilter: { operator: 'CONTAINS', field: 'name', value: 'Tech' },
            },
          ],
        },
        description: 'Find people NOT employed by companies with "Tech" in name',
      },
    ],
  };
}


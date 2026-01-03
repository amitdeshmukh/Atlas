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
  GetRelationInfoSchema,
  GetOntologySummarySchema,
  SuggestTypeSchema,
  FindEntitiesSchema,
  GetEntitySchema,
  GetRelationshipsSchema,
  FindPathSchema,
  FindOntologyPathsSchema,
  CreateEntitySchema,
  UpdateEntitySchema,
  LinkEntitiesSchema,
  InvalidateRecordSchema,
  DefineListSchema,
  GetListMembersSchema,
  GetListDefinitionSchema,
  GetFilterExamplesSchema,
  CreateTypeSchema,
  CreateRelationTypeSchema,
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
    name: 'get_relation_info',
    description:
      'Get detailed information about a specific relation type including source and target types.',
    parameters: GetRelationInfoSchema,
    execute: async (args) => {
      const result = await worldModel.getRelationInfo(args.relationName);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_ontology_summary',
    description:
      'Get a summary of the ontology showing counts of types, relations, and lists. ' +
      'Useful for understanding the scope of the world model.',
    parameters: GetOntologySummarySchema,
    execute: async () => {
      const result = await worldModel.getOntologySummary();
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
      'The filter parameter must be a JSON object (not a string). ' +
      'Example filter: {"operator": "CONTAINS", "field": "NAME", "value": "Alice"}. ' +
      'See worldmodel://help/filter-examples for more syntax.',
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
    description:
      'Get DIRECT relationships for an entity (one hop only). ' +
      'For indirect connections through multiple entities, use find_path instead. ' +
      'Returns edges with temporal data (validAt/invalidAt) for historical analysis.',
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
      'IMPORTANT: Use this to discover indirect relationships! ' +
      'Direct relationships may not exist, but entities can be connected through intermediate nodes. ' +
      'Example: Person→Company→Product. Check temporal data on returned edges for historical accuracy.',
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

  server.addTool({
    name: 'find_ontology_paths',
    description:
      'Find how two types are connected in the ontology schema. ' +
      'Useful for understanding possible relationships between types ' +
      '(e.g., "How can PERSON connect to COMPANY?").',
    parameters: FindOntologyPathsSchema,
    execute: async (args) => {
      const result = await worldModel.findOntologyPaths(
        args.fromType,
        args.toType,
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
    name: 'update_entity',
    description:
      'Update an existing entity\'s properties. ' +
      'Properties are merged with existing values (partial update).',
    parameters: UpdateEntitySchema,
    execute: async (args) => {
      const result = await worldModel.updateEntity(args.id, args.properties);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'link_entities',
    description:
      'Create a relationship between two entities. ' +
      'Use search_concepts to discover valid relation types. ' +
      'Supports temporal validity windows via validAt/invalidAt for historical data.',
    parameters: LinkEntitiesSchema,
    execute: async (args) => {
      const result = await worldModel.linkEntities(
        args.fromId,
        args.relationType,
        args.toId,
        args.properties,
        args.validAt,
      );
      // If invalidAt is provided, immediately invalidate the relationship
      if (args.invalidAt) {
        await worldModel.invalidate(result.id, args.invalidAt);
        return JSON.stringify({ ...result, invalidAt: args.invalidAt }, null, 2);
      }
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'invalidate_record',
    description:
      'End the validity of an entity or relationship by setting its invalidAt timestamp. ' +
      'Use this to record when something stopped being true (e.g., person left company). ' +
      'Supports historical dates for backdating.',
    parameters: InvalidateRecordSchema,
    execute: async (args) => {
      const invalidAt = args.invalidAt ?? new Date().toISOString();
      const success = await worldModel.invalidate(args.id, invalidAt);
      return JSON.stringify({ success, id: args.id, invalidAt }, null, 2);
    },
  });

  // Ontology Mutation Tools
  server.addTool({
    name: 'create_type',
    description:
      'Create a new type in the ontology with optional properties. ' +
      'Use this to extend the schema with new entity types (e.g., PRODUCT, NEWS_ARTICLE). ' +
      'Types must have unique names in UPPER_SNAKE_CASE. ' +
      'Properties define what data entities of this type can store.',
    parameters: CreateTypeSchema,
    execute: async (args) => {
      const result = await worldModel.upsertType(
        args.name,
        args.description,
        args.properties,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'create_relation_type',
    description:
      'Create a new relation type in the ontology. Use this to define how types can connect ' +
      '(e.g., PRODUCT --MADE_BY--> COMPANY). Both source and target types must already exist.',
    parameters: CreateRelationTypeSchema,
    execute: async (args) => {
      const result = await worldModel.upsertRelationType(
        args.name,
        args.description,
        args.sourceType,
        args.targetType,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // List Tools
  server.addTool({
    name: 'define_list',
    description:
      'Define a dynamic list (saved filter). ' +
      'Lists are predicates, not containers - membership is evaluated at query time. ' +
      'The filter parameter must be a JSON object (not a string).',
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

  server.addTool({
    name: 'get_list_definition',
    description:
      'Get the definition of a list including its filter criteria. ' +
      'Useful for inspecting what a list is filtering on.',
    parameters: GetListDefinitionSchema,
    execute: async (args) => {
      const result = await worldModel.getListDefinition(args.name);
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
        name: 'Complex: Not employed at Google',
        filter: {
          operator: 'NOT',
          operands: [
            {
              operator: 'HAS_RELATION',
              relationType: 'EMPLOYED_BY',
              targetFilter: { operator: 'CONTAINS', field: 'name', value: 'Google' },
            },
          ],
        },
        description: 'Find people NOT employed by companies with "Google" in name',
      },
    ],
  };
}


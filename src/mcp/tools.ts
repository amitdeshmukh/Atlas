/**
 * MCP tool definitions for Atlas.
 * Provides agent-friendly tools for discovering, querying, and mutating the world model.
 *
 * Tool naming convention:
 * - *_ontology_* = operates on schema layer (types, relation types)
 * - *_instance_* = operates on data layer (actual nodes and edges)
 */

import type { FastMCP } from 'fastmcp';
import type { WorldModel } from '../core/worldModel.js';
import type { FilterDSL } from '../core/types.js';
import {
  // Ontology discovery
  SearchOntologySchema,
  GetOntologyTypeSchema,
  GetOntologyRelationSchema,
  FindOntologyPathsSchema,
  // Instance query
  FindInstancesSchema,
  GetInstanceSchema,
  GetInstanceEdgesSchema,
  FindInstancePathSchema,
  // Instance mutation
  CreateInstanceSchema,
  UpdateInstanceSchema,
  CreateEdgeSchema,
  InvalidateSchema,
  // Ontology mutation
  CreateOntologyTypeSchema,
  CreateOntologyRelationSchema,
  // Lists
  DefineListSchema,
  GetListMembersSchema,
  GetListDefinitionSchema,
  // Help
  GetFilterExamplesSchema,
} from './schemas.js';

/**
 * Register all tools with the FastMCP server.
 */
export function registerTools(server: FastMCP, worldModel: WorldModel): void {
  // ========================================
  // ONTOLOGY TOOLS (Schema Layer)
  // ========================================

  server.addTool({
    name: 'search_ontology',
    description:
      'Semantic search over the ONTOLOGY SCHEMA - find types and relation types by meaning. ' +
      'Use this to discover what kinds of entities CAN exist (e.g., "people who work at companies"). ' +
      'Returns type definitions and relation types, NOT actual data instances.',
    parameters: SearchOntologySchema,
    execute: async (args) => {
      const result = await worldModel.searchConcepts(args.query, args.limit);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_ontology_type',
    description:
      'Get details about a TYPE in the ontology schema. ' +
      'Returns the type definition including its properties and what relations it can have. ' +
      'Example: get_ontology_type("PERSON") returns properties like fullName, email, and relations like EMPLOYED_BY.',
    parameters: GetOntologyTypeSchema,
    execute: async (args) => {
      const result = await worldModel.getTypeInfo(args.typeName);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_ontology_relation',
    description:
      'Get details about a RELATION TYPE in the ontology schema. ' +
      'Returns the relation definition including which types it connects. ' +
      'Example: get_ontology_relation("EMPLOYED_BY") shows it goes from PERSON to COMPANY.',
    parameters: GetOntologyRelationSchema,
    execute: async (args) => {
      const result = await worldModel.getRelationInfo(args.relationName);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'find_ontology_paths',
    description:
      'Find how two TYPES can connect in the ontology schema. ' +
      'Use this to understand possible relationships between types BEFORE querying instances. ' +
      'Example: find_ontology_paths("PERSON", "PRODUCT") might show PERSON→COMPANY→PRODUCT.',
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

  // ========================================
  // INSTANCE TOOLS (Data Layer)
  // ========================================

  server.addTool({
    name: 'find_instances',
    description:
      'Find INSTANCES (actual data) of a given type with a REQUIRED filter. ' +
      'Filter is mandatory because types can have billions of instances (e.g., 8B+ PERSON records globally). ' +
      'Example: find_instances("PERSON", filter: {"operator": "CONTAINS", "field": "name", "value": "Tim"}) ' +
      'returns actual people like Tim Cook. Filter must be a JSON object, not a string.',
    parameters: FindInstancesSchema,
    execute: async (args) => {
      const result = await worldModel.findEntities(
        args.type,
        args.filter as FilterDSL,
        undefined,
        args.limit,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_instance',
    description:
      'Get a specific INSTANCE by its ID. ' +
      'Returns the full instance data including all properties and metadata.',
    parameters: GetInstanceSchema,
    execute: async (args) => {
      const result = await worldModel.getEntity(args.id);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_instance_edges',
    description:
      'Get DIRECT EDGES (one hop only) from an instance. ' +
      'For multi-hop connections between instances, use find_instance_path instead. ' +
      'Returns edges with temporal data (validAt/invalidAt) for historical analysis. ' +
      'By default returns ALL edges including historical ones.',
    parameters: GetInstanceEdgesSchema,
    execute: async (args) => {
      const result = await worldModel.getRelationships(
        args.instanceId, 
        args.direction, 
        undefined, // asOf
        args.includeHistorical,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'find_instance_path',
    description:
      'Find how two INSTANCES connect through the data graph. ' +
      'IMPORTANT: Use this to discover indirect connections! Direct edges may not exist, ' +
      'but instances can connect through intermediate nodes. ' +
      'Example: find_instance_path("tim_cook_id", "seattle_id") might show Tim→Apple→Seattle.',
    parameters: FindInstancePathSchema,
    execute: async (args) => {
      const result = await worldModel.findInstancePaths(
        args.fromId,
        args.toId,
        args.maxDepth,
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // ========================================
  // INSTANCE MUTATION TOOLS
  // ========================================

  server.addTool({
    name: 'create_instance',
    description:
      'Create a new INSTANCE in the data graph. ' +
      'Use search_ontology first to find the right type if unsure. ' +
      'Properties must match what the type definition allows.',
    parameters: CreateInstanceSchema,
    execute: async (args) => {
      const result = await worldModel.createEntity(args.type, args.properties);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'update_instance',
    description:
      'Update an existing INSTANCE\'s properties. ' +
      'Properties are merged with existing values (partial update).',
    parameters: UpdateInstanceSchema,
    execute: async (args) => {
      const result = await worldModel.updateEntity(args.id, args.properties);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'create_edge',
    description:
      'Create an EDGE (relationship) between two instances in the data graph. ' +
      'Use search_ontology to discover valid relation types. ' +
      'Supports temporal validity windows via validAt/invalidAt for historical data.',
    parameters: CreateEdgeSchema,
    execute: async (args) => {
      const result = await worldModel.linkEntities(
        args.fromId,
        args.relationType,
        args.toId,
        args.properties,
        args.validAt,
      );
      // If invalidAt is provided, immediately invalidate the edge
      if (args.invalidAt) {
        await worldModel.invalidate(result.id, args.invalidAt);
        return JSON.stringify({ ...result, invalidAt: args.invalidAt }, null, 2);
      }
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'invalidate',
    description:
      'End the validity of an INSTANCE or EDGE by setting its invalidAt timestamp. ' +
      'Use this to record when something stopped being true (e.g., person left company). ' +
      'This is a soft delete - the record remains for historical queries.',
    parameters: InvalidateSchema,
    execute: async (args) => {
      const invalidAt = args.invalidAt ?? new Date().toISOString();
      const success = await worldModel.invalidate(args.id, invalidAt);
      return JSON.stringify({ success, id: args.id, invalidAt }, null, 2);
    },
  });

  // ========================================
  // ONTOLOGY MUTATION TOOLS
  // ========================================

  server.addTool({
    name: 'create_ontology_type',
    description:
      'Create a new TYPE in the ontology schema. ' +
      'Use this to extend the schema with new entity types (e.g., PRODUCT, NEWS_ARTICLE). ' +
      'Types must have unique names in UPPER_SNAKE_CASE. ' +
      'Properties define what data instances of this type can store.',
    parameters: CreateOntologyTypeSchema,
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
    name: 'create_ontology_relation',
    description:
      'Create a new RELATION TYPE in the ontology schema. ' +
      'Defines how types can connect (e.g., PRODUCT --MADE_BY--> COMPANY). ' +
      'Both source and target types must already exist in the ontology.',
    parameters: CreateOntologyRelationSchema,
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

  // ========================================
  // LIST TOOLS
  // ========================================

  server.addTool({
    name: 'define_list',
    description:
      'Define a dynamic list (saved filter) that returns matching instances. ' +
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
    description: 
      'Get INSTANCES that match a defined list (up to limit). ' +
      'Lists can contain millions of members, so always use a reasonable limit.',
    parameters: GetListMembersSchema,
    execute: async (args) => {
      const result = await worldModel.getListMembers(args.name, undefined, args.limit);
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

  // ========================================
  // HELP TOOL
  // ========================================

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
        description: 'Find instances where email equals exactly',
      },
      {
        name: 'Substring match',
        filter: { operator: 'CONTAINS', field: 'name', value: 'Tech' },
        description: 'Find instances where name contains "Tech"',
      },
      {
        name: 'Numeric comparison',
        filter: { operator: 'GT', field: 'revenue', value: 1000000 },
        description: 'Find instances where revenue > 1,000,000',
      },
      {
        name: 'Has relationship',
        filter: { operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' },
        description: 'Find instances that have an EMPLOYED_BY edge',
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
        description: 'Find instances matching ALL conditions',
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
        description: 'Find instances matching ANY condition',
      },
      {
        name: 'Negate with NOT',
        filter: {
          operator: 'NOT',
          operands: [{ operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' }],
        },
        description: 'Find instances that do NOT have an EMPLOYED_BY edge',
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

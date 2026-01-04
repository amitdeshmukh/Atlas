/**
 * Zod schemas for MCP tool parameters.
 * Provides type-safe validation for all tool inputs.
 *
 * Naming convention:
 * - Ontology* = operates on schema layer (types, relation types)
 * - Instance* = operates on data layer (actual nodes and edges)
 */

import { z } from 'zod';

// === Recursive FilterDSL Schema ===
// FilterDSL is a recursive type, so we use z.lazy() to handle circular references
export const FilterDSLSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    operator: z.enum([
      'AND',
      'OR',
      'NOT',
      'EQUALS',
      'GT',
      'LT',
      'CONTAINS',
      'HAS_RELATION',
    ]),
    field: z.string().optional().nullable(),
    value: z.unknown().optional(),
    operands: z.array(FilterDSLSchema).optional().nullable(),
    relationType: z.string().optional().nullable(),
    targetFilter: FilterDSLSchema.optional().nullable(),
  }),
);

// === Ontology Discovery Tools (Schema Layer) ===

export const SearchOntologySchema = z.object({
  query: z
    .string()
    .describe('Natural language description of types or relations to find in the schema'),
  limit: z.number().default(10).describe('Maximum number of results (default: 10)'),
});

export const GetOntologyTypeSchema = z.object({
  typeName: z.string().describe('The name of the type in the ontology (e.g., "PERSON", "COMPANY")'),
});

export const GetOntologyRelationSchema = z.object({
  relationName: z.string().describe('The name of the relation type in the ontology (e.g., "EMPLOYED_BY")'),
});

export const FindOntologyPathsSchema = z.object({
  fromType: z.string().describe('Starting type name in the ontology (e.g., "PERSON")'),
  toType: z.string().describe('Target type name in the ontology (e.g., "COMPANY")'),
  maxDepth: z.number().default(3).describe('Maximum number of hops through relation types (default: 3)'),
});

// === Instance Query Tools (Data Layer) ===

export const FindInstancesSchema = z.object({
  type: z.string().describe('The type of instances to find (e.g., "PERSON")'),
  filter: FilterDSLSchema.describe(
    'REQUIRED FilterDSL object to filter results. ' +
      'A filter is mandatory because types can have billions of instances. ' +
      'IMPORTANT: Pass as a JSON object, NOT a string. ' +
      'Example: {"operator": "CONTAINS", "field": "name", "value": "Alice"}',
  ),
  limit: z.number().default(100).describe('Maximum number of results (default: 100, max recommended: 1000)'),
});

export const GetInstanceSchema = z.object({
  id: z.string().describe('The instance ID (e.g., "node:abc123")'),
});

export const GetInstanceEdgesSchema = z.object({
  instanceId: z.string().describe('The instance ID to get edges for'),
  direction: z
    .enum(['INCOMING', 'OUTGOING', 'BOTH'])
    .default('BOTH')
    .describe('Direction of edges to retrieve (default: BOTH)'),
  includeHistorical: z
    .boolean()
    .default(true)
    .describe('When true (default), returns ALL edges including past ones. When false, only returns currently active edges.'),
});

export const FindInstancePathSchema = z.object({
  fromId: z.string().describe('Starting instance ID'),
  toId: z.string().describe('Target instance ID'),
  maxDepth: z.number().default(3).describe('Maximum number of hops through edges (default: 3)'),
});

// === Instance Mutation Tools (Data Layer) ===

export const CreateInstanceSchema = z.object({
  type: z.string().describe('The type of instance to create (e.g., "PERSON")'),
  properties: z
    .record(z.string(), z.unknown())
    .describe('Properties for the instance (must match type definition in ontology)'),
});

export const UpdateInstanceSchema = z.object({
  id: z.string().describe('The instance ID to update'),
  properties: z
    .record(z.string(), z.unknown())
    .describe('Properties to update (merged with existing properties)'),
});

export const CreateEdgeSchema = z.object({
  fromId: z.string().describe('Source instance ID'),
  relationType: z.string().describe('Relation type from the ontology (e.g., "EMPLOYED_BY")'),
  toId: z.string().describe('Target instance ID'),
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional properties for the edge'),
  validAt: z
    .string()
    .optional()
    .describe('ISO timestamp when this edge became valid (default: now)'),
  invalidAt: z
    .string()
    .optional()
    .describe('ISO timestamp when this edge ended (default: null = still active)'),
});

export const InvalidateSchema = z.object({
  id: z.string().describe('ID of the instance or edge to invalidate'),
  invalidAt: z
    .string()
    .optional()
    .describe('ISO timestamp when the record became invalid (default: now)'),
});

// === Ontology Mutation Tools (Schema Layer) ===

export const PropertyDefSchema = z.object({
  name: z.string().describe('Property name in camelCase (e.g., "name", "releaseDate", "emailAddress")'),
  description: z.string().describe('Human-readable description of the property'),
  dataType: z
    .enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE'])
    .describe('Data type of the property'),
});

export const CreateOntologyTypeSchema = z.object({
  name: z.string().describe('Name of the type in UPPER_SNAKE_CASE (e.g., "PRODUCT", "NEWS_ARTICLE")'),
  description: z
    .string()
    .min(10)
    .describe('Human-readable description of the type (min 10 chars)'),
  properties: z
    .array(PropertyDefSchema)
    .optional()
    .describe('Optional array of property definitions for this type'),
});

export const CreateOntologyRelationSchema = z.object({
  name: z
    .string()
    .describe('Name of the relation in UPPER_SNAKE_CASE (e.g., "MADE_BY", "ANNOUNCED_AT")'),
  description: z
    .string()
    .min(10)
    .describe('Human-readable description of the relation (min 10 chars)'),
  sourceType: z.string().describe('The source type in the ontology (e.g., "PRODUCT")'),
  targetType: z.string().describe('The target type in the ontology (e.g., "COMPANY")'),
});

// === List Tools ===

export const DefineListSchema = z.object({
  name: z.string().describe('Unique name for the list'),
  description: z.string().min(10).describe('Human-readable description (min 10 chars)'),
  targetType: z.string().describe('The type of instances this list contains'),
  filter: FilterDSLSchema.describe(
    'FilterDSL object defining list membership. ' +
      'IMPORTANT: Pass as a JSON object, NOT a string. ' +
      'Example: {"operator": "HAS_RELATION", "relationType": "EMPLOYED_BY"}',
  ),
});

export const GetListMembersSchema = z.object({
  name: z.string().describe('Name of the list to evaluate'),
});

export const GetListDefinitionSchema = z.object({
  name: z.string().describe('Name of the list to retrieve'),
});

// === Help Tool ===

export const GetFilterExamplesSchema = z.object({
  // No parameters required
});

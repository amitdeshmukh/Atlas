/**
 * Zod schemas for MCP tool parameters.
 * Provides type-safe validation for all tool inputs.
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

// === Discovery Tools ===

export const SearchConceptsSchema = z.object({
  query: z
    .string()
    .describe('Natural language description of what you are looking for'),
  limit: z.number().default(10).describe('Maximum number of results (default: 10)'),
});

export const GetTypeInfoSchema = z.object({
  typeName: z.string().describe('The name of the type (e.g., "PERSON", "COMPANY")'),
});

export const GetRelationInfoSchema = z.object({
  relationName: z.string().describe('The name of the relation (e.g., "EMPLOYED_BY")'),
});

export const GetOntologySummarySchema = z.object({
  // No parameters required
});

export const SuggestTypeSchema = z.object({
  description: z.string().describe('Description of the entity you want to create'),
  limit: z.number().default(3).describe('Number of suggestions (default: 3)'),
});

// === Query Tools ===

export const FindEntitiesSchema = z.object({
  type: z.string().describe('The type of entities to find (e.g., "PERSON")'),
  filter: FilterDSLSchema.optional().describe(
    'Optional FilterDSL object to filter results. ' +
      'IMPORTANT: Pass as a JSON object, NOT a string. ' +
      'Example: {"operator": "CONTAINS", "field": "NAME", "value": "Alice"}',
  ),
  limit: z.number().default(100).describe('Maximum number of results (default: 100)'),
});

export const GetEntitySchema = z.object({
  id: z.string().describe('The entity ID (e.g., "node:abc123")'),
});

export const GetRelationshipsSchema = z.object({
  entityId: z.string().describe('The entity ID'),
  direction: z
    .enum(['INCOMING', 'OUTGOING', 'BOTH'])
    .default('BOTH')
    .describe('Direction of relationships (default: BOTH)'),
});

export const FindPathSchema = z.object({
  fromId: z.string().describe('Starting entity ID'),
  toId: z.string().describe('Target entity ID'),
  maxDepth: z.number().default(3).describe('Maximum number of hops (default: 3)'),
});

export const FindOntologyPathsSchema = z.object({
  fromType: z.string().describe('Starting type name (e.g., "PERSON")'),
  toType: z.string().describe('Target type name (e.g., "COMPANY")'),
  maxDepth: z.number().default(3).describe('Maximum number of hops (default: 3)'),
});

// === Mutation Tools ===

export const CreateEntitySchema = z.object({
  type: z.string().describe('The type of entity (e.g., "PERSON")'),
  properties: z
    .record(z.string(), z.unknown())
    .describe('Properties for the entity (must match type definition)'),
});

export const UpdateEntitySchema = z.object({
  id: z.string().describe('The entity ID to update'),
  properties: z
    .record(z.string(), z.unknown())
    .describe('Properties to update (merged with existing properties)'),
});

export const LinkEntitiesSchema = z.object({
  fromId: z.string().describe('Source entity ID'),
  relationType: z.string().describe('Type of relationship (e.g., "EMPLOYED_BY")'),
  toId: z.string().describe('Target entity ID'),
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional properties for the relationship'),
  validAt: z
    .string()
    .optional()
    .describe('ISO timestamp when this relationship became valid (default: now)'),
  invalidAt: z
    .string()
    .optional()
    .describe('ISO timestamp when this relationship ended (default: null = still active)'),
});

// === List Tools ===

export const DefineListSchema = z.object({
  name: z.string().describe('Unique name for the list'),
  description: z.string().min(10).describe('Human-readable description (min 10 chars)'),
  targetType: z.string().describe('The type of entities this list contains'),
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

// === Temporal Tools ===

export const InvalidateRecordSchema = z.object({
  id: z.string().describe('ID of the entity or relationship to invalidate'),
  invalidAt: z
    .string()
    .optional()
    .describe('ISO timestamp when the record became invalid (default: now)'),
});

// === Ontology Mutation Tools ===

export const PropertyDefSchema = z.object({
  name: z.string().describe('Property name in UPPER_SNAKE_CASE (e.g., "NAME", "RELEASE_DATE")'),
  description: z.string().describe('Human-readable description of the property'),
  dataType: z
    .enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE'])
    .describe('Data type of the property'),
});

export const CreateTypeSchema = z.object({
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

export const CreateRelationTypeSchema = z.object({
  name: z
    .string()
    .describe('Name of the relation in UPPER_SNAKE_CASE (e.g., "MADE_BY", "ANNOUNCED_AT")'),
  description: z
    .string()
    .min(10)
    .describe('Human-readable description of the relation (min 10 chars)'),
  sourceType: z.string().describe('The type that this relation originates from (e.g., "PRODUCT")'),
  targetType: z.string().describe('The type that this relation points to (e.g., "COMPANY")'),
});

// === Help Tool ===

export const GetFilterExamplesSchema = z.object({
  // No parameters required
});

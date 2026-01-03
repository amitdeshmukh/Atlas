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

export const SuggestTypeSchema = z.object({
  description: z.string().describe('Description of the entity you want to create'),
  limit: z.number().default(3).describe('Number of suggestions (default: 3)'),
});

// === Query Tools ===

export const FindEntitiesSchema = z.object({
  type: z.string().describe('The type of entities to find (e.g., "PERSON")'),
  filter: FilterDSLSchema.optional().describe('Optional FilterDSL object to filter results'),
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

// === Mutation Tools ===

export const CreateEntitySchema = z.object({
  type: z.string().describe('The type of entity (e.g., "PERSON")'),
  properties: z
    .record(z.string(), z.unknown())
    .describe('Properties for the entity (must match type definition)'),
});

export const LinkEntitiesSchema = z.object({
  fromId: z.string().describe('Source entity ID'),
  relationType: z.string().describe('Type of relationship (e.g., "EMPLOYED_BY")'),
  toId: z.string().describe('Target entity ID'),
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional properties for the relationship'),
});

// === List Tools ===

export const DefineListSchema = z.object({
  name: z.string().describe('Unique name for the list'),
  description: z.string().min(10).describe('Human-readable description (min 10 chars)'),
  targetType: z.string().describe('The type of entities this list contains'),
  filter: FilterDSLSchema.describe('FilterDSL defining list membership'),
});

export const GetListMembersSchema = z.object({
  name: z.string().describe('Name of the list to evaluate'),
});

// === Help Tool ===

export const GetFilterExamplesSchema = z.object({
  // No parameters required
});

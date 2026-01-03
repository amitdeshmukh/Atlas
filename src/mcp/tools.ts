/**
 * MCP tool definitions for AxOntology.
 * Provides agent-friendly tools for discovering, querying, and mutating the world model.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { WorldModel } from '../core/worldModel.js';
import type { FilterDSL } from '../core/types.js';

/**
 * Register all available tools.
 */
export function registerTools(): Tool[] {
  return [
    // Discovery Tools
    {
      name: 'search_concepts',
      description:
        'Semantic search over the ontology - find types and relations by meaning. ' +
        'Use this to discover what kinds of entities exist (e.g., "people who work at companies").',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language description of what you are looking for',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 10)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_type_info',
      description:
        'Get detailed information about a specific type including its properties and relationships.',
      inputSchema: {
        type: 'object',
        properties: {
          typeName: {
            type: 'string',
            description: 'The name of the type (e.g., "PERSON", "COMPANY")',
          },
        },
        required: ['typeName'],
      },
    },
    {
      name: 'suggest_type',
      description:
        'Given a description of what you want to create, suggests the best matching type.',
      inputSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Description of the entity you want to create',
          },
          limit: {
            type: 'number',
            description: 'Number of suggestions (default: 3)',
            default: 3,
          },
        },
        required: ['description'],
      },
    },

    // Query Tools
    {
      name: 'find_entities',
      description:
        'Find entities of a specific type, optionally filtered. ' +
        'See worldmodel://help/filter-examples for filter syntax.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'The type of entities to find (e.g., "PERSON")',
          },
          filter: {
            type: 'object',
            description: 'Optional FilterDSL object to filter results',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 100)',
            default: 100,
          },
        },
        required: ['type'],
      },
    },
    {
      name: 'get_entity',
      description: 'Get a specific entity by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The entity ID (e.g., "node:abc123")',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'get_relationships',
      description: "Get all relationships for an entity. Returns the entity's connections.",
      inputSchema: {
        type: 'object',
        properties: {
          entityId: {
            type: 'string',
            description: 'The entity ID',
          },
          direction: {
            type: 'string',
            enum: ['INCOMING', 'OUTGOING', 'BOTH'],
            description: 'Direction of relationships (default: BOTH)',
            default: 'BOTH',
          },
        },
        required: ['entityId'],
      },
    },
    {
      name: 'find_path',
      description:
        'Find how two entities are connected through the graph. ' +
        'Useful for questions like "How is Alice connected to Bob?"',
      inputSchema: {
        type: 'object',
        properties: {
          fromId: {
            type: 'string',
            description: 'Starting entity ID',
          },
          toId: {
            type: 'string',
            description: 'Target entity ID',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum number of hops (default: 3)',
            default: 3,
          },
        },
        required: ['fromId', 'toId'],
      },
    },

    // Mutation Tools
    {
      name: 'create_entity',
      description:
        'Create a new entity in the world model. ' +
        'Use suggest_type first if unsure which type to use.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'The type of entity (e.g., "PERSON")',
          },
          properties: {
            type: 'object',
            description: 'Properties for the entity (must match type definition)',
          },
        },
        required: ['type', 'properties'],
      },
    },
    {
      name: 'link_entities',
      description:
        'Create a relationship between two entities. ' +
        'Use search_concepts to discover valid relation types.',
      inputSchema: {
        type: 'object',
        properties: {
          fromId: {
            type: 'string',
            description: 'Source entity ID',
          },
          relationType: {
            type: 'string',
            description: 'Type of relationship (e.g., "EMPLOYED_BY")',
          },
          toId: {
            type: 'string',
            description: 'Target entity ID',
          },
          properties: {
            type: 'object',
            description: 'Optional properties for the relationship',
          },
        },
        required: ['fromId', 'relationType', 'toId'],
      },
    },

    // List Tools
    {
      name: 'define_list',
      description:
        'Define a dynamic list (saved filter). ' +
        'Lists are predicates, not containers - membership is evaluated at query time.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Unique name for the list',
          },
          description: {
            type: 'string',
            description: 'Human-readable description (min 10 chars)',
          },
          targetType: {
            type: 'string',
            description: 'The type of entities this list contains',
          },
          filter: {
            type: 'object',
            description: 'FilterDSL defining list membership',
          },
        },
        required: ['name', 'description', 'targetType', 'filter'],
      },
    },
    {
      name: 'get_list_members',
      description: 'Get all entities that match a defined list.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the list to evaluate',
          },
        },
        required: ['name'],
      },
    },

    // Help Tool
    {
      name: 'get_filter_examples',
      description:
        'Get examples of FilterDSL syntax for composing queries and list definitions.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

/**
 * Handle a tool call.
 */
export async function handleToolCall(
  worldModel: WorldModel,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const result = await executeToolCall(worldModel, toolName, args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
}

async function executeToolCall(
  worldModel: WorldModel,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    // Discovery
    case 'search_concepts':
      return worldModel.searchConcepts(
        args.query as string,
        (args.limit as number) ?? 10,
      );

    case 'get_type_info':
      return worldModel.getTypeInfo(args.typeName as string);

    case 'suggest_type': {
      const results = await worldModel.searchConcepts(
        args.description as string,
        (args.limit as number) ?? 3,
      );
      return results.types.map((hit) => ({
        type: hit.type,
        confidence: hit.score,
        reason: hit.matchReason ?? hit.type.description,
      }));
    }

    // Query
    case 'find_entities':
      return worldModel.findEntities(
        args.type as string,
        args.filter as FilterDSL | null,
        undefined,
        (args.limit as number) ?? 100,
      );

    case 'get_entity':
      return worldModel.getEntity(args.id as string);

    case 'get_relationships':
      return worldModel.getRelationships(
        args.entityId as string,
        (args.direction as 'INCOMING' | 'OUTGOING' | 'BOTH') ?? 'BOTH',
      );

    case 'find_path':
      return worldModel.findInstancePaths(
        args.fromId as string,
        args.toId as string,
        (args.maxDepth as number) ?? 3,
      );

    // Mutation
    case 'create_entity':
      return worldModel.createEntity(
        args.type as string,
        args.properties as Record<string, unknown>,
      );

    case 'link_entities':
      return worldModel.linkEntities(
        args.fromId as string,
        args.relationType as string,
        args.toId as string,
        args.properties as Record<string, unknown> | undefined,
      );

    // Lists
    case 'define_list':
      return worldModel.defineList(
        args.name as string,
        args.description as string,
        args.targetType as string,
        args.filter as FilterDSL,
      );

    case 'get_list_members':
      return worldModel.getListMembers(args.name as string);

    // Help
    case 'get_filter_examples':
      return getFilterExamples();

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

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


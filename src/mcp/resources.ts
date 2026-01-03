/**
 * MCP resource definitions for AxOntology.
 * Provides browseable resources for agents to discover the world model.
 */

import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import type { WorldModel } from '../core/worldModel.js';

/**
 * Register available resources.
 */
export async function registerResources(worldModel: WorldModel): Promise<Resource[]> {
  const summary = await worldModel.getOntologySummary();

  return [
    {
      uri: 'worldmodel://ontology/summary',
      name: 'Ontology Summary',
      description: `Overview of the world model (${summary.typeCount} types, ${summary.relationCount} relations, ${summary.listCount} lists)`,
      mimeType: 'application/json',
    },
    {
      uri: 'worldmodel://help/filter-examples',
      name: 'FilterDSL Examples',
      description:
        'Examples of FilterDSL syntax for composing queries. Essential cheat sheet for agents.',
      mimeType: 'application/json',
    },
    {
      uri: 'worldmodel://help/getting-started',
      name: 'Getting Started Guide',
      description: 'Quick start guide for interacting with the world model',
      mimeType: 'text/markdown',
    },
  ];
}

/**
 * Handle resource read request.
 */
export async function handleResourceRead(
  worldModel: WorldModel,
  uri: string,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  switch (uri) {
    case 'worldmodel://ontology/summary':
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: await getOntologySummaryContent(worldModel),
          },
        ],
      };

    case 'worldmodel://help/filter-examples':
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: getFilterExamplesContent(),
          },
        ],
      };

    case 'worldmodel://help/getting-started':
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: getGettingStartedContent(),
          },
        ],
      };

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

async function getOntologySummaryContent(worldModel: WorldModel): Promise<string> {
  const summary = await worldModel.getOntologySummary();

  return JSON.stringify(
    {
      description: 'World model ontology summary',
      counts: {
        types: summary.typeCount,
        relations: summary.relationCount,
        lists: summary.listCount,
      },
      tips: [
        'Use search_concepts to discover types and relations by meaning',
        'Use get_type_info to see properties and relationships for a type',
        'Use suggest_type when creating new entities if unsure of the type',
      ],
    },
    null,
    2,
  );
}

function getFilterExamplesContent(): string {
  return JSON.stringify(
    {
      description: 'FilterDSL cheat sheet for composing queries and list definitions',
      operators: {
        EQUALS: 'Exact field match',
        CONTAINS: 'Substring (string) or element (array) match',
        GT: 'Greater than (numeric)',
        LT: 'Less than (numeric)',
        AND: 'All operands must match',
        OR: 'At least one operand must match',
        NOT: 'Negate the operands',
        HAS_RELATION: 'Entity has a relationship of the specified type',
      },
      examples: [
        {
          name: 'Exact match',
          query: { operator: 'EQUALS', field: 'email', value: 'alice@example.com' },
        },
        {
          name: 'Substring match',
          query: { operator: 'CONTAINS', field: 'name', value: 'Tech' },
        },
        {
          name: 'Numeric comparison',
          query: { operator: 'GT', field: 'revenue', value: 1000000 },
        },
        {
          name: 'Has any EMPLOYED_BY relationship',
          query: { operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' },
        },
        {
          name: 'Employed at company with "Tech" in name',
          query: {
            operator: 'HAS_RELATION',
            relationType: 'EMPLOYED_BY',
            targetFilter: { operator: 'CONTAINS', field: 'name', value: 'Tech' },
          },
        },
        {
          name: 'NOT employed (no EMPLOYED_BY relationship)',
          query: {
            operator: 'NOT',
            operands: [{ operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' }],
          },
        },
        {
          name: 'Name contains Alice AND is employed',
          query: {
            operator: 'AND',
            operands: [
              { operator: 'CONTAINS', field: 'name', value: 'Alice' },
              { operator: 'HAS_RELATION', relationType: 'EMPLOYED_BY' },
            ],
          },
        },
      ],
    },
    null,
    2,
  );
}

function getGettingStartedContent(): string {
  return `# World Model - Getting Started

## Overview

The world model is a temporal graph database with:
- **Types**: Define what kinds of entities exist (PERSON, COMPANY, etc.)
- **Entities**: Actual instances (Alice, TechCorp)
- **Relationships**: Connections between entities (Alice EMPLOYED_BY TechCorp)
- **Lists**: Dynamic queries saved as predicates

## Recommended Workflow

### 1. Discover What Exists

Start by searching the ontology to understand what's in the world model:

\`\`\`
search_concepts("people who work at companies")
\`\`\`

This returns types and relations matching your intent.

### 2. Explore a Type

Get details about a specific type:

\`\`\`
get_type_info("PERSON")
\`\`\`

Returns properties, outgoing relations, and incoming relations.

### 3. Find Entities

Query for specific entities:

\`\`\`
find_entities("PERSON", filter: { operator: "CONTAINS", field: "name", value: "Alice" })
\`\`\`

### 4. Explore Connections

Get relationships for an entity:

\`\`\`
get_relationships("node:abc123")
\`\`\`

### 5. Create New Data

Create entities and link them:

\`\`\`
create_entity("PERSON", { fullName: "Bob Smith", email: "bob@example.com" })
link_entities("node:bob", "EMPLOYED_BY", "node:techcorp")
\`\`\`

## FilterDSL Tips

Filters compose naturally:
- Use AND/OR/NOT for logic
- Use HAS_RELATION to filter by connections
- Add targetFilter to filter the related entity

See \`worldmodel://help/filter-examples\` for a complete cheat sheet.

## Lists

Lists are saved filters that evaluate at query time:

\`\`\`
define_list(
  name: "TECH_EMPLOYEES",
  description: "People employed at tech companies",
  targetType: "PERSON",
  filter: {
    operator: "HAS_RELATION",
    relationType: "EMPLOYED_BY",
    targetFilter: { operator: "CONTAINS", field: "name", value: "Tech" }
  }
)
\`\`\`

Then query members:

\`\`\`
get_list_members("TECH_EMPLOYEES")
\`\`\`
`;
}


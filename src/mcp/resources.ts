/**
 * MCP resource definitions for AxOntology.
 * Provides browseable resources for agents to discover the world model.
 */

import type { FastMCP } from 'fastmcp';
import type { WorldModel } from '../core/worldModel.js';

/**
 * Register all resources with the FastMCP server.
 */
export function registerResources(server: FastMCP, worldModel: WorldModel): void {
  // Ontology Summary
  server.addResource({
    uri: 'worldmodel://ontology/summary',
    name: 'Ontology Summary',
    mimeType: 'application/json',
    async load() {
      const summary = await worldModel.getOntologySummary();
      return {
        text: JSON.stringify(
          {
            description: 'World model ontology summary',
            counts: {
              types: summary.typeCount,
              relations: summary.relationCount,
              lists: summary.listCount,
            },
            tips: [
              'Use search_concepts to discover types and relations by meaning',
              'Use get_type_info or get_relation_info to see details about schema elements',
              'Use get_ontology_summary to understand the scope of the world model',
              'Use suggest_type when creating new entities if unsure of the type',
              'Use create_type and create_relation_type to extend the ontology dynamically',
            ],
          },
          null,
          2,
        ),
      };
    },
  });

  // Filter Examples
  server.addResource({
    uri: 'worldmodel://help/filter-examples',
    name: 'FilterDSL Examples',
    mimeType: 'application/json',
    async load() {
      return { text: getFilterExamplesContent() };
    },
  });

  // Getting Started Guide
  server.addResource({
    uri: 'worldmodel://help/getting-started',
    name: 'Getting Started Guide',
    mimeType: 'text/markdown',
    async load() {
      return { text: getGettingStartedContent() };
    },
  });
}

/**
 * Helper function to generate filter examples content.
 */
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

/**
 * Helper function to generate getting started guide content.
 */
function getGettingStartedContent(): string {
  return `# World Model - Getting Started

## What This Is

This is a **world model** - a shared knowledge base designed for AI agents like you to:
- **Reference**: Query existing knowledge about entities, relationships, and structures
- **Use**: Store new information, create connections, and build understanding over time
- **Explore**: Discover what exists through semantic search and graph traversal

Think of it as your **persistent memory and knowledge graph**, accessible through MCP tools.

## Core Components

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

### 2. Explore Types and Relations

Get details about a specific type or relation:

\`\`\`
get_type_info("PERSON")
get_relation_info("EMPLOYED_BY")
get_ontology_summary()  // See counts of types, relations, lists
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

Update an existing entity:

\`\`\`
update_entity("node:bob", { email: "bob.smith@example.com" })
\`\`\`

### 6. Extend the Ontology

Create new types with properties:

\`\`\`
create_type("PRODUCT", "A product manufactured by a company", properties: [
  { name: "NAME", description: "Product name", dataType: "STRING" },
  { name: "CATEGORY", description: "Product category", dataType: "STRING" },
  { name: "RELEASE_DATE", description: "Release date", dataType: "DATE" }
])
\`\`\`

Create relations between types:

\`\`\`
create_relation_type("MADE_BY", "Product manufactured by company", "PRODUCT", "COMPANY")
\`\`\`

Find how types connect:

\`\`\`
find_ontology_paths("PRODUCT", "PERSON")
\`\`\`

### 7. Temporal Data (Historical Records)

All data in the world model is temporal. Relationships support validity windows:

\`\`\`
// Create a relationship that started in the past
link_entities("node:alice", "CFO_OF", "node:techcorp", validAt: "2020-01-15T00:00:00Z")

// Create a relationship with a known end date (e.g., person stepped down)
link_entities("node:alice", "CFO_OF", "node:techcorp", 
  validAt: "2020-01-15T00:00:00Z",
  invalidAt: "2024-12-31T00:00:00Z"
)

// End an existing relationship at a specific date
invalidate_record("CFO_OF:abc123", invalidAt: "2024-12-31T00:00:00Z")
\`\`\`

Use temporal validity windows instead of creating "former_" relationship types.

## FilterDSL Tips

**IMPORTANT**: Filters must be passed as JSON objects, not strings!

\`\`\`
// CORRECT - filter as object:
find_entities("PERSON", filter: { operator: "CONTAINS", field: "FULLNAME", value: "Alice" })

// WRONG - filter as string (will fail validation):
find_entities("PERSON", filter: "{\\"operator\\": \\"CONTAINS\\", ...}")
\`\`\`

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

Then query members or inspect the definition:

\`\`\`
get_list_members("TECH_EMPLOYEES")
get_list_definition("TECH_EMPLOYEES")  // See the filter criteria
\`\`\`

## Best Practices for Agents

### Use This as Your Knowledge Base
- Store information you learn about entities and their relationships
- Query before creating to avoid duplicates (use find_entities first)
- Build upon existing structures rather than creating parallel ones

### Semantic Discovery First
- Always start with \`search_concepts\` to discover existing types and relations
- Use \`suggest_type\` when unsure which entity type to use
- Respect the existing ontology and extend it thoughtfully

### Think Temporally
- Use \`validAt\` and \`invalidAt\` for historical accuracy
- Don't create "former_X" relationships - use temporal validity instead
- Query with \`asOf\` parameters to understand state at specific times

### Prefer Lists Over Hardcoded Sets
- Define dynamic lists with filters rather than maintaining static ID collections
- Lists automatically stay up-to-date as the graph changes
- Use descriptive names and clear filter logic for maintainability
`;
}


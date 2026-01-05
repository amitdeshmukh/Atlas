/**
 * MCP resource definitions for Atlas.
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
              'Use search_ontology to discover types and relations by meaning',
              'Use get_ontology_type or get_ontology_relation to see details about schema elements',
              'Use find_ontology_paths to see how types CAN connect',
              'Use find_instances to query actual data, then discover_connection for connections',
              'Use create_ontology_type and create_ontology_relation to extend the schema',
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
        HAS_RELATION: 'Instance has an edge of the specified type',
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
          name: 'Has any EMPLOYED_BY edge',
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
          name: 'NOT employed (no EMPLOYED_BY edge)',
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
  return `# Atlas World Model - Getting Started

## Overview

Atlas is a **dynamic world model for multi-agent collaboration**. Agents can simultaneously explore, update, and reason over shared temporal and spatial knowledge. Each agent contributes discoveries while benefiting from the collective intelligence of all agents working in the system.

## Multi-Agent Collaboration

Atlas supports **multiple agents operating simultaneously**:
- **Concurrent updates**: Agents can write in parallel without conflicts
- **Shared discoveries**: Knowledge added by one agent is immediately available to all others
- **Temporal consistency**: The \`validAt\`/\`invalidAt\` model ensures agents record observations as separate facts
- **Distributed exploration**: Different agents can explore different domains while maintaining a unified world view

## Two-Layer Architecture

The world model has **two distinct layers**:

| Layer | Contains | Tools |
|-------|----------|-------|
| **Ontology (Schema)** | Type definitions, relation types | \`search_ontology\`, \`get_ontology_type\`, \`get_ontology_relation\`, \`find_ontology_paths\` |
| **Instances (Data)** | Actual nodes and edges | \`find_instances\`, \`get_instance\`, \`get_instance_edges\`, \`discover_connection\` |

**Think of it like a database**: the ontology is the schema (table definitions), instances are the actual rows.

## Quick Reference

### Ontology Tools (Schema Layer)
- \`search_ontology("people who work at companies")\` → Find types/relations by meaning
- \`get_ontology_type("PERSON")\` → See properties and relations for a type
- \`get_ontology_relation("EMPLOYED_BY")\` → See what types a relation connects
- \`find_ontology_paths("PERSON", "PRODUCT")\` → How CAN these types connect?

### Instance Tools (Data Layer)
- \`find_instances("PERSON", filter: {...})\` → Find actual people matching criteria
- \`get_instance("node:abc123")\` → Get a specific node
- \`get_instance_edges("node:abc123")\` → Get direct edges (1 hop)
- \`discover_connection("node:tim", "node:seattle")\` → How ARE these connected?

## Recommended Workflow

### 1. Explore the Ontology First

Before querying data, understand what exists in the schema:

\`\`\`
search_ontology("people and companies")
\`\`\`

This returns types (PERSON, COMPANY) and relations (EMPLOYED_BY) that match your intent.

### 2. Inspect Type Details

Get specifics about a type:

\`\`\`
get_ontology_type("PERSON")
\`\`\`

Returns properties (fullName, email) and what relations PERSON can have.

### 3. Understand Type Connections

Before querying instance paths, see how types CAN connect:

\`\`\`
find_ontology_paths("PERSON", "PRODUCT")
\`\`\`

Might show: PERSON → COMPANY → PRODUCT

### 4. Find Instances

Query actual data:

\`\`\`
find_instances("PERSON", filter: { operator: "CONTAINS", field: "name", value: "Tim" })
\`\`\`

### 5. Explore Instance Connections

Get direct edges:
\`\`\`
get_instance_edges("node:tim_cook")
\`\`\`

Find indirect paths between any two instances:
\`\`\`
discover_connection("node:tim_cook", "node:seattle")
\`\`\`

## Creating Data

### Create Instances

\`\`\`
create_instance("PERSON", { fullName: "Bob Smith", email: "bob@example.com" })
\`\`\`

### Create Edges Between Instances

\`\`\`
create_edge("node:bob", "EMPLOYED_BY", "node:techcorp")
\`\`\`

### Update Existing Instances

\`\`\`
update_instance("node:bob", { email: "bob.smith@example.com" })
\`\`\`

## Extending the Ontology

### Create New Types

\`\`\`
create_ontology_type("PRODUCT", "A product manufactured by a company", properties: [
  { name: "name", description: "Product name", dataType: "STRING" },
  { name: "category", description: "Product category", dataType: "STRING" },
  { name: "releaseDate", description: "Release date", dataType: "DATE" }
])
\`\`\`

### Create New Relation Types

\`\`\`
create_ontology_relation("MADE_BY", "Product manufactured by company", "PRODUCT", "COMPANY")
\`\`\`

## Temporal Data (Historical Records)

All data supports temporal validity. Edges can have validity windows:

\`\`\`
// Create an edge that started in the past
create_edge("node:alice", "CFO_OF", "node:techcorp", validAt: "2020-01-15T00:00:00Z")

// Create an edge with a known end date (e.g., person stepped down)
create_edge("node:alice", "CFO_OF", "node:techcorp", 
  validAt: "2020-01-15T00:00:00Z",
  invalidAt: "2024-12-31T00:00:00Z"
)

// End an existing edge at a specific date
invalidate("edge:abc123", invalidAt: "2024-12-31T00:00:00Z")
\`\`\`

Use temporal validity windows instead of creating "former_" relation types.

## FilterDSL Tips

**IMPORTANT**: Filters must be passed as JSON objects, not strings!

\`\`\`
// CORRECT - filter as object:
find_instances("PERSON", filter: { operator: "CONTAINS", field: "name", value: "Alice" })

// WRONG - filter as string (will fail validation):
find_instances("PERSON", filter: "{\\"operator\\": \\"CONTAINS\\", ...}")
\`\`\`

Filters compose naturally:
- Use AND/OR/NOT for logic
- Use HAS_RELATION to filter by edges
- Add targetFilter to filter the connected instance

See \`worldmodel://help/filter-examples\` for a complete cheat sheet.

## Lists (Dynamic Queries)

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

Query members:
\`\`\`
get_list_members("TECH_EMPLOYEES")
\`\`\`

## Best Practices

### Ontology First, Then Instances
1. \`search_ontology("topic")\` → What types/relations exist?
2. \`find_ontology_paths("A", "B")\` → How CAN these types connect?
3. \`find_instances(...)\` → Find actual data
4. \`discover_connection(...)\` → How ARE these instances connected?

### Think in Graphs
- Use \`discover_connection(fromId, toId)\` to discover how any two instances connect
- **Don't assume no direct edge means no connection** - check indirect paths!

Example: "Is Tim Cook connected to Seattle?"
\`\`\`
// Don't just check direct edges
// Do this: discover_connection("node:tim_cook", "node:seattle", maxDepth: 4)
// This finds: Tim → Apple → Seattle Office
\`\`\`

### Think Temporally
- Edges have \`validAt\` and \`invalidAt\` timestamps
- Check these to understand WHEN relationships were true
- "Was X involved in Y?" requires checking if their connection existed at the right time
`;
}

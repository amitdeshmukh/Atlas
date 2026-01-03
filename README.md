# AxOntology

A **GraphQL-first ontology, temporal graph, and list-definition layer** over a native graph database.

Designed as a **"Shared Brain" for Humans and AI Agents**, enabling:

- **Explicit ontology definition and discovery** (Schema as Data)
- **Controlled, temporal graph mutations** (validAt/invalidAt)
- **Declarative, dynamic lists** (Predicates, not containers)
- **Universal Traversal** for agent exploration
- **Dual interfaces**: GraphQL API + MCP Server for LLM agents

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Interfaces Layer                            │
│  ┌─────────────────────┐     ┌─────────────────────────────┐    │
│  │   GraphQL Server    │     │       MCP Server            │    │
│  │  (Fastify+Mercurius)│     │  (Model Context Protocol)   │    │
│  └──────────┬──────────┘     └──────────────┬──────────────┘    │
└─────────────┼───────────────────────────────┼───────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        Core Layer                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    WorldModel                            │    │
│  │  - searchConcepts()    - findEntities()                 │    │
│  │  - createEntity()      - linkEntities()                 │    │
│  │  - defineList()        - exploreConnections()           │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐    │
│  │ OntologyService │  │   ListService   │  │ FilterEvaluator│   │
│  └─────────────────┘  └─────────────────┘  └───────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                     Adapters Layer                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                StorageAdapter Interface                  │    │
│  │  - Nodes: getNodeById, upsertNode, getNodesByType       │    │
│  │  - Edges: getEdgesForNode, upsertEdge                   │    │
│  │  - Lists: getListDefinition, upsertListDefinition       │    │
│  │  - Ontology: getTypeByName, upsertTypeDef, etc.         │    │
│  └─────────────────────────────────────────────────────────┘    │
│           │                    │                    │            │
│  ┌────────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐   │
│  │ SurrealAdapter  │  │  Neo4jAdapter  │  │PostgresAdapter │   │
│  │   (current)     │  │   (future)     │  │   (future)     │   │
│  └────────┬────────┘  └────────────────┘  └────────────────┘   │
└───────────┼─────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────┐
│                         SurrealDB                                │
│  - Nodes: `node` table                                          │
│  - Edges: RELATE syntax (EMPLOYED_BY, PURCHASED, etc.)          │
│  - Ontology: typeDef, relationTypeDef, allows_relation          │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- SurrealDB 2.x running locally

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your SurrealDB credentials

# Start SurrealDB (if not running)
surreal start --user root --pass root

# Run the server
npm run dev
```

### GraphQL API

The GraphQL server runs at `http://localhost:4000/graphql`.

```graphql
# Discover types, relations, AND lists by meaning
query {
  searchOntology(query: "people who work at companies") {
    types { type { name description } score }
    relations { relation { name } score }
    lists { list { name description } score }
  }
}

# Find entities
query {
  nodes(type: "PERSON", filter: {
    operator: CONTAINS
    field: "fullName"
    value: "Alice"
  }) {
    id
    properties
    relationships { relationType otherNode { type properties } }
  }
}

# Create entities and relationships
mutation {
  person: upsertNode(type: "PERSON", properties: { fullName: "Alice" }) { id }
  company: upsertNode(type: "COMPANY", properties: { name: "TechCorp" }) { id }
}

mutation {
  upsertEdge(relationType: "EMPLOYED_BY", fromId: $personId, toId: $companyId) { id }
}
```

### MCP Server (for LLM Agents)

The MCP server provides tools for AI agents to interact with the world model:

```typescript
// Tools available to agents
search_concepts(query: string)      // Semantic search over ontology
find_entities(type, filter)         // Query nodes with filters
create_entity(type, properties)     // Create new nodes
link_entities(from, relation, to)   // Create relationships
define_list(name, desc, type, filter) // Define dynamic lists
get_filter_examples()               // Get FilterDSL examples
```

## Core Concepts

### Ontology (Schema as Data)

The ontology defines **meaning**, not state. It's queryable at runtime:

- **Types**: PERSON, COMPANY, PRODUCT, etc.
- **RelationTypes**: EMPLOYED_BY, PURCHASED, MANAGES, etc.
- **Properties**: Allowed fields for each type

### Temporal Graph

All state is temporal with `validAt` and `invalidAt` timestamps:

```graphql
# Query state at a specific time
nodes(type: "PERSON", asOf: "2024-01-01T00:00:00Z") { ... }

# Invalidate (soft delete) records
mutation { invalidate(id: "node:abc", invalidAt: "2025-01-01") }
```

### Lists (Predicates, not Containers)

Lists are **dynamic queries**, not static ID collections:

```graphql
# Define a list
mutation {
  defineList(
    name: "EMPLOYED_AT_TECH"
    description: "People employed at companies with 'Tech' in name"
    targetType: "PERSON"
    filter: {
      operator: HAS_RELATION
      relationType: "EMPLOYED_BY"
      targetFilter: { operator: CONTAINS, field: "name", value: "Tech" }
    }
  ) { name }
}

# Query list members (evaluates predicate at query time)
query { list(name: "EMPLOYED_AT_TECH") { members { id properties } } }
```

### FilterDSL

Composable filter language for queries and list definitions:

| Operator | Purpose | Example |
|----------|---------|---------|
| EQUALS | Exact match | `{operator: EQUALS, field: "email", value: "a@b.com"}` |
| CONTAINS | Substring/element | `{operator: CONTAINS, field: "name", value: "Tech"}` |
| GT / LT | Numeric comparison | `{operator: GT, field: "revenue", value: 1000000}` |
| AND / OR | Combine conditions | `{operator: AND, operands: [...]}` |
| NOT | Negate | `{operator: NOT, operands: [...]}` |
| HAS_RELATION | Relationship exists | `{operator: HAS_RELATION, relationType: "EMPLOYED_BY"}` |

## Project Structure

```
src/
├── index.ts              # Entry point
├── config.ts             # Environment configuration
├── core/                 # Shared business logic
│   ├── types.ts          # Domain types
│   ├── worldModel.ts     # Unified API
│   └── filterEvaluator.ts
├── adapters/             # Storage abstraction
│   ├── types.ts          # Adapter interface
│   ├── index.ts          # Factory
│   └── surreal/          # SurrealDB implementation
├── graphql/              # GraphQL interface
│   ├── server.ts
│   ├── sdl.ts
│   └── resolvers.ts
├── mcp/                  # MCP interface
│   ├── server.ts
│   ├── tools.ts
│   └── resources.ts
├── embeddings/           # Semantic search
└── bootstrap/            # Ontology seeding
```

## Development

```bash
# Run tests
npm test

# Run with watch mode
npm run dev

# Type check
npm run typecheck
```

## Adding a New Storage Backend

See [src/adapters/README.md](src/adapters/README.md) for instructions on implementing a new storage adapter.

## License

MIT


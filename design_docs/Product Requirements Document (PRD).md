# Product Requirements Document (PRD)

## GraphQL Ontology, Temporal Graph & Lists Layer

**Backend:** Fastify + GraphQL + SurrealDB (pluggable storage)
**Audience:** Backend / Platform Engineering
**Status:** Implemented (v3) – Updated for MCP Server & Layered Architecture

---

## 1. Purpose & Scope

This system provides a **GraphQL-first ontology, graph mutation, and list-definition layer** over a native graph database.

It is designed as a **"Shared Brain" for Humans and AI Agents**, enabling:

* Explicit ontology definition and discovery (Schema as Data)
* Controlled, temporal graph mutations
* Declarative, dynamic lists (Predicates, not containers)
* Native temporal modeling (`validAt` / `invalidAt`)
* **Universal Traversal** ("Blind Walking" for Agents)
* **Semantic Search** (Find types/relations by meaning)
* **MCP Interface** (Tool-based access for LLM agents)

### Explicitly Out of Scope

* Agent frameworks or orchestration
* Prompting or memory management
* BI / analytics engines
* Distributed graph clustering

---

## 2. Core Principles (Non-Negotiable)

1.  **Ontology is data, not code:** Schema must be queryable at runtime.
2.  **Objects are the source of truth:** Properties live on nodes, not in lists.
3.  **Lists are contextual views, never containers:** You cannot "add" an ID to a list; you must match its definition.
4.  **All ontology elements require descriptions:** AI cannot hallucinate meaning; it must read it.
5.  **All state is temporal:** History is immutable; current state is a moving window.
6.  **Nothing is ever silently deleted:** Deletion is strictly "invalidation" (closing the time window).
7.  **GraphQL is the only public API:** No backdoors. (MCP wraps GraphQL logic)

---

## 3. High-Level Architecture

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
│  │  - defineList()        - findOntologyPaths()            │    │
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

---

## 4. Ontology Data Model (Timeless)

Ontology defines **meaning**, not state. Ontology elements are **not temporal**.

### 4.1 Ontology Storage

| Table | Purpose |
| --- | --- |
| `typeDef` | Declares object types (e.g., "PERSON", "COMPANY") with embedded properties |
| `relationTypeDef` | Declares relationship types (e.g., "EMPLOYED_BY") with source/target types |
| `allows_relation` | Edge table: Type → RelationType (via SurrealDB RELATE) |
| `target_type` | Edge table: RelationType → Type (via SurrealDB RELATE) |

### 4.2 Ontology Graph Structure

```
(typeDef:PERSON) --[allows_relation]--> (relationTypeDef:EMPLOYED_BY) --[target_type]--> (typeDef:COMPANY)
```

Properties are **embedded** in the `typeDef` record as an array, not stored in a separate table.

---

## 5. Mandatory Descriptions (All Ontology Levels)

### Rule (Hard Constraint)

> **Every ontology element MUST have a human-readable description.**

This enables the AI agent to "ground" itself by querying the meaning of data before acting.

**Validation Rules:**

* Minimum length: 10 characters
* No placeholders (`TODO`, `TBD`)
* **Action:** Reject mutation if validation fails.

---

## 6. Canonical Naming & Case Sensitivity

* All ontology identifiers are **case-insensitive at API level**.
* Stored in **canonical UPPERCASE** (e.g., `EMPLOYED_BY`).
* Display names are separate properties.

---

## 7. Native Temporality (Core Feature)

### 7.1 Temporal Fields

All **instance-level elements** (Nodes, Edges, List Definitions) MUST support temporality.

```json
{
  "validAt": "ISO-8601 timestamp (Required)",
  "invalidAt": "ISO-8601 timestamp | null"
}
```

**Logic:**

* `validAt` marks the start of reality.
* `invalidAt = null` means "currently true".
* `validAt < invalidAt` is strictly enforced (validation error if violated).

---

## 8. Objects (Graph Nodes)

Objects represent **what exists in the domain**.

### 8.1 Object Instance Model

```json
{
  "id": "node:abc123",
  "type": "COMPANY",
  "properties": { "name": "TechCorp", "revenue": 500000 },
  "validAt": "2023-01-01T00:00:00Z",
  "invalidAt": null
}
```

### 8.2 Universal Traversal (The "Blind Walk" Requirement)

To allow Agents to discover the world dynamically without knowing the schema, **every object MUST implement a generic traversal interface.**

**Required GraphQL Resolver:**
`node.relationships(direction: Direction, asOf: DateTime): [GraphEdge]`

* Returns **ALL** edges connected to this node.
* Includes `relationType`, `direction` (INCOMING/OUTGOING), and the `otherNode`.
* This allows an agent to land on any node and ask "Where can I go from here?"

---

## 9. Relationships (Graph Edges)

Relationships represent **facts between objects over time**.

### 9.1 Edge Storage

Edges are stored using SurrealDB's native `RELATE` syntax. Each relation type becomes its own edge table:

```surrealql
RELATE node:alice->EMPLOYED_BY->node:techcorp SET validAt = time::now();
```

### 9.2 Edge Instance Model

```json
{
  "id": "EMPLOYED_BY:xyz789",
  "relationType": "EMPLOYED_BY",
  "fromId": "node:alice",
  "toId": "node:techcorp",
  "validAt": "2021-06-01T00:00:00Z",
  "invalidAt": null
}
```

* **Mutation Note:** Updating a relationship is an **Invalidate + Create** operation.

---

## 10. Lists (Contextual Views Over Objects)

### Definition

> **A List is a named, described, temporal predicate over objects.**

### 10.1 List Mutation Rules (Strict)

* **Explicitly Forbidden:** `addToList(listId, objectId)`
* **Explicitly Forbidden:** `removeFromList(listId, objectId)`
* **Required Mutation:** `defineList(name, description, targetType, filter: FilterDSL)`

Lists **never** store membership IDs. Membership is always computed dynamically at query time based on the `FilterDSL`. To "add" an item, you must update the object properties to match the filter, or update the filter to include the object.

---

## 11. Temporal Semantics of Lists

### Key Principle

> Lists are **time-versioned definitions**, not snapshots.

**Supported Queries:**

1. "What is in this list **now**?" (Uses current definition + current objects).
2. "What was in this list **last year**?" (Uses the definition active last year + objects active last year).

---

## 12. GraphQL API – Queries

### 12.1 Global Rule

All data queries MAY accept an optional `asOf` timestamp.

**Default:** `asOf = NOW()`

**Logic:**
For any Node or Edge to be returned, it must satisfy:
`validAt <= asOf AND (invalidAt IS NULL OR invalidAt > asOf)`

### 12.2 Discovery Queries

| Query | Purpose |
| --- | --- |
| `searchOntology(query, limit)` | Semantic search over types, relations, AND lists by description |
| `type(name)` | Get type details including properties and relations |
| `relation(name)` | Get relation type details |
| `list(name, asOf)` | Get specific list by name and evaluate members |
| `ontologySummary` | Get counts (types, relations, lists) |
| `suggestType(description, limit)` | Suggest best type for creating an entity |

### 12.3 Path Finding Queries

| Query | Purpose |
| --- | --- |
| `findOntologyPath(fromType, toType, maxDepth)` | Find how two types connect in the ontology |
| `findInstancePath(fromNodeId, toNodeId, maxDepth)` | Find paths between specific entities |
| `searchRelationships(nodeId, query, limit)` | Semantic search over a node's relationships |

### 12.4 Data Queries

| Query | Purpose |
| --- | --- |
| `nodes(type, filter, asOf, limit)` | Find entities of a type with optional filter |
| `node(id, asOf)` | Get specific entity by ID |

---

## 13. GraphQL API – Mutations

### 13.1 Node Mutations

* `upsertNode(type, properties, id?, validAt?)`: Create or update a node.
* `invalidate(id, invalidAt?)`: Soft delete a node or edge.

### 13.2 Edge Mutations

* `upsertEdge(relationType, fromId, toId, properties?, validAt?)`: Create edge by IDs.
* `upsertEdgeByNodeRef(relationType, from, to, properties?, validAt?)`: Create edge by node references (LLM-friendly).

**NodeRefInput:**
```graphql
input NodeRefInput {
  id: ID              # Direct ID if known
  type: String        # Type + key + value for lookup
  key: String
  value: JSON
}
```

### 13.3 List Mutations

* `defineList(name, description, targetType, filter)`: Define or update a list.

### 13.4 Ontology Mutations

* `upsertType(name, description)`: Create or update a type.
* `upsertRelation(name, description, sourceType, targetType)`: Create or update a relation type.

---

## 14. The Filter DSL

The system exposes a serializable DSL for defining List logic and query filters.

```graphql
input FilterDSL {
  operator: FilterOperator!   # AND, OR, NOT, EQUALS, GT, LT, CONTAINS, HAS_RELATION
  field: String               # For property comparisons
  value: JSON                 # Value to compare against
  operands: [FilterDSL]       # For nested logic (AND, OR, NOT)
  relationType: String        # For HAS_RELATION
  targetFilter: FilterDSL     # Filter on the related node (for HAS_RELATION)
}
```

### 14.1 Filter Examples

```graphql
# Exact match
{ operator: EQUALS, field: "email", value: "alice@example.com" }

# Has relationship
{ operator: HAS_RELATION, relationType: "EMPLOYED_BY" }

# Has relationship to specific target
{ operator: HAS_RELATION, relationType: "EMPLOYED_BY", 
  targetFilter: { operator: CONTAINS, field: "name", value: "Tech" } }

# Negation
{ operator: NOT, operands: [{ operator: HAS_RELATION, relationType: "EMPLOYED_BY" }] }
```

---

## 15. MCP Server (Agent Interface)

The MCP (Model Context Protocol) server provides a tool-based interface for LLM agents.

### 15.1 Discovery Tools

| Tool | Purpose |
| --- | --- |
| `search_concepts` | Semantic search over ontology |
| `get_type_info` | Get type details (properties, relations) |
| `suggest_type` | Suggest type for creating entities |

### 15.2 Query Tools

| Tool | Purpose |
| --- | --- |
| `find_entities` | Query nodes with filters |
| `get_entity` | Get entity by ID |
| `get_relationships` | Get relationships for an entity |
| `find_path` | Find paths between entities |

### 15.3 Mutation Tools

| Tool | Purpose |
| --- | --- |
| `create_entity` | Create a new entity |
| `link_entities` | Create a relationship |
| `define_list` | Define a dynamic list |
| `get_list_members` | Get list members |

### 15.4 Resources

| URI | Description |
| --- | --- |
| `worldmodel://ontology/summary` | Ontology overview |
| `worldmodel://help/filter-examples` | FilterDSL cheat sheet |
| `worldmodel://help/getting-started` | Quick start guide |

---

## 16. Bootstrap Ontology

### Requirements

* Optional at startup (controlled by `ONTOLOGY_BOOTSTRAP_ENABLED`)
* Idempotent (safe to run multiple times)
* Loads from JSON files in `ONTOLOGY_BOOTSTRAP_DIR`

**JSON Format:**
```json
{
  "types": [
    { "name": "PERSON", "description": "...", "properties": [...] }
  ],
  "relations": [
    { "name": "EMPLOYED_BY", "description": "...", "sourceType": "PERSON", "targetType": "COMPANY" }
  ]
}
```

---

## 17. Semantic Search

Types and relations are searchable by meaning using vector embeddings.

* **Model:** all-MiniLM-L6-v2 (384 dimensions, runs locally)
* **Indexed:** Description fields of types and relations
* **Algorithm:** Cosine similarity

---

## 18. Ontology Validation

All mutations are validated against the ontology:

1. **Node creation:** Type must exist; properties must be defined for the type.
2. **Edge creation:** RelationType must exist; source/target node types must match the relation's definition.
3. **Descriptions:** Must be ≥10 characters, no TODO/TBD placeholders.
4. **Temporal window:** `validAt < invalidAt` when both are present.

---

## 19. Deliverables (Implemented)

| Component | Status |
| --- | --- |
| GraphQL SDL with universal traversal | ✓ Implemented |
| Bootstrap Loader | ✓ Implemented |
| Description Validators | ✓ Implemented |
| Temporal Resolver | ✓ Implemented |
| FilterDSL Evaluator with targetFilter | ✓ Implemented |
| Agent Discovery Queries | ✓ Implemented |
| MCP Server | ✓ Implemented |
| Pluggable Storage Adapter | ✓ Implemented |

---

## 20. Success Criteria

* **Full Data Dictionary:** Derivable purely via GraphQL/MCP queries.
* **No Static Lists:** All grouping is dynamic.
* **Historical Integrity:** Queries with `asOf="2024-01-01"` return legally accurate data for that moment.
* **Agent Discoverability:** An agent can successfully navigate from a random node to a target goal using only `relationships` and `ontology` queries, without hardcoded paths.
* **Semantic Discovery:** Agents can find relevant types/relations by describing what they're looking for.

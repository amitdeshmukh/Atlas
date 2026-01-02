# Product Requirements Document (PRD)

## GraphQL Ontology, Temporal Graph & Lists Layer

**Backend:** Fastify + GraphQL (Mercurius) + LiteGraph (or compatible Native Graph)
**Audience:** Backend / Platform Engineering
**Status:** Final (v2) – Updated for Universal Traversal & Declarative Lists

---

## 1. Purpose & Scope

This system provides a **GraphQL-first ontology, graph mutation, and list-definition layer** over a native graph database.

It is designed as a **"Shared Brain" for Humans and AI Agents**, enabling:

* Explicit ontology definition and discovery (Schema as Data)
* Controlled, temporal graph mutations
* Declarative, dynamic lists (Predicates, not containers)
* Native temporal modeling (`validAt` / `invalidAt`)
* **Universal Traversal** ("Blind Walking" for Agents)
* Fast bootstrapping from a built-in ontology

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
7.  **GraphQL is the only public API:** No backdoors.

---

## 3. High-Level Architecture

```text
Client (Agent / Service)
       |
       |  GraphQL (Queries + Mutations)
       |
Fastify + Mercurius Server
       |
       |  (Resolvers handle Temporality & Logic)
       |
LiteGraph (Embedded Native Graph)

```

---

## 4. Ontology Data Model (Timeless)

Ontology defines **meaning**, not state. Ontology elements are **not temporal**.

### 4.1 Ontology Nodes

| Label | Purpose |
| --- | --- |
| `Type` | Declares object types (e.g., "CLIENT", "PRODUCT") |
| `RelationType` | Declares relationship types (e.g., "PURCHASED", "EMPLOYED_BY") |
| `Property` | Declares specific fields allowed on Types |
| `BootstrapMeta` | Tracks system versioning |

### 4.2 Ontology Relationships

```text
(Type)-[:ALLOWS_RELATION]->(RelationType)
(RelationType)-[:TARGET_TYPE]->(Type)
(Type)-[:HAS_PROPERTY]->(Property)

```

---

## 5. Mandatory Descriptions (All Ontology Levels)

### Rule (Hard Constraint)

> **Every ontology element MUST have a human-readable description.**

This enables the AI agent to "ground" itself by querying the meaning of data before acting.

**Validation Rules:**

* Minimum length: 10 characters
* No placeholders (`TODO`, `TBD`)
* Must be included in Ontology Hashing
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
* `validAt < invalidAt` is strictly enforced.

---

## 8. Objects (Graph Nodes)

Objects represent **what exists in the domain**.

### 8.1 Object Instance Model

```json
{
  "id": "company-123",
  "type": "COMPANY",
  "properties": { "revenue": 500000 },
  "validAt": "2023-01-01T00:00:00Z",
  "invalidAt": null
}

```

### 8.2 Universal Traversal (The "Blind Walk" Requirement)

To allow Agents to discover the world dynamically without knowing the schema, **every object MUST implement a generic traversal interface.**

**Required GraphQL Resolver:**
`node.relationships(asOf: Timestamp): [GraphEdge]`

* Returns **ALL** edges connected to this node.
* Includes `relationType`, `direction`, and the `otherNode`.
* This allows an agent to land on any node and ask "Where can I go from here?"

---

## 9. Relationships (Graph Edges)

Relationships represent **facts between objects over time**.

### Relationship Instance Model

```json
{
  "id": "edge-456",
  "relation": "EMPLOYED_BY",
  "from": "person-1",
  "to": "company-123",
  "validAt": "2021-06-01T00:00:00Z",
  "invalidAt": "2024-03-31T23:59:59Z"
}

```

* **Mutation Note:** Updating a relationship (e.g., changing metadata) is an **Invalidate + Create** operation.

---

## 10. Lists (Contextual Views Over Objects)

### Definition

> **A List is a named, described, temporal predicate over objects.**

### 10.1 List Mutation Rules (Strict)

* **Explicitly Forbidden:** `addToList(listId, objectId)`
* **Explicitly Forbidden:** `removeFromList(listId, objectId)`
* **Required Mutation:** `defineList(filter: FilterDSL)`

Lists **never** store membership IDs. Membership is always computed dynamically at query time based on the `FilterDSL`. To "add" an item, you must update the object properties to match the filter, or update the filter to include the object.

---

## 11. Temporal Semantics of Lists

### Key Principle

> Lists are **time-versioned definitions**, not snapshots.

**Supported Queries:**

1. "What is in this list **now**?" (Uses current definition + current objects).
2. "What was in this list **last year**?" (Uses the definition active last year + objects active last year).

---

## 12. GraphQL API – Query Semantics

### Global Rule

All data queries MAY accept an optional `asOf` timestamp.

**Default:** `asOf = NOW()`

**Logic:**
For any Node or Edge to be returned, it must satisfy:
`validAt <= asOf AND (invalidAt IS NULL OR invalidAt > asOf)`

---

## 13. GraphQL API – Mutations & DSL

### 13.1 Generic Mutations

To simplify the world model, use generic actions rather than specific ones.

* `upsertNode(type, properties, id?)`: Handles Create and Update.
* `upsertEdge(type, from, to, properties?)`: Handles Link creation.
* `invalidate(id)`: Handles Deletion (Soft Delete).

### 13.2 The Filter DSL

The system must expose a serializable DSL for defining List logic.

```graphql
input FilterDSL {
  operator: FilterOperator! # AND, OR, EQUALS, GT, HAS_RELATION
  field: String
  value: String
  operands: [FilterDSL]     # For nested logic
  relationType: String      # For graph-based filters
}

```

---

## 14. Ontology Hashing

### Scope

Hashing allows clients (Agents) to cache the schema safely.

**Included in Hash:**

* Type names + Descriptions
* Relation names + Descriptions
* Property definitions
* List definitions (Filters + Descriptions)

**Excluded:**

* Object instances (Data)
* Temporal timestamps
* IDs

---

## 15. Bootstrap Ontology

### Requirements

* Runs at startup.
* Completes in < 100ms.
* Idempotent (safe to run multiple times).
* Immutable once applied.

**Purpose:** Ensures the "World" always starts with a valid structure so "Blind Walk" agents don't crash on an empty DB.

---

## 16. Performance Targets

| Operation | Target |
| --- | --- |
| **Bootstrap** | < 100ms |
| **Ontology Query** | < 10ms |
| **List Evaluation** | < 25ms (requires efficient indexing of filters) |
| **Graph Mutation** | < 15ms |

---

## 17. Deliverables (Engineering)

Engineering must deliver:

1. **GraphQL SDL:** Implementing `interface Node`, `FilterDSL`, and generic `upsert`.
2. **Bootstrap Loader:** To seed the ontology.
3. **Validators:** For descriptions and DSL structure.
4. **Temporal Resolver:** Middleware to enforce `asOf` logic globally.
5. **Hash Generator:** For ontology caching.
6. **Universal Resolver:** Implementation of the `relationships` field on all nodes.

---

## 18. Success Criteria

* **Full Data Dictionary:** Derivable purely via GraphQL introspection/ontology query.
* **No Static Lists:** All grouping is dynamic.
* **Historical Integrity:** Queries with `asOf="2024-01-01"` return legally accurate data for that moment.
* **Agent Discoverability:** An agent can successfully navigate from a random node to a target goal using only `relationships` and `ontology` queries, without hardcoded paths.


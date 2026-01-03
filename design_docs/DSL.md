# AxOntology GraphQL DSL

## Scalars

```graphql
scalar DateTime
scalar JSON
```

## Agent Workflow: Blind Walking

An AI agent discovers and navigates the world model without prior schema knowledge:

```
1. SEMANTIC SEARCH → Agent asks: "What do we know about people in organizations?"
   searchOntology(query: "people in organizations")
   → Returns: PERSON type (94% match), EMPLOYED_BY relation (97% match)

2. ONTOLOGY TRAVERSAL → Agent explores the PERSON type:
   type(name: "PERSON") { outgoingRelations { name targetType { name } } }
   → Returns: EMPLOYED_BY → COMPANY, WORKS_ON → PROJECT, MANAGES → PERSON

3. DATA QUERY → Agent fetches actual data:
   nodes(type: "PERSON", limit: 10) { properties relationships { ... } }
```

## Embeddings & Semantic Search

Semantic search uses **vector embeddings** on descriptions. By default, we use **all-MiniLM-L6-v2** (384 dimensions) which runs locally.

When types/relations are registered, their `description` fields are embedded into vector space.
Search queries are embedded and compared using **cosine similarity**.

---

# 1. The World Model (Semantic Ontology Discovery)

```graphql
type Query {
  "Semantic search over the world model - find types, relations, AND lists by meaning"
  searchOntology(
    query: String!
    limit: Int = 10
  ): OntologySearchResult!

  "Get a specific type by exact name (after discovery)"
  type(name: String!): NodeType

  "Get a specific relation by exact name"
  relation(name: String!): RelationType

  "Lightweight ontology summary (counts)"
  ontologySummary: OntologySummary!

  "Data query: Get nodes of a type, optionally filtered"
  nodes(
    type: String!
    filter: FilterDSL
    asOf: DateTime
    limit: Int = 100
  ): [Node!]!

  "Data query: Get a specific node by ID"
  node(id: ID!, asOf: DateTime): Node

  "Evaluate a named list definition"
  list(name: String!, asOf: DateTime): ListResult

  """
  Find how two types are connected in the ontology graph.
  Returns relationship paths (not instances), up to maxDepth hops.
  Useful for agents asking: "How is PERSON connected to PRODUCT?"
  """
  findOntologyPath(
    fromType: String!
    toType: String!
    maxDepth: Int = 3
  ): [OntologyPath!]!

  """
  Suggest the best matching type for creating a new entity.
  Agent describes what they want to create, system suggests appropriate type.
  """
  suggestType(
    description: String!
    limit: Int = 3
  ): [TypeSuggestion!]!

  """
  Search relationships of a specific node by meaning.
  Useful for: "Show me this person's connections related to 'technology'"
  """
  searchRelationships(
    nodeId: ID!
    query: String!
    asOf: DateTime
    limit: Int = 10
  ): [RelationshipSearchHit!]!

  """
  Find paths between two node INSTANCES in the world model.
  Uses native graph traversal for scalability.
  Useful for: "How is Alice connected to Bob?"
  """
  findInstancePath(
    fromNodeId: ID!
    toNodeId: ID!
    maxDepth: Int = 3
  ): [InstancePath!]!
}
```

## Search Result Types

```graphql
"Result of semantic search over the ontology - includes types, relations, AND lists"
type OntologySearchResult {
  "Types matching the query (by description similarity)"
  types: [TypeSearchHit!]!
  "Relations matching the query (by description similarity)"
  relations: [RelationSearchHit!]!
  "Lists matching the query (by description similarity)"
  lists: [ListSearchHit!]!
}

type TypeSearchHit {
  type: NodeType!
  "Semantic similarity score (0-1)"
  score: Float!
  "Why this matched (relevant part of description)"
  matchReason: String
}

type RelationSearchHit {
  relation: RelationType!
  "Semantic similarity score (0-1)"
  score: Float!
  matchReason: String
}

type ListSearchHit {
  list: ListDefinition!
  "Semantic similarity score (0-1)"
  score: Float!
  matchReason: String
}

"Lightweight summary - use this instead of dumping full ontology"
type OntologySummary {
  typeCount: Int!
  relationCount: Int!
  listCount: Int!
}
```

## Path Finding Types

```graphql
"""
A path through the ontology graph connecting two types.
Example: PERSON --EMPLOYED_BY--> COMPANY --MANUFACTURES--> PRODUCT
"""
type OntologyPath {
  "Human-readable description of the path"
  pathDescription: String!
  "The sequence of relations in this path"
  steps: [OntologyPathStep!]!
  "Total number of hops"
  depth: Int!
}

type OntologyPathStep {
  "The relation traversed in this step"
  relation: RelationType!
  "Direction relative to the path: OUTGOING (A->B) or INCOMING (A<-B)"
  direction: Direction!
  "The type reached after this step"
  targetType: NodeType!
}

"""
A path between two node instances in the world model.
"""
type InstancePath {
  "Human-readable path description"
  pathDescription: String!
  "The edges traversed in this path"
  edges: [InstancePathEdge!]!
  "Number of edge hops"
  depth: Int!
}

type InstancePathEdge {
  id: ID!
  relationType: String!
  fromNode: Node!
  toNode: Node!
}
```

## Type Suggestion

```graphql
"""
A suggested type for creating a new entity.
Helps agents know what type to use and what properties are available.
"""
type TypeSuggestion {
  "The suggested type"
  type: NodeType!
  "Semantic similarity score (0-1)"
  confidence: Float!
  "Why this type was suggested"
  reason: String!
  "Properties that should/can be provided for this type"
  availableProperties: [PropertyDef!]!
}

"""
A relationship search hit - relationship matching a semantic query.
"""
type RelationshipSearchHit {
  "The matching edge"
  edge: GraphEdge!
  "Semantic similarity score (0-1)"
  score: Float!
  "Why this relationship matched"
  matchReason: String!
}
```

## Ontology Types

```graphql
"A type of node in the world model - supports ontology-level traversal"
type NodeType {
  name: String!
  description: String!
  properties: [PropertyDef!]!

  "Ontology traversal: Relations that originate FROM this type"
  outgoingRelations: [RelationType!]!
  "Ontology traversal: Relations that point TO this type"
  incomingRelations: [RelationType!]!
}

"A relation type connecting two node types"
type RelationType {
  name: String!
  description: String!
  "The node type this relation originates from"
  sourceType: NodeType!
  "The node type this relation points to"
  targetType: NodeType!
}

type PropertyDef {
  name: String!
  description: String!
  dataType: String!
}

"A named, temporal predicate over nodes"
type ListDefinition {
  name: String!
  description: String!
  targetType: String!
  filter: FilterDefinition!
  validAt: DateTime!
  invalidAt: DateTime
}
```

---

# 2. The Data Layer (Universal Traversal)

```graphql
interface Node {
  id: ID!
  type: String!

  # The "Blind Walk" enabler
  relationships(
    direction: Direction = BOTH
    asOf: DateTime
  ): [GraphEdge!]!

  properties: JSON!
  validAt: DateTime!
  invalidAt: DateTime
}

enum Direction {
  INCOMING
  OUTGOING
  BOTH
}

"Edge as seen when traversing FROM a specific node (has direction + otherNode)"
type GraphEdge {
  id: ID!
  relationType: String!
  direction: Direction!
  otherNode: Node!
  validAt: DateTime!
  invalidAt: DateTime
}

"Edge with explicit endpoints (used for mutation results)"
type Edge {
  id: ID!
  relationType: String!
  fromNode: Node!
  toNode: Node!
  validAt: DateTime!
  invalidAt: DateTime
}

type GenericNode implements Node {
  id: ID!
  type: String!
  relationships(direction: Direction = BOTH, asOf: DateTime): [GraphEdge!]!
  properties: JSON!
  validAt: DateTime!
  invalidAt: DateTime
}
```

---

# 3. The List & DSL Layer

```graphql
type ListResult {
  name: String!
  description: String!
  definitionUsed: FilterDefinition!
  members: [Node!]!
}

"The structure used for Reading filters (Output)"
type FilterDefinition {
  operator: FilterOperator!
  field: String
  value: JSON
  operands: [FilterDefinition!]
  "For HAS_RELATION: the relationship type to check"
  relationType: String
  "For HAS_RELATION: optional filter on the target node's properties"
  targetFilter: FilterDefinition
}

"The structure used for Writing filters (Input)"
input FilterDSL {
  operator: FilterOperator!
  field: String
  value: JSON
  operands: [FilterDSL!]
  "For HAS_RELATION: the relationship type to check"
  relationType: String
  "For HAS_RELATION: optional filter to apply on the related node"
  targetFilter: FilterDSL
}

enum FilterOperator {
  AND
  OR
  NOT
  EQUALS
  GT
  LT
  CONTAINS
  HAS_RELATION
}
```

## FilterDSL Examples

```graphql
# Exact match
{ operator: EQUALS, field: "email", value: "alice@example.com" }

# Substring match
{ operator: CONTAINS, field: "name", value: "Tech" }

# Numeric comparison
{ operator: GT, field: "revenue", value: 1000000 }

# Has any EMPLOYED_BY relationship
{ operator: HAS_RELATION, relationType: "EMPLOYED_BY" }

# Employed at company with "Tech" in name
{
  operator: HAS_RELATION,
  relationType: "EMPLOYED_BY",
  targetFilter: { operator: CONTAINS, field: "name", value: "Tech" }
}

# NOT employed (no EMPLOYED_BY relationship)
{
  operator: NOT,
  operands: [{ operator: HAS_RELATION, relationType: "EMPLOYED_BY" }]
}

# Name contains Alice AND is employed
{
  operator: AND,
  operands: [
    { operator: CONTAINS, field: "name", value: "Alice" },
    { operator: HAS_RELATION, relationType: "EMPLOYED_BY" }
  ]
}
```

---

# 4. Mutations

```graphql
"Reference to a node, either by id or by a unique property key/value within a type"
input NodeRefInput {
  "Exact node id, if already known"
  id: ID
  "Logical type of the node (UPPERCASE canonical name)"
  type: String
  "Property key used as natural key (e.g. email, externalId)"
  key: String
  "Property value for the natural key"
  value: JSON
}

type Mutation {
  "Create or Update a Node (Temporal Upsert)"
  upsertNode(
    type: String!
    properties: JSON!
    id: ID
    validAt: DateTime
  ): Node!

  "Create or Update an Edge"
  upsertEdge(
    relationType: String!
    fromId: ID!
    toId: ID!
    properties: JSON
    validAt: DateTime
  ): Edge!

  "Create or Update an Edge by logical node references (LLM-friendly helper)"
  upsertEdgeByNodeRef(
    relationType: String!
    from: NodeRefInput!
    to: NodeRefInput!
    properties: JSON
    validAt: DateTime
  ): Edge!

  "Invalidate (Soft Delete) a Node or Edge"
  invalidate(
    id: ID!
    invalidAt: DateTime
  ): Boolean!

  "Define or Update a List (The Filter)"
  defineList(
    name: String!
    description: String!
    targetType: String!
    filter: FilterDSL!
    validAt: DateTime
  ): ListDefinition!

  "Create or Update an Ontology Type (schema as data)"
  upsertType(
    name: String!
    description: String!
  ): NodeType!

  "Create or Update an Ontology Relation Type (schema as data)"
  upsertRelation(
    name: String!
    description: String!
    sourceType: String!
    targetType: String!
  ): RelationType!
}
```

---

# 5. MCP Server (for LLM Agents)

The system also exposes an MCP (Model Context Protocol) server for direct agent interaction:

## Tools

| Tool | Description |
|------|-------------|
| `search_concepts` | Semantic search over ontology |
| `get_type_info` | Get type details (properties, relations) |
| `suggest_type` | Suggest type for creating entities |
| `find_entities` | Query nodes with filters |
| `get_entity` | Get entity by ID |
| `get_relationships` | Get relationships for an entity |
| `find_path` | Find paths between entities |
| `create_entity` | Create a new entity |
| `link_entities` | Create a relationship |
| `define_list` | Define a dynamic list |
| `get_list_members` | Get list members |
| `get_filter_examples` | Get FilterDSL cheat sheet |

## Resources

| URI | Description |
|-----|-------------|
| `worldmodel://ontology/summary` | Ontology overview |
| `worldmodel://help/filter-examples` | FilterDSL examples |
| `worldmodel://help/getting-started` | Quick start guide |

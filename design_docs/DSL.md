scalar DateTime
scalar JSON

# AxOntology GraphQL DSL

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

Semantic search uses **vector embeddings** on descriptions. By default, we use **all-MiniLM-L6-v2** (384 dimensions) which runs locally:


When types/relations are registered, their `description` fields are embedded into vector space.
Search queries are embedded and compared using **cosine similarity**.


# --- 1. The World Model (Semantic Ontology Discovery) ---

```
type Query {
  "Semantic search over the world model - find types/relations by meaning"
  searchOntology(
    query: String!
    limit: Int = 10
  ): OntologySearchResult!
  
  "Get a specific type by exact name (after discovery)"
  type(name: String!): NodeType
  
  "Get a specific relation by exact name"
  relation(name: String!): RelationType
  
  "Lightweight ontology summary (counts, hash - NOT full dump)"
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
}

"Result of semantic search over the ontology"
type OntologySearchResult {
  "Types matching the query (by description similarity)"
  types: [TypeSearchHit!]!
  "Relations matching the query (by description similarity)"
  relations: [RelationSearchHit!]!
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

"Lightweight summary - use this instead of dumping full ontology"
type OntologySummary {
  typeCount: Int!
  relationCount: Int!
  listCount: Int!
  "Hash for caching - changes when ontology changes"
  hash: String!
}

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

# --- 2. The Data Layer (Universal Traversal) ---

```
interface Node {
  id: ID!
  type: String!
  
  # The "Blind Walk" enabler. 
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

type GraphEdge {
  id: ID!
  relationType: String!
  direction: Direction!
  otherNode: Node!
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

# --- 3. The List & DSL Layer ---

```
type ListResult {
  name: String!
  description: String!
  # FIXED: Now uses an Output type, not an Input type
  definitionUsed: FilterDefinition! 
  members: [Node!]!
}

"The structure used for Reading filters (Output)"
type FilterDefinition {
  operator: FilterOperator!
  field: String
  value: JSON  # JSON allows numbers/booleans for GT/LT
  operands: [FilterDefinition!]
  relationType: String
}

"The structure used for Writing filters (Input)"
input FilterDSL {
  operator: FilterOperator!
  field: String
  value: JSON  # JSON allows numbers/booleans for GT/LT
  operands: [FilterDSL!]
  relationType: String
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

# --- 4. Mutations ---

```
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
  ): GraphEdge!

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
  ): ListDefinition! # Better to return the object than Boolean
}
```
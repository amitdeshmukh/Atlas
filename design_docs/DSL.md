scalar DateTime
scalar JSON

# --- 1. The Core Ontology (Discovery Layer) ---

```
type Query {
  "Get the current state of the world's ontology"
  ontology: Ontology!
  
  "Generic node lookup by ID"
  node(id: ID!, asOf: DateTime): Node
  
  "Evaluate a list definition to get its members"
  list(name: String!, asOf: DateTime): ListResult
}

type Ontology {
  types: [NodeType!]!
  relations: [RelationType!]!
  "Agents need to discover existing lists to avoid redefining them"
  lists: [ListDefinition!]! 
}

type NodeType {
  name: String!
  description: String!
  properties: [PropertyDef!]!
}

type RelationType {
  name: String!
  description: String!
  sourceType: String!
  targetType: String!
}

type PropertyDef {
  name: String!
  description: String!
  dataType: String! 
}

"The read-only definition of a list (Output)"
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
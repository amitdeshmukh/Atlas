# AxOntology Examples

This directory contains example GraphQL queries, mutations, and bootstrap data for AxOntology.

## Directory Structure

```
examples/
├── queries/                    # GraphQL query examples
│   ├── agent_discovery_flow.graphql   # Complete agent workflow
│   ├── agent_discovery.graphql        # Discovery queries (suggestType, findPath, etc.)
│   ├── list_by_relationship.graphql   # List definition with HAS_RELATION/NOT
│   ├── traverse_person_relationships.graphql  # Relationship traversal
│   └── walk_ontology_from_type.graphql        # Ontology graph exploration
├── mutations/                  # GraphQL mutation examples
│   ├── define_active_employees_list.graphql   # List definition
│   ├── upsert_node_and_edge.graphql           # Node + edge creation
│   └── upsert_type_and_relation.graphql       # Ontology mutations
├── bootstrap_ontologies/       # Bootstrap data (JSON)
│   └── person_company_ontology.json           # PERSON + COMPANY types
└── README.md
```

## Agent Workflow

The recommended pattern for LLM agents:

### 1. Discover (Ontology Search)

```graphql
# Find relevant types, relations, AND lists by meaning
query { 
  searchOntology(query: "people who work at companies") { 
    types { type { name } score } 
    relations { relation { name } score }
    lists { list { name description } score }
  } 
}

# Or suggest a type for creating something
query { suggestType(description: "someone who works for a business") { type { name } confidence } }
```

### 2. Explore (Ontology Traversal)

```graphql
# Get type details including properties and relations
query { type(name: "PERSON") { properties { name } outgoingRelations { name targetType { name } } } }

# Find how two types connect
query { findOntologyPath(fromType: "PERSON", toType: "COMPANY") { pathDescription steps { relation { name } } } }
```

### 3. Query (Instance Search)

```graphql
# Find entities with filters
query { nodes(type: "PERSON", filter: { operator: CONTAINS, field: "fullName", value: "Alice" }) { id properties } }

# Traverse relationships
query { node(id: "node:abc") { relationships { relationType otherNode { type properties } } } }
```

### 4. Mutate (Create/Update)

```graphql
# Create nodes
mutation { upsertNode(type: "PERSON", properties: { fullName: "Alice" }) { id } }

# Create edges (validates against ontology)
mutation { upsertEdgeByNodeRef(relationType: "EMPLOYED_BY", from: { type: "PERSON", key: "email", value: "alice@example.com" }, to: { type: "COMPANY", key: "name", value: "TechCorp" }) { id } }
```

## FilterDSL Quick Reference

```graphql
# Exact match
{ operator: EQUALS, field: "email", value: "alice@example.com" }

# Substring match
{ operator: CONTAINS, field: "name", value: "Tech" }

# Numeric comparison
{ operator: GT, field: "revenue", value: 1000000 }

# Has relationship
{ operator: HAS_RELATION, relationType: "EMPLOYED_BY" }

# Has relationship to specific target
{ operator: HAS_RELATION, relationType: "EMPLOYED_BY", targetFilter: { operator: CONTAINS, field: "name", value: "Tech" } }

# Negation
{ operator: NOT, operands: [{ operator: HAS_RELATION, relationType: "EMPLOYED_BY" }] }

# Combine with AND/OR
{ operator: AND, operands: [{ operator: CONTAINS, field: "name", value: "Alice" }, { operator: HAS_RELATION, relationType: "EMPLOYED_BY" }] }
```

## Bootstrap Ontologies

The `bootstrap_ontologies/` folder contains JSON files loaded at server startup (if `ONTOLOGY_BOOTSTRAP_ENABLED=true`).

Format:
```json
{
  "types": [
    {
      "name": "PERSON",
      "description": "A human individual...",
      "properties": [
        { "name": "fullName", "description": "...", "dataType": "STRING", "ownerType": "PERSON" }
      ]
    }
  ],
  "relations": [
    {
      "name": "EMPLOYED_BY",
      "description": "...",
      "sourceType": "PERSON",
      "targetType": "COMPANY"
    }
  ]
}
```

## MCP Server

For LLM agents, the MCP server provides simplified tool access. See `mcp_examples.md` for usage patterns.


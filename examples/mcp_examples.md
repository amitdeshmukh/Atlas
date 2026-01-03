# MCP Server Examples

The AxOntology MCP server provides tools for LLM agents to interact with the world model without writing GraphQL.

## Discovery Tools

### search_concepts
Semantic search over the ontology - find types, relations, and lists by meaning.

```json
{
  "tool": "search_concepts",
  "arguments": {
    "query": "people who work at companies",
    "limit": 5
  }
}
```

**Response:**
```json
{
  "types": [
    { "type": { "name": "PERSON", "description": "A human individual..." }, "score": 0.94 },
    { "type": { "name": "COMPANY", "description": "An organization..." }, "score": 0.87 }
  ],
  "relations": [
    { "relation": { "name": "EMPLOYED_BY", "sourceType": "PERSON", "targetType": "COMPANY" }, "score": 0.97 }
  ],
  "lists": [
    { "list": { "name": "ACTIVE_EMPLOYEES", "description": "People currently employed...", "targetType": "PERSON" }, "score": 0.91 }
  ]
}
```

### get_type_info
Get detailed information about a specific type.

```json
{
  "tool": "get_type_info",
  "arguments": { "typeName": "PERSON" }
}
```

**Response:**
```json
{
  "type": { "name": "PERSON", "description": "..." },
  "properties": [
    { "name": "fullName", "description": "...", "dataType": "STRING" },
    { "name": "email", "description": "...", "dataType": "STRING" }
  ],
  "outgoingRelations": [
    { "name": "EMPLOYED_BY", "targetType": "COMPANY" }
  ],
  "incomingRelations": []
}
```

### suggest_type
Given a description of what you want to create, suggests the best matching type.

```json
{
  "tool": "suggest_type",
  "arguments": {
    "description": "someone who works for a business",
    "limit": 3
  }
}
```

## Query Tools

### find_entities
Find entities of a specific type, optionally filtered.

```json
{
  "tool": "find_entities",
  "arguments": {
    "type": "PERSON",
    "filter": { "operator": "CONTAINS", "field": "fullName", "value": "Alice" },
    "limit": 10
  }
}
```

### get_entity
Get a specific entity by ID.

```json
{
  "tool": "get_entity",
  "arguments": { "id": "node:abc123" }
}
```

### get_relationships
Get all relationships for an entity.

```json
{
  "tool": "get_relationships",
  "arguments": {
    "entityId": "node:abc123",
    "direction": "BOTH"
  }
}
```

### find_path
Find how two entities are connected.

```json
{
  "tool": "find_path",
  "arguments": {
    "fromId": "node:alice123",
    "toId": "node:bob456",
    "maxDepth": 3
  }
}
```

## Mutation Tools

### create_entity
Create a new entity in the world model.

```json
{
  "tool": "create_entity",
  "arguments": {
    "type": "PERSON",
    "properties": {
      "fullName": "Alice Smith",
      "email": "alice@example.com"
    }
  }
}
```

**Response:**
```json
{
  "id": "node:xyz789",
  "type": "PERSON",
  "properties": { "fullName": "Alice Smith", "email": "alice@example.com" },
  "validAt": "2026-01-03T12:00:00Z",
  "invalidAt": null
}
```

### link_entities
Create a relationship between two entities. Supports temporal validity windows for historical data.

```json
{
  "tool": "link_entities",
  "arguments": {
    "fromId": "node:alice123",
    "relationType": "EMPLOYED_BY",
    "toId": "node:techcorp456"
  }
}
```

**With historical dates (e.g., recording past employment):**
```json
{
  "tool": "link_entities",
  "arguments": {
    "fromId": "node:luca123",
    "relationType": "EMPLOYED_BY",
    "toId": "node:apple456",
    "properties": { "title": "CFO" },
    "validAt": "2014-05-01T00:00:00Z",
    "invalidAt": "2024-12-31T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "id": "EMPLOYED_BY:abc123",
  "relationType": "EMPLOYED_BY",
  "fromId": "node:luca123",
  "toId": "node:apple456",
  "properties": { "title": "CFO" },
  "validAt": "2014-05-01T00:00:00Z",
  "invalidAt": "2024-12-31T00:00:00Z"
}
```

### invalidate_record
End the validity of an entity or relationship. Use this to record when something stopped being true (e.g., person left company). Supports historical dates for backdating.

```json
{
  "tool": "invalidate_record",
  "arguments": {
    "id": "EMPLOYED_BY:abc123",
    "invalidAt": "2024-12-31T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "id": "EMPLOYED_BY:abc123",
  "invalidAt": "2024-12-31T00:00:00Z"
}
```

## List Tools

### define_list
Define a dynamic list (saved filter).

```json
{
  "tool": "define_list",
  "arguments": {
    "name": "TECH_EMPLOYEES",
    "description": "People employed at tech companies",
    "targetType": "PERSON",
    "filter": {
      "operator": "HAS_RELATION",
      "relationType": "EMPLOYED_BY",
      "targetFilter": { "operator": "CONTAINS", "field": "name", "value": "Tech" }
    }
  }
}
```

### get_list_members
Get all entities that match a defined list.

```json
{
  "tool": "get_list_members",
  "arguments": { "name": "TECH_EMPLOYEES" }
}
```

## Help Tools

### get_filter_examples
Get examples of FilterDSL syntax for composing queries.

```json
{
  "tool": "get_filter_examples",
  "arguments": {}
}
```

**Response:**
```json
{
  "description": "FilterDSL examples for composing queries and list definitions",
  "examples": [
    { "name": "Exact match", "filter": { "operator": "EQUALS", "field": "email", "value": "alice@example.com" } },
    { "name": "Substring match", "filter": { "operator": "CONTAINS", "field": "name", "value": "Tech" } },
    { "name": "Has relationship", "filter": { "operator": "HAS_RELATION", "relationType": "EMPLOYED_BY" } },
    { "name": "Negate with NOT", "filter": { "operator": "NOT", "operands": [{ "operator": "HAS_RELATION", "relationType": "EMPLOYED_BY" }] } }
  ]
}
```

## Resources

The MCP server also exposes browseable resources:

| URI | Description |
|-----|-------------|
| `worldmodel://ontology/summary` | Ontology overview (type/relation/list counts) |
| `worldmodel://help/filter-examples` | FilterDSL cheat sheet |
| `worldmodel://help/getting-started` | Quick start guide for agents |

## Complete Workflow Example

Agent task: "Record that Alice joined TechCorp"

```
1. search_concepts(query: "person employee company")
   → Discovers PERSON, COMPANY types and EMPLOYED_BY relation

2. get_type_info(typeName: "PERSON")
   → Learns PERSON has fullName, email properties

3. find_entities(type: "PERSON", filter: { operator: CONTAINS, field: "fullName", value: "Alice" })
   → Finds Alice's node ID

4. find_entities(type: "COMPANY", filter: { operator: CONTAINS, field: "name", value: "TechCorp" })
   → Finds TechCorp's node ID

5. link_entities(fromId: "node:alice", relationType: "EMPLOYED_BY", toId: "node:techcorp")
   → Creates the employment relationship
```

If Alice doesn't exist:
```
3b. create_entity(type: "PERSON", properties: { fullName: "Alice Smith", email: "alice@example.com" })
    → Creates Alice and returns her node ID
```

## Historical Data Example

Agent task: "Record that Luca Maestri was CFO of Apple from May 2014 to December 2024"

```
1. search_concepts(query: "person employee company executive")
   → Discovers PERSON, COMPANY types and EMPLOYED_BY relation

2. create_entity(type: "PERSON", properties: { fullName: "Luca Maestri", email: "luca@apple.com" })
   → Creates Luca's record (entity created "now" but represents a real person)

3. find_entities(type: "COMPANY", filter: { operator: CONTAINS, field: "name", value: "Apple" })
   → Finds Apple's node ID

4. link_entities(
     fromId: "node:luca123",
     relationType: "EMPLOYED_BY",
     toId: "node:apple456",
     properties: { title: "CFO" },
     validAt: "2014-05-01T00:00:00Z",
     invalidAt: "2024-12-31T00:00:00Z"
   )
   → Creates a bounded historical relationship
```

The key insight: **Entity creation timestamps** represent when you added something to the knowledge graph. **Relationship validity windows** represent when the relationship was true in the real world. These are independent—you can backdate relationships to any point in time.

### Ending an existing relationship

If the relationship already exists and you need to end it:

```
invalidate_record(id: "EMPLOYED_BY:abc123", invalidAt: "2024-12-31T00:00:00Z")
→ Sets the end date without deleting the record
```

This preserves the full history: the relationship remains queryable for historical analysis (e.g., "Who was CFO in 2020?") but won't appear in current-time queries.


# MCP Server Examples

The Atlas MCP server provides tools for LLM agents to interact with the world model without writing GraphQL.

> **⚠️ IMPORTANT: JSON Objects vs Strings**
> 
> Parameters like `filter` and `properties` must be passed as **JSON objects**, not as strings.
> 
> ✅ **Correct:** `"filter": { "operator": "CONTAINS", "field": "NAME", "value": "Alice" }`
> 
> ❌ **Wrong:** `"filter": "{\"operator\": \"CONTAINS\", \"field\": \"NAME\", \"value\": \"Alice\"}"`
> 
> Do NOT stringify/serialize these parameters - pass them as native JSON objects.

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

### get_relation_info
Get detailed information about a specific relation type.

```json
{
  "tool": "get_relation_info",
  "arguments": { "relationName": "EMPLOYED_BY" }
}
```

**Response:**
```json
{
  "name": "EMPLOYED_BY",
  "description": "Indicates that a person is or was employed by a company.",
  "sourceType": "PERSON",
  "targetType": "COMPANY"
}
```

### get_ontology_summary
Get a summary of the ontology showing counts of types, relations, and lists.

```json
{
  "tool": "get_ontology_summary",
  "arguments": {}
}
```

**Response:**
```json
{
  "typeCount": 5,
  "relationCount": 3,
  "listCount": 2
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

### find_ontology_paths
Find how two types are connected in the ontology schema.

```json
{
  "tool": "find_ontology_paths",
  "arguments": {
    "fromType": "PERSON",
    "toType": "COMPANY",
    "maxDepth": 3
  }
}
```

**Response:**
```json
[
  {
    "pathDescription": "PERSON -->[EMPLOYED_BY]--> COMPANY",
    "depth": 1,
    "steps": [
      {
        "relation": { "name": "EMPLOYED_BY", "description": "..." },
        "direction": "OUTGOING",
        "targetType": "COMPANY"
      }
    ]
  }
]
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

### update_entity
Update an existing entity's properties (partial update - merged with existing).

```json
{
  "tool": "update_entity",
  "arguments": {
    "id": "node:xyz789",
    "properties": {
      "email": "alice.smith@newcompany.com"
    }
  }
}
```

**Response:**
```json
{
  "id": "node:xyz789",
  "type": "PERSON",
  "properties": { "fullName": "Alice Smith", "email": "alice.smith@newcompany.com" },
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

## Ontology Mutation Tools

### create_type
Create a new type in the ontology with optional properties.

```json
{
  "tool": "create_type",
  "arguments": {
    "name": "PRODUCT",
    "description": "A product manufactured and sold by a company",
    "properties": [
      { "name": "NAME", "description": "Product name", "dataType": "STRING" },
      { "name": "CATEGORY", "description": "Product category", "dataType": "STRING" },
      { "name": "RELEASE_DATE", "description": "Release date", "dataType": "DATE" },
      { "name": "PRICE", "description": "Product price in USD", "dataType": "NUMBER" }
    ]
  }
}
```

**Response:**
```json
{
  "name": "PRODUCT",
  "description": "A product manufactured and sold by a company",
  "properties": [
    { "name": "NAME", "description": "Product name", "dataType": "STRING" },
    { "name": "CATEGORY", "description": "Product category", "dataType": "STRING" },
    { "name": "RELEASE_DATE", "description": "Release date", "dataType": "DATE" },
    { "name": "PRICE", "description": "Product price in USD", "dataType": "NUMBER" }
  ]
}
```

### create_relation_type
Create a new relation type in the ontology. Source and target types must already exist.

```json
{
  "tool": "create_relation_type",
  "arguments": {
    "name": "MANUFACTURES",
    "description": "Indicates that a company manufactures a product",
    "sourceType": "COMPANY",
    "targetType": "PRODUCT"
  }
}
```

**Response:**
```json
{
  "name": "MANUFACTURES",
  "description": "Indicates that a company manufactures a product",
  "sourceType": "COMPANY",
  "targetType": "PRODUCT"
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

### get_list_definition
Get the definition of a list including its filter criteria.

```json
{
  "tool": "get_list_definition",
  "arguments": { "name": "TECH_EMPLOYEES" }
}
```

**Response:**
```json
{
  "name": "TECH_EMPLOYEES",
  "description": "People employed at tech companies",
  "targetType": "PERSON",
  "filter": {
    "operator": "HAS_RELATION",
    "relationType": "EMPLOYED_BY",
    "targetFilter": { "operator": "CONTAINS", "field": "name", "value": "Tech" }
  },
  "validAt": "2026-01-01T00:00:00Z",
  "invalidAt": null
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

## Extending the Ontology Example

Agent task: "Track products manufactured by companies"

```
1. get_ontology_summary()
   → Shows current counts: 2 types, 1 relation, 0 lists

2. search_concepts(query: "product merchandise goods")
   → No matching types found - need to create one

3. create_type(
     name: "PRODUCT",
     description: "A product manufactured and sold by a company",
     properties: [
       { name: "NAME", description: "Product name", dataType: "STRING" },
       { name: "CATEGORY", description: "Product category", dataType: "STRING" },
       { name: "RELEASE_DATE", description: "Release date", dataType: "DATE" }
     ]
   )
   → Creates PRODUCT type with properties

4. create_relation_type(
     name: "MANUFACTURES",
     description: "Indicates that a company manufactures a product",
     sourceType: "COMPANY",
     targetType: "PRODUCT"
   )
   → Creates MANUFACTURES relation

5. find_ontology_paths(fromType: "PERSON", toType: "PRODUCT")
   → Shows: PERSON --EMPLOYED_BY--> COMPANY --MANUFACTURES--> PRODUCT

6. create_entity(type: "PRODUCT", properties: { name: "iPhone 16", category: "Smartphone" })
   → Creates the product

7. find_entities(type: "COMPANY", filter: { operator: "CONTAINS", field: "name", value: "Apple" })
   → Finds Apple's node ID

8. link_entities(fromId: "node:apple", relationType: "MANUFACTURES", toId: "node:iphone16")
   → Links Apple to iPhone 16
```

Now agents can traverse: "Find all products made by companies that employ Alice"

## Common Patterns & Gotchas

### Pattern 1: Indirect Relationships (Graph Traversal)

**Problem**: Agent only checks direct relationships and misses indirect connections.

**Scenario**: "Was Luca involved in the iPhone 17 launch?"

❌ **Wrong approach** - only checking direct relationships:
```
get_relationships("node:luca")  
→ No direct MANUFACTURES relationship to iPhone 17
→ Agent concludes: "No connection found"
```

✅ **Correct approach** - traverse the graph:
```
1. get_relationships("node:luca")
   → Finds: Luca --EMPLOYED_BY--> Apple (invalidAt: 2024-12-31)

2. get_relationships("node:apple", direction: "OUTGOING")
   → Finds: Apple --MANUFACTURES--> iPhone 17e (validAt: 2025-09-01)

3. Compare temporal data:
   → Luca left Apple (2024) BEFORE iPhone 17e was created (2025)
   → Conclusion: Luca was NOT involved in iPhone 17 launch
```

Or use `find_path` directly:
```
find_path(fromId: "node:luca", toId: "node:iphone17e", maxDepth: 3)
→ Returns: Luca --EMPLOYED_BY--> Apple --MANUFACTURES--> iPhone 17e
→ Then check temporal validity on each edge
```

### Pattern 2: Temporal Reasoning

**Problem**: Agent ignores validAt/invalidAt timestamps on relationships.

**Key insight**: Relationships have time bounds!
- `validAt`: When the relationship became true
- `invalidAt`: When the relationship ended (null = still active)

**Example**: "Who was CFO of Apple in 2020?"
```
1. find_entities("COMPANY", filter: {"operator": "CONTAINS", "field": "NAME", "value": "Apple"})
2. get_relationships("node:apple", direction: "INCOMING")
3. Filter results where:
   - relationType = "EMPLOYED_BY" 
   - properties.title = "CFO"
   - validAt <= "2020-06-01" AND (invalidAt IS NULL OR invalidAt > "2020-06-01")
```

### Pattern 3: Schema Discovery Before Querying

**Problem**: Agent queries blindly without understanding the ontology.

✅ **Best practice** - always start with discovery:
```
1. get_ontology_summary()           → See what exists
2. search_concepts("your topic")    → Find relevant types/relations
3. get_type_info("TYPE_NAME")       → See properties and relations
4. find_ontology_paths("A", "B")    → Understand how types connect
5. THEN query with find_entities()
```

### Pattern 4: Finding Connections Between Any Two Entities

**Use `find_path`** when you need to know HOW two entities are connected:

```
find_path(fromId: "node:alice", toId: "node:techcorp", maxDepth: 4)
```

This returns ALL paths connecting them, showing the relationship chain.

### Anti-Pattern: Assuming No Relationship Means No Connection

**Wrong**: "get_relationships returned nothing relevant, so there's no connection"

**Right**: Always consider:
1. Indirect paths through intermediate entities
2. The ontology structure (`find_ontology_paths` shows possible routes)
3. Temporal validity of relationships


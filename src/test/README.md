# Integration Tests

Comprehensive integration tests for the Atlas GraphQL API.

## Setup

Tests require a running SurrealDB instance. Configure via environment variables:

```bash
export SURREAL_URL="http://127.0.0.1:8000/rpc"
export SURREAL_USER="root"
export SURREAL_PASS="root"
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Test Structure

### `testHelpers.ts`
- `setupTestDatabase()` - Creates isolated test database with bootstrap
- `teardownTestDatabase()` - Cleans up test database
- `graphqlQuery()` - Helper for executing GraphQL queries

### `integration.test.ts`
Comprehensive test suite covering:

1. **Bootstrap**
   - Ontology loading from JSON files
   - Type and relation definitions

2. **Node Mutations and Queries**
   - Create nodes
   - Query by type
   - Query by ID
   - Filter by properties

3. **Edge Mutations and Queries**
   - Create edges by node IDs
   - Create edges by node references
   - Traverse relationships

4. **List Definitions and Queries**
   - Define lists with filters
   - Query list members
   - NOT operator
   - targetFilter for relationship filtering

5. **Validation**
   - Reject undefined types
   - Reject undefined properties
   - Reject invalid relation types
   - Reject type mismatches

6. **Temporal Queries**
   - Query at specific time points
   - Invalidate nodes
   - Temporal window validation

7. **Ontology Search**
   - Semantic search by description

## Test Isolation

Each test suite gets its own isolated namespace/database:
- Format: `test_{timestamp}`
- Automatically cleaned up after tests
- Bootstrap runs automatically before tests

## Notes

- Tests use the actual SurrealDB connection (not mocked)
- Each test run creates a fresh database
- Bootstrap is enabled by default in tests
- Tests verify both success and failure cases


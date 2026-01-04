/**
 * GraphQL Client
 * Handles all GraphQL queries to the Atlas backend
 */

export class GraphQLClient {
  constructor(endpoint = '/graphql') {
    this.endpoint = endpoint;
  }

  async query(queryString, variables = {}) {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: queryString,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return result.data;
    } catch (error) {
      console.error('GraphQL query error:', error);
      throw error;
    }
  }

  async fetchOntologySummary() {
    const query = `
      query {
        ontologySummary {
          typeCount
          relationCount
          listCount
        }
      }
    `;
    return this.query(query);
  }

  async fetchAllTypes() {
    const query = `
      query {
        searchOntology(query: "entity", limit: 100) {
          types {
            type {
              name
              description
              properties {
                name
                description
                dataType
              }
            }
            score
          }
          relations {
            relation {
              name
              description
              sourceType {
                name
              }
              targetType {
                name
              }
            }
            score
          }
        }
      }
    `;
    return this.query(query);
  }

  async fetchTypeInfo(typeName) {
    const query = `
      query($typeName: String!) {
        type(name: $typeName) {
          name
          description
          properties {
            name
            description
            dataType
          }
          outgoingRelations {
            name
            targetType {
              name
            }
          }
          incomingRelations {
            name
            sourceType {
              name
            }
          }
        }
      }
    `;
    return this.query(query, { typeName });
  }

  async fetchInstancesByType(type, asOf = null, limit = 100, includeHistorical = false) {
    const query = `
      query($type: String!, $asOf: DateTime, $limit: Int, $includeHistorical: Boolean) {
        nodes(type: $type, asOf: $asOf, limit: $limit) {
          id
          type
          properties
          validAt
          invalidAt
          relationships(asOf: $asOf, includeHistorical: $includeHistorical) {
            id
            relationType
            direction
            validAt
            invalidAt
            otherNode {
              id
              type
              properties
            }
          }
        }
      }
    `;
    return this.query(query, { type, asOf, limit, includeHistorical });
  }

  async fetchEntity(id, asOf = null) {
    const query = `
      query($id: ID!, $asOf: DateTime) {
        node(id: $id) {
          id
          type
          properties
          validAt
          invalidAt
          relationships(asOf: $asOf) {
            id
            relationType
            direction
            validAt
            invalidAt
            otherNode {
              id
              type
              properties
            }
          }
        }
      }
    `;
    return this.query(query, { id, asOf });
  }

  async fetchAllInstances(asOf = null, limit = 100, includeHistorical = false) {
    try {
      // First, fetch all types
      const typesData = await this.fetchAllTypes();

      if (!typesData || !typesData.searchOntology || !typesData.searchOntology.types) {
        return [];
      }

      // Then fetch instances for each type
      const typeNames = typesData.searchOntology.types.map(hit => hit.type.name);

      const instancePromises = typeNames.map(typeName =>
        this.fetchInstancesByType(typeName, asOf, limit, includeHistorical)
          .then(result => result.nodes || [])
          .catch(error => {
            console.warn(`Failed to fetch instances for type ${typeName}:`, error);
            return [];
          })
      );

      const results = await Promise.all(instancePromises);
      return results.flat();
    } catch (error) {
      console.error('Error fetching all instances:', error);
      throw error;
    }
  }

  async findPath(fromNodeId, toNodeId, maxDepth = 3) {
    const query = `
      query($fromNodeId: ID!, $toNodeId: ID!, $maxDepth: Int) {
        findInstancePath(fromNodeId: $fromNodeId, toNodeId: $toNodeId, maxDepth: $maxDepth) {
          pathDescription
          depth
          edges {
            id
            relationType
            fromNode {
              id
              type
              properties
            }
            toNode {
              id
              type
              properties
            }
          }
        }
      }
    `;
    return this.query(query, { fromNodeId, toNodeId, maxDepth });
  }
}

/**
 * Storage adapter interface.
 * Abstracts the underlying database, allowing different backends
 * (SurrealDB, Neo4j, PostgreSQL, etc.) to be plugged in.
 */

import type {
  Entity,
  Relationship,
  ListDefinition,
  TypeDef,
  RelationTypeDef,
  PropertyDef,
  FilterDSL,
  OntologySummary,
  OntologyPath,
  InstancePath,
  Direction,
} from '../core/types.js';

// ============================================================================
// Storage Adapter Interface
// ============================================================================

/**
 * The main storage adapter interface.
 * Implementations must provide all methods for nodes, edges, lists, and ontology.
 */
export interface StorageAdapter {
  // -------------------------------------------------------------------------
  // Node Operations
  // -------------------------------------------------------------------------

  /**
   * Get a node by its ID at a specific point in time.
   */
  getNodeById(id: string, asOf: string): Promise<Entity | null>;

  /**
   * Get nodes of a specific type at a point in time.
   */
  getNodesByType(
    type: string,
    asOf: string,
    limit: number,
  ): Promise<Entity[]>;

  /**
   * Create or update a node.
   */
  upsertNode(input: {
    id?: string | null;
    type: string;
    properties: Record<string, unknown>;
    validAt: string;
    invalidAt?: string | null;
  }): Promise<Entity>;

  /**
   * Invalidate (soft delete) a record by setting its invalidAt timestamp.
   */
  invalidateRecord(id: string, invalidAt: string): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Edge Operations
  // -------------------------------------------------------------------------

  /**
   * Get edges connected to a node.
   * @param includeHistorical - When true, returns ALL edges regardless of temporal validity
   */
  getEdgesForNode(
    nodeId: string,
    direction: Direction,
    asOf: string,
    includeHistorical?: boolean,
  ): Promise<Relationship[]>;

  /**
   * Create or update an edge.
   */
  upsertEdge(input: {
    id?: string | null;
    relationType: string;
    fromId: string;
    toId: string;
    properties?: Record<string, unknown>;
    validAt: string;
  }): Promise<Relationship>;

  // -------------------------------------------------------------------------
  // List Operations
  // -------------------------------------------------------------------------

  /**
   * Get a list definition by name.
   */
  getListDefinitionByName(
    name: string,
    asOf: string,
  ): Promise<ListDefinition | null>;

  /**
   * Create or update a list definition.
   */
  upsertListDefinition(input: {
    name: string;
    description: string;
    targetType: string;
    filter: FilterDSL;
    validAt: string;
    invalidAt?: string | null;
  }): Promise<ListDefinition>;

  // -------------------------------------------------------------------------
  // Ontology Operations
  // -------------------------------------------------------------------------

  /**
   * Get a type definition by name.
   */
  getTypeByName(name: string): Promise<TypeDef | null>;

  /**
   * Get a relation type definition by name.
   */
  getRelationByName(name: string): Promise<RelationTypeDef | null>;

  /**
   * Get properties defined for a type.
   */
  getPropertiesForType(typeName: string): Promise<PropertyDef[]>;

  /**
   * Get outgoing relations from a type (where it's the source).
   */
  getOutgoingRelationsForType(typeName: string): Promise<RelationTypeDef[]>;

  /**
   * Get incoming relations to a type (where it's the target).
   */
  getIncomingRelationsForType(typeName: string): Promise<RelationTypeDef[]>;

  /**
   * Create or update a type definition.
   */
  upsertTypeDef(
    name: string,
    description: string,
    properties?: PropertyDef[],
  ): Promise<TypeDef>;

  /**
   * Create or update a relation type definition.
   */
  upsertRelationTypeDef(
    name: string,
    description: string,
    sourceType: string,
    targetType: string,
  ): Promise<RelationTypeDef>;

  /**
   * Search the ontology by semantic similarity.
   * Includes types, relations, and lists.
   */
  searchOntology(
    query: string,
    limit: number,
    asOf?: string,
  ): Promise<{
    types: Array<{ type: TypeDef; score: number; matchReason?: string }>;
    relations: Array<{ relation: RelationTypeDef; score: number; matchReason?: string }>;
    lists: Array<{ list: ListDefinition; score: number; matchReason?: string }>;
  }>;

  /**
   * Find paths between two types in the ontology graph.
   */
  findOntologyPaths(
    fromType: string,
    toType: string,
    maxDepth: number,
  ): Promise<OntologyPath[]>;

  /**
   * Find paths between two node instances.
   */
  findInstancePaths(
    fromNodeId: string,
    toNodeId: string,
    maxDepth: number,
  ): Promise<InstancePath[]>;

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  /**
   * Get a summary of the ontology (counts).
   */
  getOntologySummary(): Promise<OntologySummary>;

  /**
   * Check if the database is reachable and responsive.
   * Returns the backend type name on success, throws on failure.
   */
  healthCheck(): Promise<string>;
}

// ============================================================================
// Re-export types for convenience
// ============================================================================

export type {
  Entity,
  Relationship,
  ListDefinition,
  TypeDef,
  RelationTypeDef,
  PropertyDef,
  FilterDSL,
  OntologySummary,
  OntologyPath,
  InstancePath,
  Direction,
};


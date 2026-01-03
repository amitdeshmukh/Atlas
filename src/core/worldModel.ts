/**
 * WorldModel - Unified API for the world model.
 * This is the core business logic layer that both GraphQL and MCP interfaces use.
 */

import type { StorageAdapter } from '../adapters/types.js';
import type {
  Entity,
  Relationship,
  ListDefinition,
  TypeDef,
  RelationTypeDef,
  FilterDSL,
  OntologySearchResult,
  OntologyPath,
  InstancePath,
  OntologySummary,
  PropertyDef,
} from './types.js';
import {
  canonicalName,
  validateDescription,
  validateTemporalWindow,
} from './types.js';
import { filterEntities, type FilterContext } from './filterEvaluator.js';

/**
 * The WorldModel provides a unified API for interacting with the world model.
 * It handles validation, business logic, and delegates to the storage adapter.
 */
export class WorldModel {
  constructor(private adapter: StorageAdapter) {}

  // ==========================================================================
  // Discovery (Ontology Search)
  // ==========================================================================

  /**
   * Search the ontology by semantic similarity.
   * Used by agents to discover types, relations, and lists by meaning.
   */
  async searchConcepts(
    query: string,
    limit: number = 10,
    asOf?: string,
  ): Promise<OntologySearchResult> {
    const now = asOf ?? new Date().toISOString();
    const result = await this.adapter.searchOntology(query, limit, now);
    return {
      types: result.types.map((t) => ({
        type: t.type,
        score: t.score,
        matchReason: t.matchReason,
      })),
      relations: result.relations.map((r) => ({
        relation: r.relation,
        score: r.score,
        matchReason: r.matchReason,
      })),
      lists: result.lists.map((l) => ({
        list: l.list,
        score: l.score,
        matchReason: l.matchReason,
      })),
    };
  }

  /**
   * Get detailed information about a type.
   */
  async getTypeInfo(typeName: string): Promise<{
    type: TypeDef;
    properties: PropertyDef[];
    outgoingRelations: RelationTypeDef[];
    incomingRelations: RelationTypeDef[];
  } | null> {
    const type = await this.adapter.getTypeByName(typeName);
    if (!type) return null;

    const [properties, outgoingRelations, incomingRelations] = await Promise.all([
      this.adapter.getPropertiesForType(typeName),
      this.adapter.getOutgoingRelationsForType(typeName),
      this.adapter.getIncomingRelationsForType(typeName),
    ]);

    return { type, properties, outgoingRelations, incomingRelations };
  }

  /**
   * Get a relation type by name.
   */
  async getRelationInfo(relationName: string): Promise<RelationTypeDef | null> {
    return this.adapter.getRelationByName(relationName);
  }

  /**
   * Get ontology summary (counts).
   */
  async getOntologySummary(): Promise<OntologySummary> {
    return this.adapter.getOntologySummary();
  }

  // ==========================================================================
  // Entity Queries
  // ==========================================================================

  /**
   * Find entities of a type, optionally filtered.
   */
  async findEntities(
    type: string,
    filter?: FilterDSL | null,
    asOf?: string,
    limit: number = 100,
  ): Promise<Entity[]> {
    const now = asOf ?? new Date().toISOString();
    const canonical = canonicalName(type);
    const entities = await this.adapter.getNodesByType(canonical, now, limit);

    if (!filter) return entities;

    // Create filter context for evaluation
    const ctx: FilterContext = {
      getEdgesForNode: (nodeId, direction, at) =>
        this.adapter.getEdgesForNode(nodeId, direction, at),
      getNodeById: (id, at) => this.adapter.getNodeById(id, at),
    };

    return filterEntities(entities, filter, ctx, now);
  }

  /**
   * Get an entity by ID.
   */
  async getEntity(id: string, asOf?: string): Promise<Entity | null> {
    const now = asOf ?? new Date().toISOString();
    return this.adapter.getNodeById(id, now);
  }

  /**
   * Get relationships for an entity.
   */
  async getRelationships(
    entityId: string,
    direction: 'INCOMING' | 'OUTGOING' | 'BOTH' = 'BOTH',
    asOf?: string,
  ): Promise<Array<Relationship & { direction: 'INCOMING' | 'OUTGOING' }>> {
    const now = asOf ?? new Date().toISOString();
    const edges = await this.adapter.getEdgesForNode(entityId, direction, now);

    return edges.map((edge) => ({
      ...edge,
      direction: edge.fromId === entityId ? 'OUTGOING' : 'INCOMING',
    }));
  }

  // ==========================================================================
  // Entity Mutations
  // ==========================================================================

  /**
   * Create or update an entity.
   * Validates against the ontology before persisting.
   */
  async createEntity(
    type: string,
    properties: Record<string, unknown>,
    validAt?: string,
  ): Promise<Entity> {
    const now = validAt ?? new Date().toISOString();
    const canonical = canonicalName(type);

    // Validate type exists in ontology
    await this.validateTypeExists(canonical);

    // Validate properties are allowed for this type
    await this.validateProperties(canonical, properties);

    return this.adapter.upsertNode({
      type: canonical,
      properties,
      validAt: now,
    });
  }

  /**
   * Update an existing entity's properties.
   */
  async updateEntity(
    id: string,
    properties: Record<string, unknown>,
    validAt?: string,
  ): Promise<Entity> {
    const now = validAt ?? new Date().toISOString();
    const existing = await this.adapter.getNodeById(id, now);

    if (!existing) {
      throw new Error(`Entity "${id}" not found.`);
    }

    // Validate properties are allowed for this type
    await this.validateProperties(existing.type, properties);

    return this.adapter.upsertNode({
      id,
      type: existing.type,
      properties: { ...existing.properties, ...properties },
      validAt: now,
    });
  }

  /**
   * Create a relationship between two entities.
   * Validates against the ontology before persisting.
   */
  async linkEntities(
    fromId: string,
    relationType: string,
    toId: string,
    properties?: Record<string, unknown>,
    validAt?: string,
  ): Promise<Relationship> {
    const relationshipValidAt = validAt ?? new Date().toISOString();
    const canonical = canonicalName(relationType);

    // Validate entities exist using CURRENT time (not historical validAt)
    // This allows creating historical relationships for entities that exist now
    const currentTime = new Date().toISOString();
    const [fromNode, toNode] = await Promise.all([
      this.adapter.getNodeById(fromId, currentTime),
      this.adapter.getNodeById(toId, currentTime),
    ]);

    if (!fromNode) throw new Error(`From-node "${fromId}" not found.`);
    if (!toNode) throw new Error(`To-node "${toId}" not found.`);

    // Validate relation exists and types match
    await this.validateRelation(canonical, fromNode.type, toNode.type);

    return this.adapter.upsertEdge({
      relationType: canonical,
      fromId,
      toId,
      properties: properties ?? {},
      validAt: relationshipValidAt,
    });
  }

  /**
   * Invalidate (soft delete) an entity or relationship.
   */
  async invalidate(id: string, invalidAt?: string): Promise<boolean> {
    const targetInvalidAt = invalidAt ?? new Date().toISOString();

    // Validate temporal window for nodes
    // Always fetch with current time to get the current state
    const currentTime = new Date().toISOString();
    const node = await this.adapter.getNodeById(id, currentTime);
    if (node) {
      validateTemporalWindow(node.validAt, targetInvalidAt);
    }

    return this.adapter.invalidateRecord(id, targetInvalidAt);
  }

  // ==========================================================================
  // List Operations
  // ==========================================================================

  /**
   * Define a new list (dynamic predicate).
   */
  async defineList(
    name: string,
    description: string,
    targetType: string,
    filter: FilterDSL,
    validAt?: string,
  ): Promise<ListDefinition> {
    validateDescription(description);
    const now = validAt ?? new Date().toISOString();
    const canonical = canonicalName(targetType);

    // Validate target type exists
    await this.validateTypeExists(canonical);

    return this.adapter.upsertListDefinition({
      name,
      description,
      targetType: canonical,
      filter,
      validAt: now,
    });
  }

  /**
   * Get list members by evaluating the list's predicate.
   */
  async getListMembers(listName: string, asOf?: string): Promise<Entity[]> {
    const now = asOf ?? new Date().toISOString();
    const def = await this.adapter.getListDefinitionByName(listName, now);

    if (!def) return [];

    return this.findEntities(def.targetType, def.filter, now, 10_000);
  }

  /**
   * Get a list definition by name.
   */
  async getListDefinition(name: string, asOf?: string): Promise<ListDefinition | null> {
    const now = asOf ?? new Date().toISOString();
    return this.adapter.getListDefinitionByName(name, now);
  }

  // ==========================================================================
  // Path Finding
  // ==========================================================================

  /**
   * Find paths between two types in the ontology.
   */
  async findOntologyPaths(
    fromType: string,
    toType: string,
    maxDepth: number = 3,
  ): Promise<OntologyPath[]> {
    return this.adapter.findOntologyPaths(fromType, toType, maxDepth);
  }

  /**
   * Find paths between two entity instances.
   */
  async findInstancePaths(
    fromNodeId: string,
    toNodeId: string,
    maxDepth: number = 3,
  ): Promise<InstancePath[]> {
    return this.adapter.findInstancePaths(fromNodeId, toNodeId, maxDepth);
  }

  // ==========================================================================
  // Ontology Mutations
  // ==========================================================================

  /**
   * Create or update a type in the ontology.
   */
  async upsertType(name: string, description: string): Promise<TypeDef> {
    validateDescription(description);
    return this.adapter.upsertTypeDef(name, description);
  }

  /**
   * Create or update a relation type in the ontology.
   */
  async upsertRelationType(
    name: string,
    description: string,
    sourceType: string,
    targetType: string,
  ): Promise<RelationTypeDef> {
    validateDescription(description);
    return this.adapter.upsertRelationTypeDef(name, description, sourceType, targetType);
  }

  // ==========================================================================
  // Validation Helpers
  // ==========================================================================

  private async validateTypeExists(type: string): Promise<void> {
    const typeDef = await this.adapter.getTypeByName(type);
    if (!typeDef) {
      throw new Error(
        `Type "${type}" is not defined in the ontology. Define it first with upsertType.`,
      );
    }
  }

  private async validateProperties(
    type: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    const allowedProps = await this.adapter.getPropertiesForType(type);
    const allowedNames = new Set(allowedProps.map((p) => p.name.toLowerCase()));

    const providedKeys = Object.keys(properties);
    const unknownKeys = providedKeys.filter((k) => !allowedNames.has(k.toLowerCase()));

    if (unknownKeys.length > 0) {
      const allowed = allowedProps.map((p) => p.name).join(', ') || '(none)';
      throw new Error(
        `Unknown properties for type "${type}": ${unknownKeys.join(', ')}. ` +
          `Allowed properties: ${allowed}.`,
      );
    }
  }

  private async validateRelation(
    relationType: string,
    fromNodeType: string,
    toNodeType: string,
  ): Promise<void> {
    const relationDef = await this.adapter.getRelationByName(relationType);
    if (!relationDef) {
      throw new Error(
        `RelationType "${relationType}" is not defined in the ontology. ` +
          `Define it first with upsertRelationType.`,
      );
    }

    if (relationDef.sourceType !== fromNodeType) {
      throw new Error(
        `RelationType "${relationType}" expects source type "${relationDef.sourceType}", ` +
          `but the from-node is of type "${fromNodeType}".`,
      );
    }

    if (relationDef.targetType !== toNodeType) {
      throw new Error(
        `RelationType "${relationType}" expects target type "${relationDef.targetType}", ` +
          `but the to-node is of type "${toNodeType}".`,
      );
    }
  }
}


/**
 * Filter evaluation logic for the FilterDSL.
 * This module is backend-agnostic - it evaluates filters against in-memory entities.
 */

import type { Entity, FilterDSL, Relationship } from './types.js';
import { canonicalName } from './types.js';

/**
 * Context needed for filter evaluation.
 * Provides access to related entities for HAS_RELATION evaluation.
 */
export interface FilterContext {
  /**
   * Get edges for a node, used for HAS_RELATION evaluation.
   */
  getEdgesForNode(
    nodeId: string,
    direction: 'BOTH',
    asOf: string,
  ): Promise<Relationship[]>;

  /**
   * Get a node by ID, used for targetFilter evaluation.
   */
  getNodeById(id: string, asOf: string): Promise<Entity | null>;
}

/**
 * Evaluates whether an entity matches a filter.
 *
 * @param entity - The entity to evaluate
 * @param filter - The filter to apply
 * @param ctx - Context for fetching related entities
 * @param asOf - Temporal point for relationship queries
 * @returns true if the entity matches the filter
 */
export async function matchesFilter(
  entity: Entity,
  filter: FilterDSL,
  ctx: FilterContext,
  asOf: string,
): Promise<boolean> {
  const op = filter.operator;

  switch (op) {
    case 'AND':
      return evaluateAnd(entity, filter.operands ?? [], ctx, asOf);

    case 'OR':
      return evaluateOr(entity, filter.operands ?? [], ctx, asOf);

    case 'NOT':
      return evaluateNot(entity, filter.operands ?? [], ctx, asOf);

    case 'EQUALS':
      return evaluateEquals(entity, filter.field, filter.value);

    case 'GT':
      return evaluateGt(entity, filter.field, filter.value);

    case 'LT':
      return evaluateLt(entity, filter.field, filter.value);

    case 'CONTAINS':
      return evaluateContains(entity, filter.field, filter.value);

    case 'HAS_RELATION':
      return evaluateHasRelation(entity, filter, ctx, asOf);

    default:
      // Unknown operator - default to true (permissive)
      return true;
  }
}

/**
 * Filters an array of entities by the given filter.
 */
export async function filterEntities(
  entities: Entity[],
  filter: FilterDSL,
  ctx: FilterContext,
  asOf: string,
): Promise<Entity[]> {
  const result: Entity[] = [];
  for (const entity of entities) {
    if (await matchesFilter(entity, filter, ctx, asOf)) {
      result.push(entity);
    }
  }
  return result;
}

// ============================================================================
// Operator Implementations
// ============================================================================

async function evaluateAnd(
  entity: Entity,
  operands: FilterDSL[],
  ctx: FilterContext,
  asOf: string,
): Promise<boolean> {
  const results = await Promise.all(
    operands.map((f) => matchesFilter(entity, f, ctx, asOf)),
  );
  return results.every(Boolean);
}

async function evaluateOr(
  entity: Entity,
  operands: FilterDSL[],
  ctx: FilterContext,
  asOf: string,
): Promise<boolean> {
  const results = await Promise.all(
    operands.map((f) => matchesFilter(entity, f, ctx, asOf)),
  );
  return results.some(Boolean);
}

async function evaluateNot(
  entity: Entity,
  operands: FilterDSL[],
  ctx: FilterContext,
  asOf: string,
): Promise<boolean> {
  const results = await Promise.all(
    operands.map((f) => matchesFilter(entity, f, ctx, asOf)),
  );
  return !results.some(Boolean);
}

function evaluateEquals(
  entity: Entity,
  field: string | null | undefined,
  value: unknown,
): boolean {
  if (!field) return true;
  return entity.properties[field] === value;
}

function evaluateGt(
  entity: Entity,
  field: string | null | undefined,
  value: unknown,
): boolean {
  if (!field) return true;
  const v = entity.properties[field] as number | undefined;
  const target = value as number | undefined;
  if (typeof v !== 'number' || typeof target !== 'number') return false;
  return v > target;
}

function evaluateLt(
  entity: Entity,
  field: string | null | undefined,
  value: unknown,
): boolean {
  if (!field) return true;
  const v = entity.properties[field] as number | undefined;
  const target = value as number | undefined;
  if (typeof v !== 'number' || typeof target !== 'number') return false;
  return v < target;
}

function evaluateContains(
  entity: Entity,
  field: string | null | undefined,
  value: unknown,
): boolean {
  if (!field) return true;
  const v = entity.properties[field];

  if (Array.isArray(v)) {
    return v.includes(value);
  }

  if (typeof v === 'string' && typeof value === 'string') {
    return v.includes(value);
  }

  return false;
}

async function evaluateHasRelation(
  entity: Entity,
  filter: FilterDSL,
  ctx: FilterContext,
  asOf: string,
): Promise<boolean> {
  const relationType = canonicalName(filter.relationType ?? '');
  if (!relationType) return false;

  const edges = await ctx.getEdgesForNode(entity.id, 'BOTH', asOf);
  const matchingEdges = edges.filter((edge) => edge.relationType === relationType);

  if (matchingEdges.length === 0) return false;

  // If no targetFilter, just check if relationship exists
  if (!filter.targetFilter) return true;

  // Check if ANY of the related nodes match the targetFilter
  for (const edge of matchingEdges) {
    const otherNodeId = edge.fromId === entity.id ? edge.toId : edge.fromId;
    const otherNode = await ctx.getNodeById(otherNodeId, asOf);

    if (otherNode && (await matchesFilter(otherNode, filter.targetFilter, ctx, asOf))) {
      return true;
    }
  }

  return false;
}


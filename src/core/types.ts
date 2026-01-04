/**
 * Core domain types for the Atlas system.
 * These types are backend-agnostic and represent the domain model.
 */

// ============================================================================
// Temporal Types
// ============================================================================

/**
 * Temporal window for all stateful entities.
 * All state in the system is temporal - nothing is ever deleted, only invalidated.
 */
export interface TemporalWindow {
  validAt: string; // ISO timestamp when this record became valid
  invalidAt: string | null; // ISO timestamp when this record was invalidated (null = still valid)
}

// ============================================================================
// Entity Types (World Model Instances)
// ============================================================================

/**
 * A node instance in the world model.
 * Examples: Alice (PERSON), TechCorp (COMPANY), iPhone (PRODUCT)
 */
export interface Entity extends TemporalWindow {
  id: string;
  type: string; // Canonical UPPERCASE type name
  properties: Record<string, unknown>;
}

/**
 * An edge/relationship instance between two entities.
 * Examples: Alice EMPLOYED_BY TechCorp, Bob PURCHASED iPhone
 */
export interface Relationship extends TemporalWindow {
  id: string;
  relationType: string; // Canonical UPPERCASE relation name
  fromId: string;
  toId: string;
  properties: Record<string, unknown>;
}

/**
 * Direction for edge traversal queries.
 */
export type Direction = 'INCOMING' | 'OUTGOING' | 'BOTH';

// ============================================================================
// Ontology Types (Schema as Data)
// ============================================================================

/**
 * A type definition in the ontology.
 * Defines what kinds of entities can exist (e.g., PERSON, COMPANY).
 */
export interface TypeDef {
  name: string; // Canonical UPPERCASE name
  description: string; // Human-readable description (required, min 10 chars)
  properties?: PropertyDef[]; // Allowed properties for this type
}

/**
 * A property definition for a type.
 */
export interface PropertyDef {
  name: string;
  description: string;
  dataType: string; // e.g., "string", "number", "boolean"
}

/**
 * A relation type definition in the ontology.
 * Defines what kinds of relationships can exist between types.
 */
export interface RelationTypeDef {
  name: string; // Canonical UPPERCASE name
  description: string;
  sourceType: string; // The type this relation originates from
  targetType: string; // The type this relation points to
}

// ============================================================================
// List Types (Dynamic Predicates)
// ============================================================================

/**
 * A list definition - a named, temporal predicate over entities.
 * Lists are NOT containers of IDs; they are dynamic queries.
 */
export interface ListDefinition extends TemporalWindow {
  name: string;
  description: string;
  targetType: string; // The entity type this list queries
  filter: FilterDSL;
}

// ============================================================================
// Filter DSL
// ============================================================================

/**
 * Filter operators for querying and defining lists.
 */
export type FilterOperator =
  | 'AND' // All operands must match
  | 'OR' // At least one operand must match
  | 'NOT' // None of the operands match
  | 'EQUALS' // Exact field match
  | 'GT' // Greater than (numeric)
  | 'LT' // Less than (numeric)
  | 'CONTAINS' // Substring (string) or element (array) match
  | 'HAS_RELATION'; // Has relationship of specified type

/**
 * The Filter Domain-Specific Language for composing queries.
 * 
 * Examples:
 * - { operator: "EQUALS", field: "email", value: "alice@example.com" }
 * - { operator: "CONTAINS", field: "name", value: "Tech" }
 * - { operator: "HAS_RELATION", relationType: "EMPLOYED_BY" }
 * - { operator: "AND", operands: [filter1, filter2] }
 * - { operator: "NOT", operands: [{ operator: "HAS_RELATION", relationType: "EMPLOYED_BY" }] }
 */
export interface FilterDSL {
  operator: FilterOperator;
  field?: string | null; // For EQUALS, GT, LT, CONTAINS
  value?: unknown; // The value to compare against
  operands?: FilterDSL[] | null; // For AND, OR, NOT
  relationType?: string | null; // For HAS_RELATION
  targetFilter?: FilterDSL | null; // For HAS_RELATION: filter on the related entity
}

// ============================================================================
// Search/Discovery Types
// ============================================================================

/**
 * A semantic search hit for types.
 */
export interface TypeSearchHit {
  type: TypeDef;
  score: number; // Semantic similarity score (0-1)
  matchReason?: string;
}

/**
 * A semantic search hit for relations.
 */
export interface RelationSearchHit {
  relation: RelationTypeDef;
  score: number;
  matchReason?: string;
}

/**
 * A semantic search hit for lists.
 */
export interface ListSearchHit {
  list: ListDefinition;
  score: number;
  matchReason?: string;
}

/**
 * Result of searching the ontology.
 * Includes types, relations, and lists - all discoverable by meaning.
 */
export interface OntologySearchResult {
  types: TypeSearchHit[];
  relations: RelationSearchHit[];
  lists: ListSearchHit[];
}

// ============================================================================
// Path Finding Types
// ============================================================================

/**
 * A step in an ontology path (type-to-type traversal).
 */
export interface OntologyPathStep {
  relation: RelationTypeDef;
  direction: 'OUTGOING' | 'INCOMING';
  targetType: string;
}

/**
 * A path through the ontology graph connecting two types.
 */
export interface OntologyPath {
  steps: OntologyPathStep[];
  pathDescription: string;
  depth: number;
}

/**
 * A path through the instance graph connecting two entities.
 */
export interface InstancePath {
  edges: Array<{
    id: string;
    relationType: string;
    fromId: string;
    toId: string;
    validAt: string;
    invalidAt: string | null;
  }>;
  pathDescription: string;
  depth: number;
}

// ============================================================================
// Summary Types
// ============================================================================

/**
 * Summary counts for the ontology/world model.
 */
export interface OntologySummary {
  typeCount: number;
  relationCount: number;
  listCount: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts a name to canonical UPPERCASE format.
 */
export function canonicalName(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * Validates that a description meets requirements (min 10 chars, no TODO/TBD).
 */
export function validateDescription(description: string): void {
  const value = description.trim();
  if (value.length < 10) {
    throw new Error(
      'Description must be at least 10 characters long for ontology elements and lists.',
    );
  }
  const upper = value.toUpperCase();
  if (upper.includes('TODO') || upper.includes('TBD')) {
    throw new Error('Description must not contain TODO or TBD placeholders.');
  }
}

/**
 * Validates that validAt < invalidAt when both are present.
 */
export function validateTemporalWindow(
  validAt: string,
  invalidAt: string | null | undefined,
): void {
  if (invalidAt == null) return;
  if (validAt >= invalidAt) {
    throw new Error(
      `Invalid temporal window: validAt (${validAt}) must be strictly before invalidAt (${invalidAt}).`,
    );
  }
}


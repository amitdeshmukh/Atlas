export type Direction = 'INCOMING' | 'OUTGOING' | 'BOTH';

export interface StoredNode {
  id: string;
  type: string; // canonical UPPERCASE
  properties: Record<string, unknown>;
  validAt: string; // ISO timestamp
  invalidAt: string | null;
}

export interface StoredEdge {
  id: string;
  relationType: string; // canonical UPPERCASE
  fromId: string;
  toId: string;
  properties: Record<string, unknown>;
  validAt: string;
  invalidAt: string | null;
}

export interface ListDefinitionRecord {
  name: string;
  description: string;
  targetType: string;
  filter: FilterDSL;
  validAt: string;
  invalidAt: string | null;
}

export interface FilterDSL {
  operator: FilterOperator;
  field?: string | null;
  value?: unknown;
  operands?: FilterDSL[] | null;
  relationType?: string | null;
  /** For HAS_RELATION: optional filter to apply on the related node */
  targetFilter?: FilterDSL | null;
}

export type FilterOperator =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'EQUALS'
  | 'GT'
  | 'LT'
  | 'CONTAINS'
  | 'HAS_RELATION';

export interface GraphDbAdapter {
  // Nodes
  getNodeById(id: string, asOf: string): Promise<StoredNode | null>;
  getNodesByType(
    type: string,
    asOf: string,
    limit: number,
    filter?: FilterDSL | null,
  ): Promise<StoredNode[]>;
  upsertNode(
    input: Omit<StoredNode, 'id'> & { id?: string | null },
  ): Promise<StoredNode>;
  invalidateRecord(id: string, invalidAt: string): Promise<boolean>;

  // Edges
  getEdgesForNode(
    nodeId: string,
    direction: Direction,
    asOf: string,
  ): Promise<StoredEdge[]>;
  upsertEdge(input: {
    id?: string | null;
    relationType: string;
    fromId: string;
    toId: string;
    properties?: Record<string, unknown>;
    validAt: string;
  }): Promise<StoredEdge>;

  // Lists
  getListDefinitionByName(
    name: string,
    asOf: string,
  ): Promise<ListDefinitionRecord | null>;
  upsertListDefinition(
    input: Omit<ListDefinitionRecord, 'validAt' | 'invalidAt'> & {
      validAt: string;
      invalidAt?: string | null;
    },
  ): Promise<ListDefinitionRecord>;

  // Ontology summary (counts only for now)
  getOntologySummary(): Promise<{
    typeCount: number;
    relationCount: number;
    listCount: number;
  }>;
}



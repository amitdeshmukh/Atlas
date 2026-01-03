/**
 * Data Transformer
 * Converts GraphQL responses to Cytoscape-compatible graph format
 */

export class DataTransformer {
  /**
   * Transform ontology schema (types and relations) to Cytoscape graph
   */
  transformOntologyToGraph(searchOntologyData) {
    if (!searchOntologyData || !searchOntologyData.types || !searchOntologyData.relations) {
      return { nodes: [], edges: [] };
    }

    const nodes = searchOntologyData.types.map(hit => ({
      data: {
        id: hit.type.name,
        label: hit.type.name,
        type: 'ontology-type',
        description: hit.type.description || '',
        properties: hit.type.properties || [],
        nodeType: 'schema',
      },
      classes: 'ontology-type',
    }));

    const edges = searchOntologyData.relations.map((hit, index) => ({
      data: {
        id: `ontology-edge-${index}`,
        source: hit.relation.sourceType.name,
        target: hit.relation.targetType.name,
        label: hit.relation.name,
        type: 'ontology-relation',
        description: hit.relation.description || '',
        nodeType: 'schema',
      },
      classes: 'ontology-relation',
    }));

    return { nodes, edges };
  }

  /**
   * Transform instance data (entities and relationships) to Cytoscape graph
   */
  transformInstancesToGraph(nodesData) {
    if (!nodesData || !Array.isArray(nodesData)) {
      return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];
    const seenEdges = new Set();

    for (const node of nodesData) {
      // Create node
      const label = this._generateNodeLabel(node);
      nodes.push({
        data: {
          id: node.id,
          label,
          type: node.type,
          properties: node.properties || {},
          validAt: node.validAt,
          invalidAt: node.invalidAt,
          nodeType: 'instance',
        },
        classes: `instance-node type-${node.type.toLowerCase()}`,
      });

      // Create edges from relationships
      if (node.relationships && Array.isArray(node.relationships)) {
        for (const rel of node.relationships) {
          const edgeId = rel.id || `${node.id}-${rel.relationType}-${rel.otherNode.id}`;

          // Avoid duplicate edges
          if (seenEdges.has(edgeId)) {
            continue;
          }
          seenEdges.add(edgeId);

          // Determine source and target based on direction
          const source = rel.direction === 'OUTGOING' ? node.id : rel.otherNode.id;
          const target = rel.direction === 'OUTGOING' ? rel.otherNode.id : node.id;

          edges.push({
            data: {
              id: edgeId,
              source,
              target,
              label: rel.relationType,
              type: rel.relationType,
              validAt: rel.validAt,
              invalidAt: rel.invalidAt,
              nodeType: 'instance',
            },
            classes: `instance-edge relation-${rel.relationType.toLowerCase()}`,
          });

          // Also add the other node if it's not already in our nodes list
          if (!nodes.find(n => n.data.id === rel.otherNode.id)) {
            const otherLabel = this._generateNodeLabel(rel.otherNode);
            nodes.push({
              data: {
                id: rel.otherNode.id,
                label: otherLabel,
                type: rel.otherNode.type,
                properties: rel.otherNode.properties || {},
                nodeType: 'instance',
              },
              classes: `instance-node type-${rel.otherNode.type.toLowerCase()}`,
            });
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Apply temporal filter to graph elements based on asOf timestamp
   */
  applyTemporalFilter(elements, asOf) {
    if (!asOf) {
      return elements;
    }

    const asOfDate = new Date(asOf);

    const filtered = {
      nodes: elements.nodes.filter(node => this._isValidAt(node.data, asOfDate)),
      edges: elements.edges.filter(edge => this._isValidAt(edge.data, asOfDate)),
    };

    // Mark temporally invalid elements with reduced opacity
    filtered.nodes.forEach(node => {
      if (node.data.invalidAt && new Date(node.data.invalidAt) <= asOfDate) {
        node.classes = (node.classes || '') + ' temporal-invalid';
      }
    });

    filtered.edges.forEach(edge => {
      if (edge.data.invalidAt && new Date(edge.data.invalidAt) <= asOfDate) {
        edge.classes = (edge.classes || '') + ' temporal-invalid';
      }
    });

    return filtered;
  }

  /**
   * Check if an element is valid at a given timestamp
   */
  _isValidAt(data, asOfDate) {
    if (!data.validAt) {
      return true; // No temporal data, assume valid
    }

    const validAt = new Date(data.validAt);
    const invalidAt = data.invalidAt ? new Date(data.invalidAt) : null;

    // Element is valid if:
    // - validAt <= asOf
    // - invalidAt is null OR invalidAt > asOf
    return validAt <= asOfDate && (!invalidAt || invalidAt > asOfDate);
  }

  /**
   * Generate a human-readable label for a node from its properties
   */
  _generateNodeLabel(node) {
    if (!node.properties) {
      return node.id;
    }

    // Try common name properties (case-insensitive)
    const nameProps = ['name', 'fullName', 'title', 'label', 'displayName', 'preferred_name', 'preferredName'];
    const propsLower = this._getPropsLowerMap(node.properties);
    
    for (const prop of nameProps) {
      const value = propsLower[prop.toLowerCase()];
      if (value) {
        return String(value);
      }
    }

    // Fall back to first non-location property value or ID
    const locationKeys = ['location', 'current_location', 'address', 'city', 'country'];
    for (const [key, value] of Object.entries(node.properties)) {
      if (!locationKeys.includes(key.toLowerCase()) && value) {
        return String(value).substring(0, 30);
      }
    }

    return node.id;
  }

  /**
   * Create a lowercase key map for case-insensitive property lookup
   */
  _getPropsLowerMap(properties) {
    const map = {};
    for (const [key, value] of Object.entries(properties)) {
      map[key.toLowerCase()] = value;
    }
    return map;
  }

  /**
   * Filter nodes by type
   */
  filterByTypes(elements, selectedTypes) {
    if (!selectedTypes || selectedTypes.length === 0) {
      return elements;
    }

    const typeSet = new Set(selectedTypes);
    const filteredNodes = elements.nodes.filter(node =>
      typeSet.has(node.data.type)
    );

    // Get IDs of filtered nodes
    const nodeIds = new Set(filteredNodes.map(n => n.data.id));

    // Only keep edges where both source and target are in filtered nodes
    const filteredEdges = elements.edges.filter(edge =>
      nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }

  /**
   * Search nodes by ID or property values
   */
  searchNodes(elements, searchTerm) {
    if (!searchTerm) {
      return elements.nodes.map(n => n.data.id);
    }

    const term = searchTerm.toLowerCase();
    return elements.nodes
      .filter(node => {
        // Search in ID
        if (node.data.id.toLowerCase().includes(term)) {
          return true;
        }

        // Search in label
        if (node.data.label && node.data.label.toLowerCase().includes(term)) {
          return true;
        }

        // Search in properties
        if (node.data.properties) {
          const propsString = JSON.stringify(node.data.properties).toLowerCase();
          if (propsString.includes(term)) {
            return true;
          }
        }

        return false;
      })
      .map(n => n.data.id);
  }
}

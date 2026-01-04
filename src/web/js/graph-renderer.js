/**
 * Graph Renderer
 * Handles Cytoscape.js initialization and graph rendering
 * Modern dark theme styling with glowing effects
 */

export class GraphRenderer {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    this.cy = null;
    this.currentLayout = 'cose';
    this.initCytoscape();
  }

  initCytoscape() {
    this.cy = cytoscape({
      container: this.container,
      style: this.getStylesheet(),
      layout: { name: this.currentLayout },
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });

    this.setupEventHandlers();
  }

  getStylesheet() {
    // Color palette matching the CSS theme
    const colors = {
      bgDeep: '#0a0e14',
      bgPrimary: '#0f1419',
      bgElevated: '#1a2330',
      accentPrimary: '#00d4aa',
      accentSecondary: '#00b4d8',
      accentTertiary: '#7c3aed',
      accentWarning: '#fbbf24',
      textPrimary: '#e6edf3',
      textSecondary: '#8b949e',
      textMuted: '#6e7681',
      borderDefault: 'rgba(255, 255, 255, 0.1)',
    };

    return [
      // === BASE NODE STYLES ===
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-family': 'Outfit, -apple-system, sans-serif',
          'font-size': '11px',
          'font-weight': '500',
          'color': colors.textPrimary,
          'text-outline-color': colors.bgDeep,
          'text-outline-width': 2,
          'background-color': colors.accentSecondary,
          'background-opacity': 0.9,
          'width': '56px',
          'height': '56px',
          'text-wrap': 'ellipsis',
          'text-max-width': '70px',
          'border-width': 2,
          'border-color': colors.accentSecondary,
          'border-opacity': 0.8,
          'overlay-padding': '6px',
          'transition-property': 'background-color, border-color, width, height, border-width',
          'transition-duration': '0.2s',
          'transition-timing-function': 'ease-out',
        },
      },

      // === ONTOLOGY TYPE NODES (Schema View) ===
      {
        selector: 'node.ontology-type',
        style: {
          'shape': 'round-rectangle',
          'background-color': colors.accentTertiary,
          'background-opacity': 0.85,
          'border-color': colors.accentTertiary,
          'width': '90px',
          'height': '44px',
          'font-weight': '600',
          'font-size': '12px',
          'text-outline-width': 2.5,
        },
      },

      // === INSTANCE NODES ===
      {
        selector: 'node.instance-node',
        style: {
          'shape': 'ellipse',
          'background-color': colors.accentPrimary,
          'background-opacity': 0.85,
          'border-color': colors.accentPrimary,
        },
      },

      // === NODE HOVER STATE ===
      {
        selector: 'node:active',
        style: {
          'overlay-color': colors.accentPrimary,
          'overlay-padding': 8,
          'overlay-opacity': 0.15,
        },
      },

      // === NODE SELECTED STATE ===
      {
        selector: 'node:selected',
        style: {
          'border-width': 3,
          'border-color': colors.accentWarning,
          'border-opacity': 1,
          'background-color': colors.accentWarning,
          'background-opacity': 0.9,
          'color': colors.bgDeep,
          'text-outline-color': 'transparent',
          'text-outline-width': 0,
          'font-weight': '600',
          'z-index': 999,
        },
      },

      // === TEMPORAL INVALID NODES (Faded) ===
      {
        selector: 'node.temporal-invalid',
        style: {
          'opacity': 0.35,
          'background-color': colors.textMuted,
          'border-color': colors.textMuted,
        },
      },

      // === BASE EDGE STYLES ===
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': colors.textMuted,
          'line-opacity': 0.6,
          'target-arrow-color': colors.textMuted,
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-family': 'JetBrains Mono, monospace',
          'font-size': '9px',
          'font-weight': '400',
          'color': colors.textSecondary,
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
          'text-outline-color': colors.bgDeep,
          'text-outline-width': 2,
          'text-opacity': 0.8,
          'transition-property': 'line-color, target-arrow-color, width, line-opacity',
          'transition-duration': '0.2s',
        },
      },

      // === ONTOLOGY RELATION EDGES (Schema View) ===
      {
        selector: 'edge.ontology-relation',
        style: {
          'width': 2,
          'line-color': colors.accentTertiary,
          'line-opacity': 0.7,
          'target-arrow-color': colors.accentTertiary,
          'line-style': 'solid',
        },
      },

      // === INSTANCE EDGES ===
      {
        selector: 'edge.instance-edge',
        style: {
          'width': 1.5,
          'line-color': colors.accentPrimary,
          'line-opacity': 0.5,
          'target-arrow-color': colors.accentPrimary,
        },
      },

      // === EDGE HOVER STATE ===
      {
        selector: 'edge:active',
        style: {
          'width': 3,
          'line-opacity': 1,
          'overlay-color': colors.accentPrimary,
          'overlay-padding': 4,
          'overlay-opacity': 0.1,
        },
      },

      // === EDGE SELECTED STATE ===
      {
        selector: 'edge:selected',
        style: {
          'width': 3,
          'line-color': colors.accentWarning,
          'line-opacity': 1,
          'target-arrow-color': colors.accentWarning,
          'z-index': 999,
        },
      },

      // === TEMPORAL INVALID EDGES ===
      {
        selector: 'edge.temporal-invalid',
        style: {
          'opacity': 0.25,
          'line-color': colors.textMuted,
          'target-arrow-color': colors.textMuted,
          'line-style': 'dashed',
        },
      },

      // === HIGHLIGHTED ELEMENTS (Search/Path) ===
      {
        selector: '.highlighted',
        style: {
          'background-color': colors.accentPrimary,
          'background-opacity': 1,
          'line-color': colors.accentPrimary,
          'line-opacity': 1,
          'target-arrow-color': colors.accentPrimary,
          'border-color': colors.accentPrimary,
          'border-width': 3,
          'z-index': 9999,
        },
      },

      // === DIMMED ELEMENTS (when something is highlighted) ===
      {
        selector: '.dimmed',
        style: {
          'opacity': 0.2,
        },
      },

      // === TYPE-SPECIFIC COLORS FOR INSTANCES ===
      // Person type
      {
        selector: 'node[type="Person"]',
        style: {
          'background-color': '#f472b6', // Pink
          'border-color': '#f472b6',
        },
      },
      // Company type
      {
        selector: 'node[type="Company"]',
        style: {
          'background-color': '#60a5fa', // Blue
          'border-color': '#60a5fa',
        },
      },
      // Project type
      {
        selector: 'node[type="Project"]',
        style: {
          'background-color': '#34d399', // Green
          'border-color': '#34d399',
        },
      },
      // Event type
      {
        selector: 'node[type="Event"]',
        style: {
          'background-color': '#fbbf24', // Amber
          'border-color': '#fbbf24',
        },
      },
      // Document type
      {
        selector: 'node[type="Document"]',
        style: {
          'background-color': '#a78bfa', // Purple
          'border-color': '#a78bfa',
        },
      },
      // Location type
      {
        selector: 'node[type="Location"]',
        style: {
          'background-color': '#f87171', // Red
          'border-color': '#f87171',
        },
      },
    ];
  }

  setupEventHandlers() {
    // Node click handler
    this.cy.on('tap', 'node', (event) => {
      const node = event.target;
      this.onNodeClick(node.data());
    });

    // Edge click handler
    this.cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      this.onEdgeClick(edge.data());
    });

    // Background click handler (deselect)
    this.cy.on('tap', (event) => {
      if (event.target === this.cy) {
        this.onBackgroundClick();
      }
    });

    // Hover effects for better interactivity
    this.cy.on('mouseover', 'node', (event) => {
      event.target.style('cursor', 'pointer');
    });

    this.cy.on('mouseout', 'node', () => {
      // Reset cursor handled by Cytoscape
    });
  }

  renderGraph(elements, layout = null) {
    if (!elements || (!elements.nodes && !elements.edges)) {
      console.warn('No elements to render');
      return;
    }

    // Clear existing graph
    this.cy.elements().remove();

    // Add new elements
    const allElements = [
      ...(elements.nodes || []),
      ...(elements.edges || []),
    ];

    if (allElements.length === 0) {
      console.warn('No nodes or edges to render');
      return;
    }

    this.cy.add(allElements);

    // Apply layout
    const layoutName = layout || this.currentLayout;
    this.applyLayout(layoutName);
  }

  applyLayout(layoutName) {
    this.currentLayout = layoutName;

    const layoutOptions = {
      cose: {
        name: 'cose',
        animate: true,
        animationDuration: 600,
        animationEasing: 'ease-out',
        nodeRepulsion: 10000,
        idealEdgeLength: 120,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
        padding: 50,
      },
      circle: {
        name: 'circle',
        animate: true,
        animationDuration: 600,
        animationEasing: 'ease-out',
        padding: 50,
      },
      breadthfirst: {
        name: 'breadthfirst',
        animate: true,
        animationDuration: 600,
        animationEasing: 'ease-out',
        directed: true,
        spacingFactor: 1.5,
        padding: 50,
      },
      grid: {
        name: 'grid',
        animate: true,
        animationDuration: 600,
        animationEasing: 'ease-out',
        rows: undefined,
        cols: undefined,
        padding: 50,
      },
      concentric: {
        name: 'concentric',
        animate: true,
        animationDuration: 600,
        animationEasing: 'ease-out',
        minNodeSpacing: 100,
        padding: 50,
      },
    };

    const layout = this.cy.layout(layoutOptions[layoutName] || layoutOptions.cose);
    layout.run();
  }

  highlightNodes(nodeIds) {
    // Remove previous highlights
    this.cy.elements().removeClass('highlighted dimmed');

    // Highlight specified nodes
    if (nodeIds && nodeIds.length > 0) {
      // Dim all elements first
      this.cy.elements().addClass('dimmed');
      
      nodeIds.forEach(id => {
        const node = this.cy.getElementById(id);
        if (node.length > 0) {
          node.removeClass('dimmed').addClass('highlighted');
          // Also highlight connected edges
          node.connectedEdges().removeClass('dimmed').addClass('highlighted');
        }
      });

      // Center on highlighted nodes
      const highlightedNodes = this.cy.$('.highlighted');
      if (highlightedNodes.length > 0) {
        this.cy.animate({
          fit: {
            eles: highlightedNodes,
            padding: 80,
          },
          duration: 400,
          easing: 'ease-out',
        });
      }
    }
  }

  clearHighlights() {
    this.cy.elements().removeClass('highlighted dimmed');
  }

  fitGraph() {
    this.cy.animate({
      fit: {
        padding: 50,
      },
      duration: 400,
      easing: 'ease-out',
    });
  }

  // Event handlers (to be overridden by app)
  onNodeClick(nodeData) {
    console.log('Node clicked:', nodeData);
  }

  onEdgeClick(edgeData) {
    console.log('Edge clicked:', edgeData);
  }

  onBackgroundClick() {
    console.log('Background clicked');
  }

  // Export graph as PNG
  exportPNG() {
    const png = this.cy.png({
      output: 'blob',
      bg: '#0a0e14', // Match dark theme
      full: true,
      scale: 2, // Higher resolution
    });

    const url = URL.createObjectURL(png);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-graph.png';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export graph data as JSON
  exportJSON() {
    const data = this.cy.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-graph.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  destroy() {
    if (this.cy) {
      this.cy.destroy();
    }
  }
}

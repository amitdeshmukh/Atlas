/**
 * Atlas Visualizer - Main Application
 * Orchestrates all components and manages application state
 * Version: 5
 */

import { GraphQLClient } from './graphql-client.js';
import { GraphRenderer } from './graph-renderer.js';
import { DataTransformer } from './data-transformer.js';
import { Timeline } from './timeline.js';
import { UIControls } from './ui-controls.js';

console.log('%c[Atlas] Visualizer v5 loaded', 'color: #00d4aa; font-weight: bold;');

class VisualizerApp {
  constructor() {
    // Initialize components
    this.client = new GraphQLClient('/graphql');
    this.renderer = new GraphRenderer('#cy-container');
    this.transformer = new DataTransformer();
    this.timeline = new Timeline();
    this.ui = new UIControls();

    // Application state
    this.currentView = 'schema';
    this.currentAsOf = null;
    this.currentElements = null;
    this.allTypes = [];

    // Bind event handlers
    this.setupEventHandlers();
  }

  async init() {
    try {
      this.ui.showLoading('Connecting to Atlas...');

      // Test connection
      await this.testConnection();

      // Load initial view (schema)
      await this.loadSchemaView();

      // Setup config modal
      this.setupConfigModal();

      this.ui.hideLoading();
    } catch (error) {
      console.error('Initialization error:', error);
      this.ui.showError(`Failed to initialize: ${error.message}`);
      this.ui.setConnectionStatus('error', 'Connection failed');
    }
  }

  setupConfigModal() {
    const configBtn = document.getElementById('config-btn');
    const configModal = document.getElementById('config-modal');
    const closeModalBtn = document.getElementById('close-config-modal');
    const connectBtn = document.getElementById('connect-btn');
    const resetBtn = document.getElementById('reset-config-btn');
    const configError = document.getElementById('config-error');

    // Store original config for reset
    this.originalConfig = null;

    // Open modal
    configBtn.addEventListener('click', async () => {
      await this.loadConfig();
      configModal.classList.remove('hidden');
      configError.classList.add('hidden');
    });

    // Close modal
    closeModalBtn.addEventListener('click', () => {
      configModal.classList.add('hidden');
      configError.classList.add('hidden');
    });

    // Close on background click
    configModal.addEventListener('click', (e) => {
      if (e.target === configModal) {
        configModal.classList.add('hidden');
        configError.classList.add('hidden');
      }
    });

    // Connect button
    connectBtn.addEventListener('click', async () => {
      await this.handleConnect();
    });

    // Reset button
    resetBtn.addEventListener('click', async () => {
      await this.loadConfig();
      configError.classList.add('hidden');
    });
  }

  async loadConfig() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();

      // Store original config
      this.originalConfig = config.surreal;

      document.getElementById('config-url').value = config.surreal.url;
      document.getElementById('config-namespace').value = config.surreal.namespace;
      document.getElementById('config-database').value = config.surreal.database;
      document.getElementById('config-username').value = config.surreal.username;
      document.getElementById('config-password').value = ''; // Clear password field
      document.getElementById('config-password').placeholder = config.surreal.passwordSet ? 'Enter password to change' : 'Enter password';
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  async handleConnect() {
    const configError = document.getElementById('config-error');
    const connectBtn = document.getElementById('connect-btn');

    // Get form values
    const url = document.getElementById('config-url').value.trim();
    const namespace = document.getElementById('config-namespace').value.trim();
    const database = document.getElementById('config-database').value.trim();
    const username = document.getElementById('config-username').value.trim();
    const password = document.getElementById('config-password').value;

    // Validate fields
    if (!url || !namespace || !database || !username || !password) {
      configError.textContent = 'All fields are required';
      configError.classList.remove('hidden');
      return;
    }

    // Show loading state
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    configError.classList.add('hidden');

    try {
      const response = await fetch('/api/config/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          namespace,
          database,
          username,
          password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success! Update UI and reload data
        this.ui.setConnectionStatus('connected', `Connected to ${namespace}/${database}`);
        configError.classList.add('hidden');

        // Reload current view with new connection
        if (this.currentView === 'schema') {
          await this.loadSchemaView();
        } else {
          await this.loadInstanceView();
        }

        // Close modal
        document.getElementById('config-modal').classList.add('hidden');
      } else {
        // Show error
        configError.textContent = result.message || result.error || 'Failed to connect';
        configError.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Connection error:', error);
      configError.textContent = `Connection failed: ${error.message}`;
      configError.classList.remove('hidden');
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect';
    }
  }

  setupEventHandlers() {
    // View mode changes
    this.ui.onViewChange((view) => {
      this.switchView(view);
    });

    // Layout changes
    this.ui.onLayoutChange((layout) => {
      this.renderer.applyLayout(layout);
    });

    // Type filter changes
    this.ui.onTypeFilter((selectedTypes) => {
      this.applyTypeFilter(selectedTypes);
    });

    // Search changes
    this.ui.onSearch((query) => {
      this.handleSearch(query);
    });

    // Timeline changes
    this.timeline.onTimeChange((asOf) => {
      this.handleTimeChange(asOf);
    });

    // Graph interaction events
    this.renderer.onNodeClick = (nodeData) => {
      this.handleNodeClick(nodeData);
    };

    this.renderer.onEdgeClick = (edgeData) => {
      this.handleEdgeClick(edgeData);
    };

    this.renderer.onBackgroundClick = () => {
      this.ui.hideNodeDetails();
    };
  }

  async testConnection() {
    try {
      const summary = await this.client.fetchOntologySummary();
      this.ui.setConnectionStatus('connected', `Connected (${summary.ontologySummary.typeCount} types)`);
    } catch (error) {
      throw new Error('Failed to connect to GraphQL server');
    }
  }

  async loadSchemaView() {
    try {
      this.ui.showLoading('Loading ontology schema...');

      const data = await this.client.fetchAllTypes();

      if (!data || !data.searchOntology) {
        throw new Error('No ontology data returned');
      }

      // Transform data to graph format
      const elements = this.transformer.transformOntologyToGraph(data.searchOntology);

      // Store current elements
      this.currentElements = elements;
      this.currentView = 'schema';

      // Extract type names for filter
      this.allTypes = data.searchOntology.types.map(hit => hit.type.name);
      this.ui.populateTypeFilter(this.allTypes);

      // Render graph
      this.renderer.renderGraph(elements);

      // No timeline needed for schema view
      this.timeline.setTimeRange(null, null);

      this.ui.hideLoading();
    } catch (error) {
      console.error('Error loading schema view:', error);
      this.ui.showError(`Failed to load schema: ${error.message}`);
      throw error;
    }
  }

  async loadInstanceView() {
    try {
      this.ui.showLoading('Loading instance data...');

      const asOf = this.currentAsOf;
      console.log('[Atlas] Loading instances with asOf:', asOf);
      
      const nodes = await this.client.fetchAllInstances(asOf, 100);

      if (!nodes || nodes.length === 0) {
        if (asOf) {
          const selectedDate = new Date(asOf);
          this.ui.showError(
            `No entities existed at ${selectedDate.toLocaleString()}. ` +
            `Entities are only visible when validAt ≤ selected time. ` +
            `Click "LIVE" to see current data.`
          );
        } else {
          this.ui.showError('No instance data found. Create some entities using the GraphQL API or MCP server.');
        }
        return;
      }

      // Transform data to graph format
      let elements = this.transformer.transformInstancesToGraph(nodes);

      // Apply temporal filter if needed
      if (asOf) {
        elements = this.transformer.applyTemporalFilter(elements, asOf);
      }

      // Store current elements
      this.currentElements = elements;
      this.currentView = 'instances';

      // Extract unique types for filter
      const uniqueTypes = [...new Set(nodes.map(n => n.type))];
      this.allTypes = uniqueTypes;
      this.ui.populateTypeFilter(uniqueTypes);

      // Setup timeline based on data
      this.timeline.analyzeDataTimeRange(elements);

      // Render graph
      this.renderer.renderGraph(elements);

      this.ui.hideLoading();
    } catch (error) {
      console.error('Error loading instance view:', error);
      this.ui.showError(`Failed to load instances: ${error.message}`);
      throw error;
    }
  }

  async switchView(view) {
    try {
      if (view === 'schema') {
        await this.loadSchemaView();
      } else if (view === 'instances') {
        await this.loadInstanceView();
      }
    } catch (error) {
      console.error('Error switching view:', error);
    }
  }

  async handleTimeChange(asOf) {
    this.currentAsOf = asOf;

    // Only reload if we're in instance view
    if (this.currentView === 'instances') {
      await this.loadInstanceView();
    }
  }

  applyTypeFilter(selectedTypes) {
    if (!this.currentElements) {
      return;
    }

    let filtered = this.currentElements;

    // Apply type filter if types are selected
    if (selectedTypes && selectedTypes.length > 0) {
      filtered = this.transformer.filterByTypes(this.currentElements, selectedTypes);
    }

    // Re-render with filtered data
    this.renderer.renderGraph(filtered);
  }

  handleSearch(query) {
    if (!this.currentElements) {
      return;
    }

    if (!query || query.trim() === '') {
      // Clear highlights if search is empty
      this.renderer.clearHighlights();
      return;
    }

    // Find matching nodes
    const matchingNodeIds = this.transformer.searchNodes(this.currentElements, query);

    if (matchingNodeIds.length > 0) {
      this.renderer.highlightNodes(matchingNodeIds);
    } else {
      this.renderer.clearHighlights();
    }
  }

  handleNodeClick(nodeData) {
    console.log('Node clicked:', nodeData);
    this.ui.showNodeDetails(nodeData);
  }

  handleEdgeClick(edgeData) {
    console.log('Edge clicked:', edgeData);
    this.ui.showEdgeDetails(edgeData);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new VisualizerApp();
  app.init().catch(error => {
    console.error('Failed to initialize app:', error);
  });
});

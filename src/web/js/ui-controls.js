/**
 * UI Controls
 * Manages view toggles, filters, search, and other UI interactions
 * Enhanced styling for modern dark theme with comprehensive details
 */

export class UIControls {
  constructor() {
    // View mode buttons
    this.schemaBtn = document.getElementById('view-schema');
    this.instancesBtn = document.getElementById('view-instances');

    // Layout selector
    this.layoutSelect = document.getElementById('layout-select');

    // Type filter
    this.typeFilter = document.getElementById('type-filter');

    // Search box
    this.searchBox = document.getElementById('search-box');

    // Node details panel
    this.nodeDetails = document.getElementById('node-details');
    this.nodeDetailsContent = document.getElementById('node-details-content');

    // Loading and error elements
    this.loading = document.getElementById('loading');
    this.error = document.getElementById('error');

    // Connection status
    this.statusIndicator = document.getElementById('status-indicator');
    this.connectionText = document.getElementById('connection-text');

    // Current state
    this.currentView = 'schema';
    this.selectedTypes = [];

    // Callbacks
    this.onViewChangeCallback = null;
    this.onLayoutChangeCallback = null;
    this.onTypeFilterCallback = null;
    this.onSearchCallback = null;

    this.init();
    this.injectDetailStyles();
  }

  init() {
    // View mode toggle
    this.schemaBtn.addEventListener('click', () => {
      this.setView('schema');
    });

    this.instancesBtn.addEventListener('click', () => {
      this.setView('instances');
    });

    // Layout change
    this.layoutSelect.addEventListener('change', () => {
      const layout = this.layoutSelect.value;
      if (this.onLayoutChangeCallback) {
        this.onLayoutChangeCallback(layout);
      }
    });

    // Type filter change
    this.typeFilter.addEventListener('change', () => {
      const selected = Array.from(this.typeFilter.selectedOptions).map(opt => opt.value);
      this.selectedTypes = selected;
      if (this.onTypeFilterCallback) {
        this.onTypeFilterCallback(selected);
      }
    });

    // Search with debounce
    let searchTimeout;
    this.searchBox.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = this.searchBox.value;
        if (this.onSearchCallback) {
          this.onSearchCallback(query);
        }
      }, 300);
    });

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Escape to clear search
      if (e.key === 'Escape') {
        this.searchBox.value = '';
        if (this.onSearchCallback) {
          this.onSearchCallback('');
        }
      }
      // Cmd/Ctrl + F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        this.searchBox.focus();
      }
    });
  }

  /**
   * Inject CSS styles for detail panel
   */
  injectDetailStyles() {
    if (document.getElementById('detail-panel-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'detail-panel-styles';
    style.textContent = `
      .details-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      
      .details-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-default);
      }
      
      .details-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      
      .details-title-group {
        flex: 1;
        min-width: 0;
      }
      
      .details-name {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 2px 0;
        word-break: break-word;
      }
      
      .details-type-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.6875rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        padding: 2px 6px;
        background: var(--bg-surface);
        border-radius: 4px;
      }
      
      .details-type-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      
      .details-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .details-section-title {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--accent-primary);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .details-section-title::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border-subtle);
      }
      
      .details-description {
        font-size: 0.8125rem;
        color: var(--text-secondary);
        line-height: 1.5;
        margin: 0;
        padding: 8px 10px;
        background: var(--bg-elevated);
        border-radius: 6px;
        border-left: 2px solid var(--accent-primary);
      }
      
      .details-description:empty {
        display: none;
      }
      
      .details-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 6px 0;
      }
      
      .details-row + .details-row {
        border-top: 1px solid var(--border-subtle);
      }
      
      .details-label {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--text-muted);
        flex-shrink: 0;
        min-width: 70px;
      }
      
      .details-value {
        font-size: 0.8125rem;
        color: var(--text-primary);
        text-align: right;
        word-break: break-word;
        font-family: 'JetBrains Mono', monospace;
      }
      
      .details-value.wrap {
        font-family: 'Outfit', sans-serif;
        text-align: left;
        flex: 1;
      }
      
      .details-id {
        font-size: 0.6875rem;
        color: var(--text-muted);
        font-family: 'JetBrains Mono', monospace;
        word-break: break-all;
      }
      
      .property-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: none;
        overflow-y: visible;
        padding-right: 4px;
      }
      
      .property-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 10px;
        background: var(--bg-elevated);
        border-radius: 6px;
        border: 1px solid var(--border-subtle);
      }
      
      .property-name {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .property-type {
        font-size: 0.625rem;
        font-weight: 500;
        color: var(--accent-secondary);
        background: rgba(0, 180, 216, 0.1);
        padding: 1px 5px;
        border-radius: 3px;
        font-family: 'JetBrains Mono', monospace;
      }
      
      .property-description {
        font-size: 0.75rem;
        color: var(--text-secondary);
        line-height: 1.4;
      }
      
      .property-value {
        font-size: 0.8125rem;
        color: var(--accent-primary);
        font-family: 'JetBrains Mono', monospace;
        word-break: break-word;
      }
      
      .temporal-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.6875rem;
        padding: 3px 8px;
        border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
      }
      
      .temporal-badge.valid {
        background: rgba(16, 185, 129, 0.1);
        color: var(--accent-success);
        border: 1px solid rgba(16, 185, 129, 0.2);
      }
      
      .temporal-badge.invalid {
        background: rgba(239, 68, 68, 0.1);
        color: var(--accent-error);
        border: 1px solid rgba(239, 68, 68, 0.2);
      }
      
      .edge-flow {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        background: var(--bg-elevated);
        border-radius: 6px;
        font-size: 0.8125rem;
      }
      
      .edge-node {
        flex: 1;
        padding: 6px 8px;
        background: var(--bg-surface);
        border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        color: var(--text-primary);
        text-align: center;
        word-break: break-word;
      }
      
      .edge-arrow {
        color: var(--accent-primary);
        flex-shrink: 0;
      }
      
      .empty-state {
        text-align: center;
        padding: 20px;
        color: var(--text-muted);
        font-size: 0.8125rem;
      }
      
      /* Custom scrollbar for property grid */
      .property-grid::-webkit-scrollbar {
        width: 4px;
      }
      
      .property-grid::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .property-grid::-webkit-scrollbar-thumb {
        background: var(--border-default);
        border-radius: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Set the current view mode
   */
  setView(view) {
    this.currentView = view;

    // Update button states
    if (view === 'schema') {
      this.schemaBtn.classList.add('active');
      this.instancesBtn.classList.remove('active');
    } else {
      this.schemaBtn.classList.remove('active');
      this.instancesBtn.classList.add('active');
    }

    // Emit view change
    if (this.onViewChangeCallback) {
      this.onViewChangeCallback(view);
    }
  }

  /**
   * Populate the type filter dropdown with available types
   */
  populateTypeFilter(types) {
    this.typeFilter.innerHTML = '';

    if (!types || types.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No types available';
      option.disabled = true;
      this.typeFilter.appendChild(option);
      return;
    }

    types.sort().forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      this.typeFilter.appendChild(option);
    });
  }

  /**
   * Show loading state
   */
  showLoading(message = 'Loading world model...') {
    this.loading.querySelector('p').textContent = message;
    this.loading.classList.remove('hidden');
    this.error.classList.add('hidden');
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    this.loading.classList.add('hidden');
  }

  /**
   * Show error message
   */
  showError(message) {
    this.error.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 12px;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <p style="margin: 0;">${this.escapeHtml(message)}</p>
    `;
    this.error.classList.remove('hidden');
    this.loading.classList.add('hidden');
  }

  /**
   * Hide error message
   */
  hideError() {
    this.error.classList.add('hidden');
  }

  /**
   * Update connection status
   */
  setConnectionStatus(status, text) {
    this.statusIndicator.className = 'status-indicator ' + status;
    this.connectionText.textContent = text;
  }

  /**
   * Display node details in sidebar - comprehensive view
   */
  showNodeDetails(nodeData) {
    this.nodeDetails.classList.remove('hidden');
    
    const isSchemaNode = nodeData.nodeType === 'schema' || nodeData.type === 'ontology-type';
    const typeColor = this.getTypeColor(nodeData.type);
    
    if (isSchemaNode) {
      this.showSchemaNodeDetails(nodeData, typeColor);
    } else {
      this.showInstanceNodeDetails(nodeData, typeColor);
    }
  }

  /**
   * Show schema (ontology type) node details
   */
  showSchemaNodeDetails(nodeData, typeColor) {
    const name = nodeData.label || nodeData.id;
    const description = nodeData.description || '';
    const properties = nodeData.properties || [];
    
    const propertiesHtml = properties.length > 0 
      ? `
        <div class="details-section">
          <h4 class="details-section-title">Schema Properties</h4>
          <div class="property-grid">
            ${properties.map(prop => `
              <div class="property-item">
                <div class="property-name">
                  ${this.escapeHtml(prop.name)}
                  ${prop.dataType ? `<span class="property-type">${this.escapeHtml(prop.dataType)}</span>` : ''}
                </div>
                ${prop.description ? `<div class="property-description">${this.escapeHtml(prop.description)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `
      : '';

    const html = `
      <div class="details-container">
        <div class="details-header">
          <div class="details-icon" style="background: ${typeColor}20; border: 1px solid ${typeColor}40;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${typeColor}" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <div class="details-title-group">
            <h3 class="details-name">${this.escapeHtml(name)}</h3>
            <span class="details-type-badge">
              <span class="details-type-dot" style="background: ${typeColor};"></span>
              Ontology Type
            </span>
          </div>
        </div>
        
        ${description ? `
        <div class="details-section">
          <h4 class="details-section-title">Description</h4>
          <p class="details-description">${this.escapeHtml(description)}</p>
        </div>
        ` : ''}
        
        ${propertiesHtml}
        
        ${properties.length === 0 && !description ? `
        <div class="empty-state">No additional details available</div>
        ` : ''}
      </div>
    `;

    this.nodeDetailsContent.innerHTML = html;
  }

  /**
   * Show instance node details
   */
  showInstanceNodeDetails(nodeData, typeColor) {
    const name = nodeData.label || nodeData.id;
    
    // Parse properties - might be a JSON string from GraphQL
    let properties = nodeData.properties || {};
    if (typeof properties === 'string') {
      try {
        properties = JSON.parse(properties);
      } catch (e) {
        console.warn('Failed to parse properties:', e);
        properties = {};
      }
    }
    
    const propEntries = Object.entries(properties);
    
    // Extract common fields for header display (case-insensitive)
    const propsLower = this.getPropsLowerMap(properties);
    const nameValue = propsLower.name || propsLower.fullname || propsLower.title || propsLower.preferred_name || propsLower.preferredname || null;
    const descValue = propsLower.description || propsLower.desc || propsLower.summary || propsLower.bio || null;
    
    // Show ALL properties in the properties section
    const allPropsHtml = propEntries.length > 0 
      ? `
        <div class="details-section">
          <h4 class="details-section-title">Properties (${propEntries.length})</h4>
          <div class="property-grid">
            ${propEntries.map(([key, value]) => `
              <div class="property-item">
                <div class="property-name">${this.escapeHtml(key)}</div>
                <div class="property-value">${this.formatPropertyValue(value)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `
      : `
        <div class="details-section">
          <h4 class="details-section-title">Properties</h4>
          <div class="empty-state" style="padding: 12px;">No properties defined</div>
        </div>
      `;
    

    const temporalHtml = (nodeData.validAt || nodeData.invalidAt) 
      ? `
        <div class="details-section">
          <h4 class="details-section-title">Temporal</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${nodeData.validAt ? `
              <span class="temporal-badge valid">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                From: ${this.formatDate(nodeData.validAt)}
              </span>
            ` : ''}
            ${nodeData.invalidAt ? `
              <span class="temporal-badge invalid">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                Until: ${this.formatDate(nodeData.invalidAt)}
              </span>
            ` : ''}
          </div>
        </div>
      `
      : '';

    const html = `
      <div class="details-container">
        <div class="details-header">
          <div class="details-icon" style="background: ${typeColor}20; border: 1px solid ${typeColor}40;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${typeColor}" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="4"></circle>
            </svg>
          </div>
          <div class="details-title-group">
            <h3 class="details-name">${this.escapeHtml(nameValue || name)}</h3>
            <span class="details-type-badge">
              <span class="details-type-dot" style="background: ${typeColor};"></span>
              ${this.escapeHtml(nodeData.type)}
            </span>
          </div>
        </div>
        
        ${descValue ? `
        <div class="details-section">
          <h4 class="details-section-title">Description</h4>
          <p class="details-description">${this.escapeHtml(descValue)}</p>
        </div>
        ` : ''}
        
        <div class="details-section">
          <h4 class="details-section-title">Identity</h4>
          <div class="details-id">${this.escapeHtml(nodeData.id)}</div>
        </div>
        
        ${allPropsHtml}
        
        ${temporalHtml}
      </div>
    `;

    this.nodeDetailsContent.innerHTML = html;
  }

  /**
   * Display edge details in sidebar
   */
  showEdgeDetails(edgeData) {
    this.nodeDetails.classList.remove('hidden');
    
    const isSchemaEdge = edgeData.nodeType === 'schema' || edgeData.type === 'ontology-relation';
    
    if (isSchemaEdge) {
      this.showSchemaEdgeDetails(edgeData);
    } else {
      this.showInstanceEdgeDetails(edgeData);
    }
  }

  /**
   * Show schema (ontology relation) edge details
   */
  showSchemaEdgeDetails(edgeData) {
    const name = edgeData.label || edgeData.type || 'Relation';
    const description = edgeData.description || '';
    
    const html = `
      <div class="details-container">
        <div class="details-header">
          <div class="details-icon" style="background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
          <div class="details-title-group">
            <h3 class="details-name">${this.escapeHtml(name)}</h3>
            <span class="details-type-badge">
              <span class="details-type-dot" style="background: #7c3aed;"></span>
              Ontology Relation
            </span>
          </div>
        </div>
        
        ${description ? `
        <div class="details-section">
          <h4 class="details-section-title">Description</h4>
          <p class="details-description">${this.escapeHtml(description)}</p>
        </div>
        ` : ''}
        
        <div class="details-section">
          <h4 class="details-section-title">Connection</h4>
          <div class="edge-flow">
            <div class="edge-node">${this.escapeHtml(edgeData.source)}</div>
            <div class="edge-arrow">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
            <div class="edge-node">${this.escapeHtml(edgeData.target)}</div>
          </div>
        </div>
      </div>
    `;

    this.nodeDetailsContent.innerHTML = html;
  }

  /**
   * Show instance edge details
   */
  showInstanceEdgeDetails(edgeData) {
    const name = edgeData.label || edgeData.type || 'Relationship';
    
    const temporalHtml = (edgeData.validAt || edgeData.invalidAt) 
      ? `
        <div class="details-section">
          <h4 class="details-section-title">Temporal</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${edgeData.validAt ? `
              <span class="temporal-badge valid">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                From: ${this.formatDate(edgeData.validAt)}
              </span>
            ` : ''}
            ${edgeData.invalidAt ? `
              <span class="temporal-badge invalid">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                Until: ${this.formatDate(edgeData.invalidAt)}
              </span>
            ` : ''}
          </div>
        </div>
      `
      : '';

    const html = `
      <div class="details-container">
        <div class="details-header">
          <div class="details-icon" style="background: rgba(0, 212, 170, 0.15); border: 1px solid rgba(0, 212, 170, 0.3);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
          <div class="details-title-group">
            <h3 class="details-name">${this.escapeHtml(name)}</h3>
            <span class="details-type-badge">
              <span class="details-type-dot" style="background: #00d4aa;"></span>
              Relationship
            </span>
          </div>
        </div>
        
        <div class="details-section">
          <h4 class="details-section-title">Connection</h4>
          <div class="edge-flow">
            <div class="edge-node">${this.escapeHtml(edgeData.source)}</div>
            <div class="edge-arrow">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
            <div class="edge-node">${this.escapeHtml(edgeData.target)}</div>
          </div>
        </div>
        
        ${temporalHtml}
      </div>
    `;

    this.nodeDetailsContent.innerHTML = html;
  }

  /**
   * Format a property value for display
   */
  formatPropertyValue(value) {
    if (value === null || value === undefined) {
      return '<span style="color: var(--text-muted); font-style: italic;">null</span>';
    }
    
    if (typeof value === 'boolean') {
      const color = value ? 'var(--accent-success)' : 'var(--accent-error)';
      return `<span style="color: ${color};">${value}</span>`;
    }
    
    if (typeof value === 'number') {
      return `<span style="color: var(--accent-secondary);">${value}</span>`;
    }
    
    if (typeof value === 'object') {
      const json = JSON.stringify(value, null, 2);
      if (json.length > 100) {
        return `<span style="font-size: 0.75rem;">${this.escapeHtml(json.substring(0, 100))}...</span>`;
      }
      return this.escapeHtml(json);
    }
    
    return this.escapeHtml(String(value));
  }

  /**
   * Get color for a type
   */
  getTypeColor(type) {
    const colorMap = {
      'Person': '#f472b6',
      'Company': '#60a5fa',
      'Project': '#34d399',
      'Event': '#fbbf24',
      'Document': '#a78bfa',
      'Location': '#f87171',
      'ontology-type': '#7c3aed',
    };
    return colorMap[type] || '#00d4aa';
  }

  /**
   * Hide node details panel
   */
  hideNodeDetails() {
    this.nodeDetails.classList.add('hidden');
    this.nodeDetailsContent.innerHTML = `
      <div class="empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px; opacity: 0.5;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <p style="margin: 0;">Select a node or edge to view details</p>
      </div>
    `;
  }

  /**
   * Format date for display
   */
  formatDate(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  /**
   * Create lowercase key map for case-insensitive property lookup
   */
  getPropsLowerMap(properties) {
    const map = {};
    for (const [key, value] of Object.entries(properties)) {
      map[key.toLowerCase().replace(/_/g, '')] = value;
      map[key.toLowerCase()] = value; // Also keep with underscores
    }
    return map;
  }

  /**
   * Register callbacks
   */
  onViewChange(callback) {
    this.onViewChangeCallback = callback;
  }

  onLayoutChange(callback) {
    this.onLayoutChangeCallback = callback;
  }

  onTypeFilter(callback) {
    this.onTypeFilterCallback = callback;
  }

  onSearch(callback) {
    this.onSearchCallback = callback;
  }

  /**
   * Get current view
   */
  getCurrentView() {
    return this.currentView;
  }

  /**
   * Get selected types
   */
  getSelectedTypes() {
    return this.selectedTypes;
  }
}

/**
 * NodeWeaver API Client
 * JavaScript client for interacting with the NodeWeaver RAG Classifier API
 */

class NodeWeaverClient {
    constructor(baseUrl = '/api/v1') {
        this.baseUrl = baseUrl;
        this.timeout = 30000; // 30 seconds
    }

    /**
     * Make HTTP request with error handling
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: this.timeout
        };

        const config = { ...defaultOptions, ...options };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    /**
     * Classify a single text
     */
    async classify(text, metadata = {}) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error('Text is required and must be a non-empty string');
        }

        return await this.request('/classify', {
            method: 'POST',
            body: JSON.stringify({ text: text.trim(), metadata })
        });
    }

    /**
     * Classify multiple texts in batch
     */
    async classifyBatch(texts, metadata = {}) {
        if (!Array.isArray(texts) || texts.length === 0) {
            throw new Error('Texts must be a non-empty array');
        }

        if (texts.length > 100) {
            throw new Error('Batch size limited to 100 texts');
        }

        // Validate all texts
        const validTexts = texts.filter(text => 
            typeof text === 'string' && text.trim().length > 0
        );

        if (validTexts.length === 0) {
            throw new Error('No valid texts found');
        }

        return await this.request('/classify/batch', {
            method: 'POST',
            body: JSON.stringify({ texts: validTexts, metadata })
        });
    }

    /**
     * Get available categories
     */
    async getCategories(profile = null) {
        const query = profile ? `?profile=${encodeURIComponent(profile)}` : '';
        return await this.request(`/categories${query}`);
    }

    /**
     * Train the classifier with new data
     */
    async train(trainingData) {
        if (!Array.isArray(trainingData) || trainingData.length === 0) {
            throw new Error('Training data must be a non-empty array');
        }

        // Validate training data format
        for (let i = 0; i < trainingData.length; i++) {
            const item = trainingData[i];
            if (!item.text || !item.category || typeof item.text !== 'string' || typeof item.category !== 'string') {
                throw new Error(`Training item ${i} must have text and category fields as strings`);
            }
        }

        return await this.request('/train', {
            method: 'POST',
            body: JSON.stringify({ training_data: trainingData })
        });
    }

    /**
     * Get classification logs
     */
    async getLogs(page = 1, perPage = 20) {
        return await this.request(`/logs?page=${page}&per_page=${perPage}`);
    }

    /**
     * Get all topics with optional filtering
     */
    async getTopics(filters = {}) {
        const params = new URLSearchParams();
        
        if (filters.category) params.append('category', filters.category);
        if (filters.minWeight) params.append('min_weight', filters.minWeight);
        if (filters.minCoherence) params.append('min_coherence', filters.minCoherence);
        if (filters.page) params.append('page', filters.page);
        if (filters.perPage) params.append('per_page', filters.perPage);

        const queryString = params.toString();
        return await this.request(`/topics${queryString ? '?' + queryString : ''}`);
    }

    /**
     * Get topic details by ID
     */
    async getTopicDetails(topicId) {
        if (!topicId) {
            throw new Error('Topic ID is required');
        }
        return await this.request(`/topics/${topicId}`);
    }

    /**
     * Detect emerging topics
     */
    async detectTopics() {
        return await this.request('/topics/detect', {
            method: 'POST',
            body: JSON.stringify({})
        });
    }

    /**
     * Find topics similar to input text
     */
    async findSimilarTopics(text, limit = 10, threshold = 0.5) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text is required and must be a string');
        }

        return await this.request('/topics/similar', {
            method: 'POST',
            body: JSON.stringify({ 
                text: text.trim(), 
                limit: Math.min(limit, 50), 
                threshold: Math.max(0, Math.min(1, threshold))
            })
        });
    }

    /**
     * Get nodes with optional filtering
     */
    async getNodes(filters = {}) {
        const params = new URLSearchParams();
        
        if (filters.category) params.append('category', filters.category);
        if (filters.minWeight) params.append('min_weight', filters.minWeight);
        if (filters.search) params.append('search', filters.search);
        if (filters.page) params.append('page', filters.page);
        if (filters.perPage) params.append('per_page', filters.perPage);

        const queryString = params.toString();
        return await this.request(`/nodes${queryString ? '?' + queryString : ''}`);
    }

    /**
     * Get system statistics
     */
    async getStats() {
        return await this.request('/stats');
    }
}

// Utility functions for common UI interactions
const NodeWeaverUI = {
    client: new NodeWeaverClient(),
    /**
     * Display classification result in a container
     */
    displayResult(container, result, inputText) {
        if (!container) return;

        const confidence = result.confidence_score || 0;
        const confidenceClass = confidence > 0.8 ? 'success' : confidence > 0.5 ? 'warning' : 'danger';
        
        container.innerHTML = `
            <div class="alert alert-${confidenceClass} mb-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">
                            <i class="fas fa-tag me-2"></i>Category: 
                            <span class="fw-bold">${result.predicted_category || 'unknown'}</span>
                        </h6>
                        <div class="progress mb-2" style="height: 20px;">
                            <div class="progress-bar" role="progressbar" 
                                 style="width: ${confidence * 100}%"
                                 aria-valuenow="${confidence * 100}" 
                                 aria-valuemin="0" 
                                 aria-valuemax="100">
                                Confidence: ${(confidence * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            ${inputText ? `
                <div class="mb-3">
                    <h6><i class="fas fa-quote-left me-2"></i>Input Text:</h6>
                    <div class="bg-dark p-3 rounded">
                        <code class="text-light">${this.escapeHtml(inputText)}</code>
                    </div>
                </div>
            ` : ''}
            
            ${result.similar_topics && result.similar_topics.length > 0 ? `
                <div class="mb-3">
                    <h6><i class="fas fa-project-diagram me-2"></i>Similar Topics:</h6>
                    <div class="row">
                        ${result.similar_topics.slice(0, 3).map(topic => `
                            <div class="col-md-4 mb-2">
                                <div class="card card-body py-2">
                                    <div class="d-flex justify-content-between align-items-center">
                                        <span class="badge bg-info text-truncate me-2">${this.escapeHtml(topic.label)}</span>
                                        <small class="text-muted">${(topic.similarity * 100).toFixed(1)}%</small>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${result.similar_nodes && result.similar_nodes.length > 0 ? `
                <div class="mb-3">
                    <h6><i class="fas fa-circle-nodes me-2"></i>Similar Nodes:</h6>
                    ${result.similar_nodes.slice(0, 3).map(node => `
                        <div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-dark rounded">
                            <small class="text-truncate me-2" style="max-width: 70%;">
                                ${this.escapeHtml(node.content)}
                            </small>
                            <small class="text-muted">${(node.similarity * 100).toFixed(1)}%</small>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="text-muted">
                <small>
                    <i class="fas fa-clock me-1"></i>
                    Processing time: ${result.processing_time ? (result.processing_time * 1000).toFixed(0) : 'N/A'}ms
                    ${result.document_id ? ` | Document ID: ${result.document_id}` : ''}
                </small>
            </div>
        `;
    },

    /**
     * Display error message in a container
     */
    displayError(container, error) {
        if (!container) return;

        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Error:</strong> ${this.escapeHtml(error.message || error.toString())}
            </div>
        `;
    },

    /**
     * Display loading state in a container
     */
    displayLoading(container, message = 'Processing...') {
        if (!container) return;

        container.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted mb-0">${this.escapeHtml(message)}</p>
            </div>
        `;
    },

    /**
     * Display batch results
     */
    displayBatchResults(container, results) {
        if (!container || !results.results) return;

        const successCount = results.results.filter(r => !r.error).length;
        const errorCount = results.results.length - successCount;

        container.innerHTML = `
            <div class="alert alert-info mb-3">
                <h6 class="mb-1">
                    <i class="fas fa-layer-group me-2"></i>Batch Classification Complete
                </h6>
                <div class="row text-center">
                    <div class="col-4">
                        <div class="h5 text-success mb-0">${successCount}</div>
                        <small class="text-muted">Success</small>
                    </div>
                    <div class="col-4">
                        <div class="h5 text-danger mb-0">${errorCount}</div>
                        <small class="text-muted">Errors</small>
                    </div>
                    <div class="col-4">
                        <div class="h5 text-info mb-0">${(results.processing_time * 1000).toFixed(0)}ms</div>
                        <small class="text-muted">Time</small>
                    </div>
                </div>
            </div>
            
            <div style="max-height: 400px; overflow-y: auto;">
                ${results.results.map((result, index) => `
                    <div class="card mb-2">
                        <div class="card-body py-2">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="badge bg-secondary">#${index + 1}</span>
                                ${result.error ? 
                                    `<span class="badge bg-danger">Error: ${this.escapeHtml(result.error)}</span>` :
                                    `<span class="badge bg-primary">${result.predicted_category || 'unknown'}</span>`
                                }
                            </div>
                            ${!result.error ? `
                                <div class="progress mt-2" style="height: 15px;">
                                    <div class="progress-bar" style="width: ${(result.confidence_score || 0) * 100}%">
                                        ${((result.confidence_score || 0) * 100).toFixed(1)}%
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Format timestamp for display
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleString();
    },

    /**
     * Create a category badge element
     */
    createCategoryBadge(category, className = 'bg-primary') {
        return `<span class="badge ${className}">${this.escapeHtml(category)}</span>`;
    }
};

// Create global instance
window.nodeWeaverClient = new NodeWeaverClient();
window.NodeWeaverUI = NodeWeaverUI;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NodeWeaverClient, NodeWeaverUI };
}

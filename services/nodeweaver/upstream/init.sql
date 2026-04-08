-- NodeWeaver Database Initialization Script
-- Creates the necessary tables, indexes, and extensions for the RAG classifier

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For text search optimization

-- Set timezone
SET timezone = 'UTC';

-- Create custom types
DO $$ BEGIN
    CREATE TYPE classification_status AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Nodes table (discrete units of meaning)
CREATE TABLE IF NOT EXISTS nodes (
    node_id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding VECTOR(384), -- sentence-transformers all-MiniLM-L6-v2 dimension
    frequency INTEGER DEFAULT 1 CHECK (frequency > 0),
    weight FLOAT DEFAULT 1.0 CHECK (weight >= 0),
    category VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT nodes_content_not_empty CHECK (char_length(trim(content)) > 0),
    CONSTRAINT nodes_category_valid CHECK (category IS NULL OR char_length(trim(category)) > 0)
);

-- Topics table (emergent from weighted node convergence)
CREATE TABLE IF NOT EXISTS topics (
    topic_id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    centroid_embedding VECTOR(384),
    origin_node_ids INTEGER[] DEFAULT '{}',
    total_weight FLOAT DEFAULT 0.0 CHECK (total_weight >= 0),
    coherence_score FLOAT DEFAULT 0.0 CHECK (coherence_score >= 0 AND coherence_score <= 1),
    category VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT topics_label_not_empty CHECK (char_length(trim(label)) > 0),
    CONSTRAINT topics_category_valid CHECK (category IS NULL OR char_length(trim(category)) > 0)
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    doc_id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding VECTOR(384),
    topic_ids INTEGER[] DEFAULT '{}',
    predicted_category VARCHAR(100),
    confidence_score FLOAT DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT documents_content_not_empty CHECK (char_length(trim(content)) > 0)
);

-- Node relationships for topic emergence
CREATE TABLE IF NOT EXISTS node_relationships (
    rel_id SERIAL PRIMARY KEY,
    node_id_1 INTEGER NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
    node_id_2 INTEGER NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
    similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1),
    co_occurrence_count INTEGER DEFAULT 1 CHECK (co_occurrence_count > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure node_id_1 < node_id_2 to avoid duplicates
    CONSTRAINT node_relationships_ordered CHECK (node_id_1 < node_id_2),
    CONSTRAINT unique_node_relationship UNIQUE (node_id_1, node_id_2)
);

-- Classification logs
CREATE TABLE IF NOT EXISTS classification_logs (
    log_id SERIAL PRIMARY KEY,
    input_text TEXT NOT NULL,
    predicted_category VARCHAR(100),
    confidence_score FLOAT DEFAULT 0.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    similar_topics JSONB DEFAULT '[]',
    similar_nodes JSONB DEFAULT '[]',
    processing_time FLOAT DEFAULT 0.0 CHECK (processing_time >= 0),
    status classification_status DEFAULT 'completed',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT classification_logs_input_not_empty CHECK (char_length(trim(input_text)) > 0)
);

-- System configuration table
CREATE TABLE IF NOT EXISTS system_config (
    config_id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training data table
CREATE TABLE IF NOT EXISTS training_data (
    training_id SERIAL PRIMARY KEY,
    input_text TEXT NOT NULL,
    expected_category VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT training_data_input_not_empty CHECK (char_length(trim(input_text)) > 0),
    CONSTRAINT training_data_category_not_empty CHECK (char_length(trim(expected_category)) > 0)
);

-- Performance monitoring table
CREATE TABLE IF NOT EXISTS performance_metrics (
    metric_id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL,
    metric_metadata JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for optimal performance

-- Vector similarity search indexes (IVFFLAT for cosine similarity)
CREATE INDEX IF NOT EXISTS idx_nodes_embedding_cosine 
    ON nodes USING ivfflat (embedding vector_cosine_ops) 
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_topics_embedding_cosine 
    ON topics USING ivfflat (centroid_embedding vector_cosine_ops) 
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_documents_embedding_cosine 
    ON documents USING ivfflat (embedding vector_cosine_ops) 
    WITH (lists = 100);

-- Category and weight indexes
CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents (predicted_category) WHERE predicted_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nodes_weight ON nodes (weight DESC);
CREATE INDEX IF NOT EXISTS idx_topics_weight ON topics (total_weight DESC);
CREATE INDEX IF NOT EXISTS idx_topics_coherence ON topics (coherence_score DESC);

-- Time-based indexes
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_created_at ON topics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classification_logs_created_at ON classification_logs (created_at DESC);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_nodes_content_gin ON nodes USING gin (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_topics_label_gin ON topics USING gin (to_tsvector('english', label));
CREATE INDEX IF NOT EXISTS idx_documents_content_gin ON documents USING gin (to_tsvector('english', content));

-- Relationship indexes
CREATE INDEX IF NOT EXISTS idx_node_relationships_similarity ON node_relationships (similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_node_relationships_occurrence ON node_relationships (co_occurrence_count DESC);

-- Metadata indexes (GIN for JSONB)
CREATE INDEX IF NOT EXISTS idx_nodes_metadata ON nodes USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_topics_metadata ON topics USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_classification_logs_metadata ON classification_logs USING gin (metadata);

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name_time ON performance_metrics (metric_name, recorded_at DESC);

-- Create triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
DROP TRIGGER IF EXISTS trigger_nodes_update_timestamp ON nodes;
CREATE TRIGGER trigger_nodes_update_timestamp
    BEFORE UPDATE ON nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trigger_topics_update_timestamp ON topics;
CREATE TRIGGER trigger_topics_update_timestamp
    BEFORE UPDATE ON topics
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trigger_node_relationships_update_timestamp ON node_relationships;
CREATE TRIGGER trigger_node_relationships_update_timestamp
    BEFORE UPDATE ON node_relationships
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trigger_system_config_update_timestamp ON system_config;
CREATE TRIGGER trigger_system_config_update_timestamp
    BEFORE UPDATE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Create utility functions
CREATE OR REPLACE FUNCTION get_node_similarity(node1_id INTEGER, node2_id INTEGER)
RETURNS FLOAT AS $$
DECLARE
    similarity_score FLOAT;
BEGIN
    SELECT nr.similarity_score INTO similarity_score
    FROM node_relationships nr
    WHERE (nr.node_id_1 = LEAST(node1_id, node2_id) AND nr.node_id_2 = GREATEST(node1_id, node2_id));
    
    RETURN COALESCE(similarity_score, 0.0);
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old data
CREATE OR REPLACE FUNCTION cleanup_old_data(days_old INTEGER DEFAULT 90)
RETURNS TEXT AS $$
DECLARE
    deleted_logs INTEGER;
    deleted_metrics INTEGER;
BEGIN
    -- Clean up old classification logs
    DELETE FROM classification_logs 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
    GET DIAGNOSTICS deleted_logs = ROW_COUNT;
    
    -- Clean up old performance metrics
    DELETE FROM performance_metrics 
    WHERE recorded_at < NOW() - INTERVAL '1 day' * days_old;
    GET DIAGNOSTICS deleted_metrics = ROW_COUNT;
    
    -- Clean up orphaned relationships
    DELETE FROM node_relationships nr
    WHERE NOT EXISTS (SELECT 1 FROM nodes WHERE node_id = nr.node_id_1)
       OR NOT EXISTS (SELECT 1 FROM nodes WHERE node_id = nr.node_id_2);
    
    RETURN format('Cleanup completed: %s logs, %s metrics deleted', deleted_logs, deleted_metrics);
END;
$$ LANGUAGE plpgsql;

-- Function to get system statistics
CREATE OR REPLACE FUNCTION get_system_stats()
RETURNS TABLE (
    stat_name TEXT,
    stat_value BIGINT,
    stat_description TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'total_nodes'::TEXT, COUNT(*)::BIGINT, 'Total number of nodes'::TEXT FROM nodes
    UNION ALL
    SELECT 'total_topics'::TEXT, COUNT(*)::BIGINT, 'Total number of topics'::TEXT FROM topics
    UNION ALL
    SELECT 'total_documents'::TEXT, COUNT(*)::BIGINT, 'Total number of documents'::TEXT FROM documents
    UNION ALL
    SELECT 'total_relationships'::TEXT, COUNT(*)::BIGINT, 'Total node relationships'::TEXT FROM node_relationships
    UNION ALL
    SELECT 'recent_classifications'::TEXT, COUNT(*)::BIGINT, 'Classifications in last 24 hours'::TEXT 
    FROM classification_logs WHERE created_at > NOW() - INTERVAL '1 day'
    UNION ALL
    SELECT 'avg_confidence'::TEXT, (AVG(confidence_score) * 100)::BIGINT, 'Average confidence percentage'::TEXT 
    FROM classification_logs WHERE created_at > NOW() - INTERVAL '7 days' AND confidence_score > 0;
END;
$$ LANGUAGE plpgsql;

-- Insert default system configuration
INSERT INTO system_config (config_key, config_value, description) VALUES
('default_categories', '["personal", "work", "academic", "political", "health", "finance", "entertainment", "travel", "shopping", "technology", "other"]', 'Default classification categories'),
('convergence_threshold', '0.7', 'Default similarity threshold for topic convergence'),
('min_cluster_size', '3', 'Minimum nodes required for topic formation'),
('coherence_threshold', '0.6', 'Minimum coherence score for valid topics'),
('max_input_length', '10000', 'Maximum input text length for classification'),
('embedding_model', '"all-MiniLM-L6-v2"', 'Default sentence transformer model'),
('vector_dimension', '384', 'Embedding vector dimension')
ON CONFLICT (config_key) DO NOTHING;

-- Insert some sample training data (optional - for initial model training)
INSERT INTO training_data (input_text, expected_category, metadata) VALUES
('Schedule dentist appointment', 'health', '{"sample": true, "priority": "high"}'),
('Buy groceries for dinner', 'personal', '{"sample": true}'),
('Prepare quarterly financial report', 'work', '{"sample": true, "department": "finance"}'),
('Study for chemistry midterm exam', 'academic', '{"sample": true, "subject": "chemistry"}'),
('Call senator about healthcare policy', 'political', '{"sample": true}'),
('Book flight tickets for vacation', 'travel', '{"sample": true}'),
('Download new productivity app', 'technology', '{"sample": true}'),
('Watch Netflix series tonight', 'entertainment', '{"sample": true}'),
('Pay monthly credit card bill', 'finance', '{"sample": true}'),
('Order birthday gift online', 'shopping', '{"sample": true}')
ON CONFLICT DO NOTHING;

-- Create views for common queries
CREATE OR REPLACE VIEW classification_summary AS
SELECT 
    predicted_category,
    COUNT(*) as total_classifications,
    AVG(confidence_score) as avg_confidence,
    MIN(confidence_score) as min_confidence,
    MAX(confidence_score) as max_confidence,
    AVG(processing_time) as avg_processing_time
FROM classification_logs 
WHERE status = 'completed' AND predicted_category IS NOT NULL
GROUP BY predicted_category
ORDER BY total_classifications DESC;

CREATE OR REPLACE VIEW recent_activity AS
SELECT 
    'classification' as activity_type,
    predicted_category as category,
    confidence_score,
    created_at
FROM classification_logs 
WHERE created_at > NOW() - INTERVAL '1 day'
UNION ALL
SELECT 
    'topic_creation' as activity_type,
    category,
    coherence_score as confidence_score,
    created_at
FROM topics 
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC
LIMIT 100;

-- Grant appropriate permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rag_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rag_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO rag_user;

-- Log successful initialization
INSERT INTO performance_metrics (metric_name, metric_value, metric_metadata) 
VALUES ('database_initialization', 1, '{"status": "success", "timestamp": "' || NOW() || '"}');

-- Display initialization summary
DO $$
BEGIN
    RAISE NOTICE 'TopicSense database initialization completed successfully!';
    RAISE NOTICE 'Created tables: nodes, topics, documents, node_relationships, classification_logs, system_config, training_data, performance_metrics';
    RAISE NOTICE 'Created indexes for optimal vector similarity search performance';
    RAISE NOTICE 'Configured automatic timestamp updates and utility functions';
    RAISE NOTICE 'Database is ready for TopicSense RAG classifier operations';
END $$;

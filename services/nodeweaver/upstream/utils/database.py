from sqlalchemy import text
import logging
from app import db

logger = logging.getLogger(__name__)

def init_database():
    """Initialize database with required extensions and indexes"""
    try:
        with db.session() as session:
            # Enable pgvector extension
            session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            
            # Create indexes for vector similarity search
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_nodes_embedding ON nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)",
                "CREATE INDEX IF NOT EXISTS idx_topics_embedding ON topics USING ivfflat (centroid_embedding vector_cosine_ops) WITH (lists = 100)",
                "CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)",
                "CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes (category)",
                "CREATE INDEX IF NOT EXISTS idx_topics_category ON topics (category)",
                "CREATE INDEX IF NOT EXISTS idx_nodes_weight ON nodes (weight DESC)",
                "CREATE INDEX IF NOT EXISTS idx_topics_weight ON topics (total_weight DESC)"
            ]
            
            for index_sql in indexes:
                try:
                    session.execute(text(index_sql))
                    logger.debug(f"Created index: {index_sql}")
                except Exception as e:
                    logger.warning(f"Index creation failed: {e}")
            
            session.commit()
            logger.info("Database initialization completed")
            
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        raise

def check_database_health():
    """Check database connection and basic functionality"""
    try:
        with db.session() as session:
            # Test basic connection
            result = session.execute(text("SELECT 1"))
            assert result.fetchone()[0] == 1
            
            # Test vector extension
            result = session.execute(text("SELECT extname FROM pg_extension WHERE extname = 'vector'"))
            vector_installed = result.fetchone() is not None
            
            # Test table existence
            result = session.execute(text("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name IN ('nodes', 'topics', 'documents')
            """))
            tables = [row[0] for row in result.fetchall()]
            
            health_status = {
                'database_connected': True,
                'vector_extension': vector_installed,
                'required_tables': {
                    'nodes': 'nodes' in tables,
                    'topics': 'topics' in tables,
                    'documents': 'documents' in tables
                }
            }
            
            logger.info(f"Database health check: {health_status}")
            return health_status
            
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return {
            'database_connected': False,
            'error': str(e)
        }

def cleanup_old_data(days_old: int = 30):
    """Clean up old classification logs and low-weight nodes"""
    try:
        with db.session() as session:
            # Remove old classification logs
            session.execute(text("""
                DELETE FROM classification_logs 
                WHERE created_at < NOW() - INTERVAL ':days days'
            """), {'days': days_old})
            
            # Remove nodes with very low weight and no relationships
            session.execute(text("""
                DELETE FROM nodes 
                WHERE weight < 0.1 
                  AND frequency = 1 
                  AND created_at < NOW() - INTERVAL ':days days'
                  AND node_id NOT IN (
                      SELECT DISTINCT node_id_1 FROM node_relationships
                      UNION
                      SELECT DISTINCT node_id_2 FROM node_relationships
                  )
            """), {'days': days_old})
            
            # Remove orphaned relationships
            session.execute(text("""
                DELETE FROM node_relationships 
                WHERE node_id_1 NOT IN (SELECT node_id FROM nodes)
                   OR node_id_2 NOT IN (SELECT node_id FROM nodes)
            """))
            
            session.commit()
            logger.info(f"Cleaned up data older than {days_old} days")
            
    except Exception as e:
        logger.error(f"Data cleanup failed: {str(e)}")
        db.session.rollback()

def get_database_stats():
    """Get database usage statistics"""
    try:
        with db.session() as session:
            stats = {}
            
            # Table sizes
            tables = ['nodes', 'topics', 'documents', 'node_relationships', 'classification_logs']
            for table in tables:
                result = session.execute(text(f"SELECT COUNT(*) FROM {table}"))
                stats[f'{table}_count'] = result.fetchone()[0]
            
            # Database size
            result = session.execute(text("""
                SELECT pg_size_pretty(pg_database_size(current_database())) as size
            """))
            stats['database_size'] = result.fetchone()[0]
            
            # Index usage
            result = session.execute(text("""
                SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch
                FROM pg_stat_user_indexes
                WHERE schemaname = 'public'
                ORDER BY idx_tup_read DESC
                LIMIT 10
            """))
            stats['top_indexes'] = [dict(row._mapping) for row in result.fetchall()]
            
            return stats
            
    except Exception as e:
        logger.error(f"Stats retrieval failed: {str(e)}")
        return {}

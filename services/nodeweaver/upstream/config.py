import os

class Config:
    # Database configuration
    DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://rag_user:rag_pass@localhost:5432/nodeweaver')
    
    # Flask configuration
    SECRET_KEY = os.environ.get('SESSION_SECRET', 'dev-secret-key-change-in-production')
    
    # RAG Engine configuration
    EMBEDDING_MODEL = os.environ.get('EMBEDDING_MODEL', 'all-MiniLM-L6-v2')
    VECTOR_DIMENSION = int(os.environ.get('VECTOR_DIMENSION', '384'))
    
    # Topic detection thresholds
    CONVERGENCE_THRESHOLD = float(os.environ.get('CONVERGENCE_THRESHOLD', '0.7'))
    MIN_CLUSTER_SIZE = int(os.environ.get('MIN_CLUSTER_SIZE', '3'))
    COHERENCE_THRESHOLD = float(os.environ.get('COHERENCE_THRESHOLD', '0.6'))
    
    # Classification categories
    DEFAULT_CATEGORIES = [
        'personal', 'work', 'academic', 'political', 'legal', 'health', 'finance',
        'entertainment', 'travel', 'shopping', 'technology', 'other'
    ]
    AXTASK_CATEGORIES = [
        'Development', 'Meeting', 'Research', 'Maintenance', 'Administrative', 'General'
    ]
    
    # API configuration
    API_VERSION = 'v1'
    APP_VERSION = '1.0.3'
    MAX_INPUT_LENGTH = int(os.environ.get('MAX_INPUT_LENGTH', '10000'))
    
    # Logging configuration
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')

    @classmethod
    def get_categories(cls, profile: str = None):
        """Return categories for the requested classification profile."""
        profile_name = (profile or '').strip().lower()
        if profile_name == 'axtask':
            return cls.AXTASK_CATEGORIES
        return cls.DEFAULT_CATEGORIES

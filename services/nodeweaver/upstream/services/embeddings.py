import numpy as np
from sentence_transformers import SentenceTransformer
import logging
from typing import List, Union
import os

logger = logging.getLogger(__name__)

class EmbeddingService:
    """Service for generating text embeddings"""
    
    def __init__(self, model_name: str = None):
        self.model_name = model_name or os.environ.get('EMBEDDING_MODEL', 'all-MiniLM-L6-v2')
        self.model = None
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize the sentence transformer model"""
        try:
            logger.info(f"Loading embedding model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            logger.info(f"Model loaded successfully. Dimension: {self.model.get_sentence_embedding_dimension()}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {str(e)}")
            raise
    
    def encode(self, texts: Union[str, List[str]], normalize: bool = True) -> np.ndarray:
        """Generate embeddings for text(s)"""
        try:
            if isinstance(texts, str):
                texts = [texts]
            
            embeddings = self.model.encode(texts, normalize_embeddings=normalize)
            
            # Return single embedding if single text was provided
            if len(texts) == 1:
                return embeddings[0]
            
            return embeddings
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {str(e)}")
            raise
    
    def get_dimension(self) -> int:
        """Get embedding dimension"""
        return self.model.get_sentence_embedding_dimension()
    
    def similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Calculate cosine similarity between two embeddings"""
        try:
            # Normalize embeddings
            norm1 = np.linalg.norm(embedding1)
            norm2 = np.linalg.norm(embedding2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            # Calculate cosine similarity
            similarity = np.dot(embedding1, embedding2) / (norm1 * norm2)
            return float(similarity)
            
        except Exception as e:
            logger.error(f"Similarity calculation failed: {str(e)}")
            return 0.0
    
    def batch_similarity(self, query_embedding: np.ndarray, embeddings: np.ndarray) -> np.ndarray:
        """Calculate similarities between query embedding and multiple embeddings"""
        try:
            from sklearn.metrics.pairwise import cosine_similarity
            
            # Reshape query embedding for sklearn
            query_embedding = query_embedding.reshape(1, -1)
            
            # Calculate similarities
            similarities = cosine_similarity(query_embedding, embeddings)[0]
            return similarities
            
        except Exception as e:
            logger.error(f"Batch similarity calculation failed: {str(e)}")
            return np.array([])

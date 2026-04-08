"""Simple embedding service using basic text similarity"""
import logging
import json
from typing import List, Any
import hashlib

logger = logging.getLogger(__name__)

class SimpleEmbeddingService:
    """Basic text embedding service using simple hashing and similarity"""
    
    def __init__(self):
        logger.info("Simple Embedding Service initialized")
    
    def encode(self, text: str) -> List[float]:
        """Create a simple numeric representation of text"""
        if not text:
            return [0.0] * 10  # Simple 10-dimensional vector
        
        # Create a simple embedding based on text characteristics
        text_lower = text.lower().strip()
        
        # Basic features
        features = [
            len(text_lower) / 100.0,  # Length normalized
            text_lower.count(' ') / 50.0,  # Word count approximation
            sum(1 for c in text_lower if c.isalpha()) / len(text_lower) if text_lower else 0,
            sum(1 for c in text_lower if c.isdigit()) / len(text_lower) if text_lower else 0,
            text_lower.count('!') + text_lower.count('?'),  # Punctuation
            1.0 if any(word in text_lower for word in ['work', 'job', 'office', 'meeting']) else 0.0,
            1.0 if any(word in text_lower for word in ['personal', 'family', 'home', 'myself']) else 0.0,
            1.0 if any(word in text_lower for word in ['study', 'school', 'learn', 'academic']) else 0.0,
            1.0 if any(word in text_lower for word in ['health', 'doctor', 'medical', 'sick']) else 0.0,
            1.0 if any(word in text_lower for word in ['money', 'buy', 'pay', 'finance']) else 0.0,
        ]
        
        return features
    
    def batch_encode(self, texts: List[str]) -> List[List[float]]:
        """Encode multiple texts"""
        return [self.encode(text) for text in texts]
    
    def similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Calculate cosine similarity between two embeddings"""
        if not embedding1 or not embedding2:
            return 0.0
        
        # Simple dot product similarity
        dot_product = sum(a * b for a, b in zip(embedding1, embedding2))
        norm1 = sum(a * a for a in embedding1) ** 0.5
        norm2 = sum(b * b for b in embedding2) ** 0.5
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
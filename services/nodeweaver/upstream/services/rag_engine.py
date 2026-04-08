import numpy as np
from typing import List, Dict, Any, Optional
import logging
from sqlalchemy import text
from models import Node, Topic, Document, NodeRelationship
from services.embeddings import EmbeddingService
from services.topic_detector import TopicDetector
from config import Config

logger = logging.getLogger(__name__)

class RAGEngine:
    """Main RAG engine for text classification and topic management"""
    
    def __init__(self, db):
        self.db = db
        self.embedding_service = EmbeddingService()
        self.topic_detector = TopicDetector(self.embedding_service)
        
        # Classification parameters
        self.categories = Config.DEFAULT_CATEGORIES
        self.similarity_threshold = 0.6
        self.confidence_threshold = 0.7
        
        logger.info("RAG Engine initialized")
    
    def classify_text(self, text: str, metadata: Dict = None) -> Dict[str, Any]:
        """Classify input text and return category prediction with confidence"""
        try:
            if not text or len(text.strip()) == 0:
                raise ValueError("Empty text provided")
            
            # Generate embedding for input text
            text_embedding = self.embedding_service.encode(text)
            
            # Find similar topics
            similar_topics = self._find_similar_topics_db(text_embedding)
            
            # Find similar nodes
            similar_nodes = self._find_similar_nodes_db(text_embedding)
            
            # Determine category and confidence
            predicted_category, confidence = self._predict_category(similar_topics, similar_nodes)
            
            # Create document record
            doc = Document(
                content=text,
                embedding=text_embedding.tolist(),
                predicted_category=predicted_category,
                confidence_score=confidence,
                metadata=metadata or {}
            )
            
            self.db.session.add(doc)
            self.db.session.commit()
            
            return {
                'predicted_category': predicted_category,
                'confidence_score': confidence,
                'similar_topics': similar_topics,
                'similar_nodes': similar_nodes,
                'document_id': doc.doc_id
            }
            
        except Exception as e:
            logger.error(f"Text classification failed: {str(e)}")
            raise
    
    def _find_similar_topics_db(self, query_embedding: np.ndarray, limit: int = 5) -> List[Dict]:
        """Find similar topics using database vector search"""
        try:
            with self.db.session() as session:
                result = session.execute(text("""
                    SELECT topic_id, label, category, total_weight, coherence_score,
                           (1 - (centroid_embedding <=> :embedding)) as similarity
                    FROM topics
                    WHERE centroid_embedding IS NOT NULL
                    ORDER BY centroid_embedding <=> :embedding
                    LIMIT :limit
                """), {
                    'embedding': query_embedding.tolist(),
                    'limit': limit
                })
                
                return [dict(row._mapping) for row in result.fetchall()]
                
        except Exception as e:
            logger.error(f"Topic similarity search failed: {str(e)}")
            return []
    
    def _find_similar_nodes_db(self, query_embedding: np.ndarray, limit: int = 10) -> List[Dict]:
        """Find similar nodes using database vector search"""
        try:
            with self.db.session() as session:
                result = session.execute(text("""
                    SELECT node_id, content, category, weight, frequency,
                           (1 - (embedding <=> :embedding)) as similarity
                    FROM nodes
                    WHERE embedding IS NOT NULL
                      AND (1 - (embedding <=> :embedding)) > :threshold
                    ORDER BY embedding <=> :embedding
                    LIMIT :limit
                """), {
                    'embedding': query_embedding.tolist(),
                    'threshold': self.similarity_threshold,
                    'limit': limit
                })
                
                return [dict(row._mapping) for row in result.fetchall()]
                
        except Exception as e:
            logger.error(f"Node similarity search failed: {str(e)}")
            return []
    
    def _predict_category(self, similar_topics: List[Dict], similar_nodes: List[Dict]) -> tuple[str, float]:
        """Predict category based on similar topics and nodes"""
        try:
            category_scores = {}
            
            # Score from similar topics (weighted by coherence and similarity)
            for topic in similar_topics:
                if topic['category']:
                    weight = topic['similarity'] * topic['coherence_score'] * (topic['total_weight'] or 1)
                    category_scores[topic['category']] = category_scores.get(topic['category'], 0) + weight
            
            # Score from similar nodes (weighted by similarity and node weight)
            for node in similar_nodes:
                if node['category']:
                    weight = node['similarity'] * (node['weight'] or 1)
                    category_scores[node['category']] = category_scores.get(node['category'], 0) + weight * 0.5  # Lower weight than topics
            
            if not category_scores:
                return 'other', 0.0
            
            # Get best category
            best_category = max(category_scores, key=category_scores.get)
            max_score = category_scores[best_category]
            
            # Normalize confidence score
            total_score = sum(category_scores.values())
            confidence = max_score / total_score if total_score > 0 else 0.0
            
            # Apply minimum confidence threshold
            if confidence < self.confidence_threshold:
                return 'other', confidence
            
            return best_category, confidence
            
        except Exception as e:
            logger.error(f"Category prediction failed: {str(e)}")
            return 'other', 0.0
    
    def add_training_data(self, text: str, category: str, metadata: Dict = None):
        """Add training data as nodes"""
        try:
            if category not in self.categories:
                logger.warning(f"Unknown category: {category}. Adding to categories.")
                self.categories.append(category)
            
            # Generate embedding
            embedding = self.embedding_service.encode(text)
            
            # Check if similar node exists
            existing_node = self._find_or_create_node(text, embedding, category, metadata)
            
            # Update node relationships
            self.topic_detector.update_node_relationships(existing_node.node_id)
            
            logger.debug(f"Added training data: {text[:50]}... -> {category}")
            
        except Exception as e:
            logger.error(f"Training data addition failed: {str(e)}")
            raise
    
    def _find_or_create_node(self, text: str, embedding: np.ndarray, 
                           category: str, metadata: Dict = None) -> Node:
        """Find existing similar node or create new one"""
        try:
            # Look for very similar existing nodes
            similar_nodes = self._find_similar_nodes_db(embedding, limit=1)
            
            if similar_nodes and similar_nodes[0]['similarity'] > 0.95:
                # Update existing node
                node = Node.query.get(similar_nodes[0]['node_id'])
                node.frequency += 1
                node.weight = node.weight * 0.9 + 0.1  # Slight weight increase
                if not node.category and category:
                    node.category = category
            else:
                # Create new node
                node = Node(
                    content=text,
                    embedding=embedding.tolist(),
                    category=category,
                    weight=1.0,
                    frequency=1,
                    metadata=metadata or {}
                )
                self.db.session.add(node)
            
            self.db.session.commit()
            return node
            
        except Exception as e:
            logger.error(f"Node creation/update failed: {str(e)}")
            self.db.session.rollback()
            raise
    
    def detect_emerging_topics(self) -> List[Topic]:
        """Detect emerging topics from nodes"""
        try:
            return self.topic_detector.detect_emerging_topics()
        except Exception as e:
            logger.error(f"Topic detection failed: {str(e)}")
            return []
    
    def find_similar_topics(self, text: str, limit: int = 10, threshold: float = 0.5) -> List[Dict]:
        """Find topics similar to input text"""
        try:
            embedding = self.embedding_service.encode(text)
            
            with self.db.session() as session:
                result = session.execute(text("""
                    SELECT topic_id, label, category, total_weight, coherence_score,
                           (1 - (centroid_embedding <=> :embedding)) as similarity
                    FROM topics
                    WHERE centroid_embedding IS NOT NULL
                      AND (1 - (centroid_embedding <=> :embedding)) > :threshold
                    ORDER BY centroid_embedding <=> :embedding
                    LIMIT :limit
                """), {
                    'embedding': embedding.tolist(),
                    'threshold': threshold,
                    'limit': limit
                })
                
                return [dict(row._mapping) for row in result.fetchall()]
                
        except Exception as e:
            logger.error(f"Similar topic search failed: {str(e)}")
            return []
    
    def get_classification_stats(self) -> Dict[str, Any]:
        """Get classification statistics"""
        try:
            with self.db.session() as session:
                # Category distribution
                category_result = session.execute(text("""
                    SELECT predicted_category, COUNT(*) as count, AVG(confidence_score) as avg_confidence
                    FROM documents
                    WHERE predicted_category IS NOT NULL
                    GROUP BY predicted_category
                    ORDER BY count DESC
                """))
                
                categories = [dict(row._mapping) for row in category_result.fetchall()]
                
                # Recent performance
                recent_result = session.execute(text("""
                    SELECT AVG(confidence_score) as avg_confidence, COUNT(*) as total_classifications
                    FROM documents
                    WHERE created_at > NOW() - INTERVAL '24 hours'
                """))
                
                recent_stats = dict(recent_result.fetchone()._mapping)
                
                return {
                    'category_distribution': categories,
                    'recent_performance': recent_stats,
                    'total_topics': Topic.query.count(),
                    'total_nodes': Node.query.count(),
                    'total_documents': Document.query.count()
                }
                
        except Exception as e:
            logger.error(f"Stats retrieval failed: {str(e)}")
            return {}

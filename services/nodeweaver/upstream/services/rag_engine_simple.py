"""Simple RAG engine using basic text classification"""
import logging
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from models import Node, Topic, Document, ClassificationLog
from services.embeddings_simple import SimpleEmbeddingService
from config import Config
from utils.classification_profiles import predict_axtask_categories, resolve_classification_profile
from utils.life_mode import compute_life_mode_public

logger = logging.getLogger(__name__)

class SimpleRAGEngine:
    """Simple RAG engine for text classification and topic management"""
    
    def __init__(self, db):
        self.db = db
        self.embedding_service = SimpleEmbeddingService()
        
        # Classification parameters
        self.categories = Config.DEFAULT_CATEGORIES
        self.similarity_threshold = 0.6
        self.confidence_threshold = 0.7
        
        logger.info("Simple RAG Engine initialized")
    
    def classify_text(self, text: str, metadata: Dict = None) -> Dict[str, Any]:
        """Classify input text and return multiple topics/categories with confidence scores"""
        try:
            if not text or len(text.strip()) == 0:
                raise ValueError("Empty text provided")
            
            # Generate embedding for input text
            text_embedding = self.embedding_service.encode(text)
            
            # Multi-label classification - get all matching categories
            metadata = metadata or {}
            life_mode = compute_life_mode_public(metadata)
            classification_results = self._predict_categories_multi(text, metadata)
            
            # Get primary category (highest confidence)
            primary_category = classification_results[0] if classification_results else {'category': 'other', 'confidence': 0.3}
            
            # Find similar existing topics
            similar_topics = self.find_similar_topics(text, limit=5, threshold=0.4)
            
            # Create document record with topic associations
            topic_ids = [topic['topic_id'] for topic in similar_topics[:3]]  # Associate with top 3 similar topics
            
            doc_meta = {**metadata, 'life_mode': life_mode}
            doc = Document(
                content=text,
                embedding=json.dumps(text_embedding),
                predicted_category=primary_category['category'],
                confidence_score=primary_category['confidence'],
                topic_ids=topic_ids,
                meta_data=doc_meta
            )
            
            self.db.session.add(doc)
            self.db.session.commit()
            
            # Log classification with multiple categories
            log = ClassificationLog(
                input_text=text,
                predicted_category=primary_category['category'],
                confidence_score=primary_category['confidence'],
                similar_topics=[topic['topic_id'] for topic in similar_topics],
                similar_nodes=[],
                processing_time=0.1,
                meta_data={
                    **metadata,
                    'life_mode': life_mode,
                    'all_categories': classification_results,
                    'topic_associations': topic_ids
                }
            )
            
            self.db.session.add(log)
            self.db.session.commit()
            
            return {
                'predicted_category': primary_category['category'],
                'confidence_score': primary_category['confidence'],
                'all_categories': classification_results,
                'similar_topics': similar_topics,
                'topic_associations': topic_ids,
                'document_id': doc.doc_id,
                'life_mode': life_mode,
            }
            
        except Exception as e:
            logger.error(f"Text classification failed: {str(e)}")
            raise
    
    def _predict_categories_multi(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Multi-label classification - return all matching categories with confidence scores"""
        if resolve_classification_profile(metadata) == 'axtask':
            return self._apply_hidden_mood_bias(predict_axtask_categories(text), metadata)

        text_lower = text.lower().strip()
        categories = []
        
        # Define keyword categories with scoring
        category_keywords = {
            'work': {
                'keywords': ['work', 'job', 'office', 'meeting', 'client', 'project', 'deadline', 'business', 'colleague', 'boss', 'schedule', 'conference', 'presentation'],
                'base_confidence': 0.8
            },
            'personal': {
                'keywords': ['personal', 'family', 'home', 'myself', 'friend', 'hobby', 'vacation', 'weekend', 'birthday', 'gift', 'celebration', 'party', 'relationship'],
                'base_confidence': 0.8
            },
            'shopping': {
                'keywords': ['shopping', 'store', 'purchase', 'retail', 'order', 'delivery', 'product', 'find', 'get', 'buy', 'cake', 'food', 'groceries', 'market', 'price'],
                'base_confidence': 0.7
            },
            'academic': {
                'keywords': ['study', 'school', 'learn', 'academic', 'research', 'university', 'exam', 'homework', 'class', 'education', 'course', 'assignment'],
                'base_confidence': 0.8
            },
            'health': {
                'keywords': ['health', 'doctor', 'medical', 'sick', 'hospital', 'medicine', 'exercise', 'diet', 'wellness', 'fitness', 'treatment'],
                'base_confidence': 0.8
            },
            'finance': {
                'keywords': ['money', 'buy', 'pay', 'finance', 'bank', 'budget', 'investment', 'expense', 'income', 'cost', 'payment', 'savings'],
                'base_confidence': 0.8
            },
            'technology': {
                'keywords': ['technology', 'computer', 'software', 'app', 'website', 'internet', 'digital', 'code', 'tech', 'online', 'system'],
                'base_confidence': 0.7
            },
            'entertainment': {
                'keywords': ['movie', 'music', 'game', 'entertainment', 'tv', 'show', 'concert', 'sports', 'fun', 'play', 'watch'],
                'base_confidence': 0.7
            },
            'travel': {
                'keywords': ['travel', 'trip', 'vacation', 'hotel', 'flight', 'destination', 'tourism', 'visit', 'journey'],
                'base_confidence': 0.7
            },
            'political': {
                'keywords': ['political', 'government', 'policy', 'vote', 'election', 'senator', 'congress', 'politics', 'law', 'city council', 'council', 'zoning', 'municipal', 'civic', 'public hearing', 'ordinance', 'regulation'],
                'base_confidence': 0.85
            },
            'legal': {
                'keywords': ['legal', 'law', 'court', 'judge', 'lawyer', 'attorney', 'lawsuit', 'contract', 'regulation', 'compliance', 'zoning', 'ordinance', 'municipal law', 'jurisdiction', 'statute'],
                'base_confidence': 0.85
            }
        }
        
        # Score each category based on keyword matches
        for category, config in category_keywords.items():
            matches = sum(1 for keyword in config['keywords'] if keyword in text_lower)
            if matches > 0:
                # Calculate confidence based on number of matches and base confidence
                confidence = min(0.9, config['base_confidence'] + (matches - 1) * 0.05)
                categories.append({
                    'category': category,
                    'confidence': confidence,
                    'keyword_matches': matches
                })
        
        # Sort by confidence (highest first)
        categories.sort(key=lambda x: x['confidence'], reverse=True)
        
        # If no matches, return 'other'
        if not categories:
            categories.append({
                'category': 'other',
                'confidence': 0.3,
                'keyword_matches': 0
            })
        
        return self._apply_hidden_mood_bias(categories, metadata)

    def _apply_hidden_mood_bias(
        self,
        categories: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Apply small internal confidence nudges from hidden mood signals."""
        if not categories:
            return categories
        if not isinstance(metadata, dict):
            return categories

        internal = metadata.get('_nodeweaver_internal')
        if not isinstance(internal, dict):
            return categories

        mood = str(internal.get('mood', '')).lower()
        input_kind = str(internal.get('input_kind', '')).lower()
        if not mood:
            return categories

        adjustments = {}
        if input_kind == 'task' and mood == 'urgent':
            adjustments = {'development': 0.04, 'maintenance': 0.04, 'work': 0.03, 'technology': 0.03}
        elif input_kind == 'feedback' and mood in {'frustrated', 'concerned'}:
            adjustments = {'maintenance': 0.06, 'administrative': 0.03, 'work': 0.03}
        elif input_kind == 'note' and mood in {'frustrated', 'concerned', 'urgent'}:
            adjustments = {'maintenance': 0.04, 'administrative': 0.02, 'general': 0.03}
        elif input_kind == 'feedback' and mood == 'appreciative':
            adjustments = {'administrative': 0.03, 'work': 0.02}
        elif input_kind == 'expression' and mood == 'appreciative':
            adjustments = {'personal': 0.04, 'general': 0.02}
        elif input_kind == 'note' and mood in {'frustrated', 'concerned'}:
            adjustments = {'personal': 0.04, 'health': 0.03, 'general': 0.02}
        elif input_kind == 'note' and mood == 'appreciative':
            adjustments = {'personal': 0.05, 'general': 0.02}
        elif input_kind == 'forum' and mood in {'frustrated', 'concerned'}:
            adjustments = {'maintenance': 0.06, 'administrative': 0.04, 'political': 0.03}
        elif input_kind == 'forum' and mood == 'urgent':
            adjustments = {'maintenance': 0.07, 'development': 0.04, 'work': 0.03}
        elif input_kind == 'forum' and mood == 'appreciative':
            adjustments = {'administrative': 0.03, 'general': 0.03, 'personal': 0.02}

        if not adjustments:
            return categories

        for item in categories:
            category_key = str(item.get('category', '')).strip().lower()
            if category_key in adjustments:
                item['confidence'] = min(0.98, float(item.get('confidence', 0.0)) + adjustments[category_key])

        categories.sort(key=lambda x: x['confidence'], reverse=True)
        return categories
    
    def get_topics(self, limit: int = 10) -> List[Dict]:
        """Get all topics"""
        try:
            topics = Topic.query.limit(limit).all()
            return [topic.to_dict() for topic in topics]
        except Exception as e:
            logger.error(f"Failed to get topics: {str(e)}")
            return []
    
    def create_topic(self, label: str, category: str = None) -> Dict:
        """Create a new topic"""
        try:
            topic = Topic(
                label=label,
                category=category,
                total_weight=1.0,
                coherence_score=0.8,
                meta_data={}
            )
            
            self.db.session.add(topic)
            self.db.session.commit()
            
            return topic.to_dict()
            
        except Exception as e:
            logger.error(f"Failed to create topic: {str(e)}")
            raise
    
    def detect_emerging_topics(self) -> List[Dict]:
        """Detect emerging topics from recent classifications (placeholder implementation)"""
        try:
            # For now, return existing topics as a placeholder
            # In full implementation, this would use clustering on recent nodes
            topics = Topic.query.order_by(Topic.total_weight.desc()).limit(5).all()
            logger.info(f"Detected {len(topics)} emerging topics (placeholder)")
            return [topic.to_dict() for topic in topics]
        except Exception as e:
            logger.error(f"Failed to detect emerging topics: {str(e)}")
            return []
    
    def find_similar_topics(self, text: str, limit: int = 10, threshold: float = 0.5) -> List[Dict]:
        """Find topics similar to input text (placeholder implementation)"""
        try:
            # For now, return a simple keyword-based match
            # In full implementation, this would use semantic similarity
            topics = Topic.query.limit(limit).all()
            similar_topics = []
            
            text_lower = text.lower()
            for topic in topics:
                # Simple keyword matching
                metadata = topic.meta_data or {}
                keywords = metadata.get('keywords', [])
                
                matches = sum(1 for keyword in keywords if keyword.lower() in text_lower)
                if matches > 0:
                    score = min(0.9, matches * 0.2 + 0.3)  # Simple scoring
                    similar_topics.append({
                        **topic.to_dict(),
                        'similarity_score': score
                    })
            
            # Sort by similarity score
            similar_topics.sort(key=lambda x: x['similarity_score'], reverse=True)
            logger.info(f"Found {len(similar_topics)} similar topics for text: {text[:50]}...")
            return similar_topics
            
        except Exception as e:
            logger.error(f"Failed to find similar topics: {str(e)}")
            return []
    
    def add_training_data(self, text: str, category: str, metadata: Dict = None):
        """Add training data to improve classification accuracy"""
        try:
            # Create a training example that will influence future classifications
            training_doc = Document(
                content=text,
                embedding=json.dumps(self.embedding_service.encode(text)),
                predicted_category=category,
                confidence_score=0.95,  # High confidence for training data
                meta_data={
                    **(metadata or {}),
                    'is_training_data': True,
                    'user_corrected_category': category,
                    'training_timestamp': str(datetime.now())
                }
            )
            
            self.db.session.add(training_doc)
            self.db.session.commit()
            
            # Update keyword associations for the category
            self._update_category_keywords(text, category)
            
            logger.info(f"Added training data: {category} - {text[:50]}...")
            return training_doc.doc_id
            
        except Exception as e:
            logger.error(f"Failed to add training data: {str(e)}")
            raise
    
    def _update_category_keywords(self, text: str, category: str):
        """Extract and store new keywords for category improvement"""
        try:
            # Extract potential new keywords from training text
            words = text.lower().split()
            significant_words = [w for w in words if len(w) > 3 and w.isalpha()]
            
            # Store these associations for future use
            # In a full implementation, this would update the keyword database
            logger.info(f"Learned new keywords for {category}: {significant_words[:5]}")
            
        except Exception as e:
            logger.error(f"Failed to update category keywords: {str(e)}")
    
    def correct_classification(self, text: str, correct_category: str, metadata: Dict = None):
        """Correct a misclassification and learn from it"""
        try:
            # Find the original classification
            original_log = ClassificationLog.query.filter_by(
                input_text=text
            ).order_by(ClassificationLog.log_id.desc()).first()
            
            if original_log:
                # Add correction metadata
                correction_metadata = {
                    **(metadata or {}),
                    'original_category': original_log.predicted_category,
                    'corrected_category': correct_category,
                    'correction_timestamp': str(datetime.now()),
                    'is_correction': True
                }
                
                # Add as training data
                self.add_training_data(text, correct_category, correction_metadata)
                
                logger.info(f"Corrected classification: '{text[:50]}...' from {original_log.predicted_category} to {correct_category}")
                return True
            else:
                logger.warning(f"No original classification found for text: {text[:50]}...")
                return False
                
        except Exception as e:
            logger.error(f"Failed to correct classification: {str(e)}")
            raise
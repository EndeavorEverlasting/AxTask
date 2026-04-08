import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Any, Tuple
import logging
from models import Node, Topic, NodeRelationship
from app import db
from services.embeddings import EmbeddingService

logger = logging.getLogger(__name__)

class TopicDetector:
    """Service for detecting emerging topics from weighted node convergence"""
    
    def __init__(self, embedding_service: EmbeddingService):
        self.embedding_service = embedding_service
        
        # Topic emergence thresholds
        self.convergence_threshold = 0.7
        self.min_cluster_size = 3
        self.coherence_threshold = 0.6
        self.max_clusters = 50
    
    def detect_emerging_topics(self, min_nodes: int = 5) -> List[Topic]:
        """Detect topics from node convergence using clustering"""
        try:
            # Get nodes with sufficient weight
            nodes = Node.query.filter(Node.weight >= 0.5).order_by(Node.weight.desc()).all()
            
            if len(nodes) < min_nodes:
                logger.info(f"Insufficient nodes for topic detection: {len(nodes)} < {min_nodes}")
                return []
            
            logger.info(f"Analyzing {len(nodes)} nodes for topic emergence")
            
            # Prepare embeddings and metadata
            embeddings = []
            node_data = []
            
            for node in nodes:
                if node.embedding is not None:
                    embeddings.append(node.embedding)
                    node_data.append(node)
            
            if len(embeddings) < self.min_cluster_size:
                logger.warning("Insufficient embeddings for clustering")
                return []
            
            embeddings = np.array(embeddings)
            
            # Perform clustering
            clusters = self._cluster_nodes(embeddings)
            
            # Generate topics from clusters
            emerging_topics = self._generate_topics_from_clusters(clusters, node_data, embeddings)
            
            # Save topics to database
            saved_topics = self._save_topics(emerging_topics)
            
            logger.info(f"Detected {len(saved_topics)} emerging topics")
            return saved_topics
            
        except Exception as e:
            logger.error(f"Topic detection failed: {str(e)}")
            return []
    
    def _cluster_nodes(self, embeddings: np.ndarray) -> np.ndarray:
        """Cluster node embeddings using DBSCAN"""
        try:
            # Use DBSCAN for density-based clustering
            eps = 1 - self.convergence_threshold  # Convert similarity to distance
            clustering = DBSCAN(
                eps=eps,
                min_samples=self.min_cluster_size,
                metric='cosine'
            ).fit(embeddings)
            
            labels = clustering.labels_
            n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
            n_noise = list(labels).count(-1)
            
            logger.info(f"DBSCAN clustering: {n_clusters} clusters, {n_noise} noise points")
            
            # If too few clusters, try K-means as fallback
            if n_clusters < 2:
                logger.info("Fallback to K-means clustering")
                n_clusters_kmeans = min(len(embeddings) // self.min_cluster_size, 10)
                if n_clusters_kmeans >= 2:
                    kmeans = KMeans(n_clusters=n_clusters_kmeans, random_state=42, n_init=10)
                    labels = kmeans.fit_predict(embeddings)
            
            return labels
            
        except Exception as e:
            logger.error(f"Clustering failed: {str(e)}")
            return np.array([-1] * len(embeddings))
    
    def _generate_topics_from_clusters(self, cluster_labels: np.ndarray, 
                                     nodes: List[Node], embeddings: np.ndarray) -> List[Dict[str, Any]]:
        """Generate topic definitions from clusters"""
        topics = []
        
        for cluster_id in set(cluster_labels):
            if cluster_id == -1:  # Skip noise
                continue
            
            # Get nodes in this cluster
            cluster_mask = cluster_labels == cluster_id
            cluster_nodes = [nodes[i] for i in np.where(cluster_mask)[0]]
            cluster_embeddings = embeddings[cluster_mask]
            
            if len(cluster_nodes) < self.min_cluster_size:
                continue
            
            # Calculate cluster coherence
            coherence_score = self._calculate_coherence(cluster_embeddings)
            
            if coherence_score < self.coherence_threshold:
                logger.debug(f"Cluster {cluster_id} below coherence threshold: {coherence_score:.3f}")
                continue
            
            # Generate topic metadata
            topic_data = self._create_topic_metadata(cluster_nodes, cluster_embeddings, coherence_score)
            topics.append(topic_data)
        
        return topics
    
    def _calculate_coherence(self, embeddings: np.ndarray) -> float:
        """Calculate cluster coherence using average pairwise similarity"""
        if len(embeddings) <= 1:
            return 1.0
        
        try:
            similarities = cosine_similarity(embeddings)
            # Get upper triangle (excluding diagonal)
            mask = np.triu(np.ones_like(similarities, dtype=bool), k=1)
            coherence = similarities[mask].mean()
            return float(coherence)
        except Exception as e:
            logger.error(f"Coherence calculation failed: {str(e)}")
            return 0.0
    
    def _create_topic_metadata(self, nodes: List[Node], embeddings: np.ndarray, 
                             coherence_score: float) -> Dict[str, Any]:
        """Create topic metadata from cluster nodes"""
        try:
            # Calculate centroid embedding
            centroid = np.mean(embeddings, axis=0)
            
            # Determine topic category from nodes
            categories = [node.category for node in nodes if node.category]
            if categories:
                # Use most common category
                category = max(set(categories), key=categories.count)
            else:
                category = 'other'
            
            # Calculate total weight
            total_weight = sum(node.weight for node in nodes)
            
            # Generate topic label
            # Use the highest weighted node's content as base
            top_node = max(nodes, key=lambda x: x.weight or 0)
            label = self._generate_topic_label(nodes, category)
            
            # Extract key terms for metadata
            key_terms = [node.content[:50] for node in sorted(nodes, key=lambda x: x.weight or 0, reverse=True)][:5]
            
            return {
                'label': label,
                'category': category,
                'centroid_embedding': centroid,
                'origin_node_ids': [node.node_id for node in nodes],
                'total_weight': total_weight,
                'coherence_score': coherence_score,
                'metadata': {
                    'cluster_size': len(nodes),
                    'key_terms': key_terms,
                    'avg_node_weight': total_weight / len(nodes),
                    'category_distribution': {cat: categories.count(cat) for cat in set(categories)} if categories else {}
                }
            }
            
        except Exception as e:
            logger.error(f"Topic metadata creation failed: {str(e)}")
            return {}
    
    def _generate_topic_label(self, nodes: List[Node], category: str) -> str:
        """Generate a descriptive label for the topic"""
        try:
            # Use the most weighted node's content
            top_node = max(nodes, key=lambda x: x.weight or 0)
            content_words = top_node.content.split()[:3]  # First 3 words
            
            # Create label with category prefix
            label = f"{category.title()}: {' '.join(content_words)}"
            
            return label[:100]  # Limit length
            
        except Exception as e:
            logger.error(f"Label generation failed: {str(e)}")
            return f"{category.title()}: Unknown Topic"
    
    def _save_topics(self, topic_data_list: List[Dict[str, Any]]) -> List[Topic]:
        """Save topics to database"""
        saved_topics = []
        
        try:
            for topic_data in topic_data_list:
                # Check if similar topic already exists
                if self._topic_exists(topic_data):
                    logger.debug(f"Similar topic already exists: {topic_data['label']}")
                    continue
                
                # Create new topic
                topic = Topic(
                    label=topic_data['label'],
                    category=topic_data['category'],
                    centroid_embedding=topic_data['centroid_embedding'].tolist(),
                    origin_node_ids=topic_data['origin_node_ids'],
                    total_weight=topic_data['total_weight'],
                    coherence_score=topic_data['coherence_score'],
                    metadata=topic_data['metadata']
                )
                
                db.session.add(topic)
                saved_topics.append(topic)
            
            if saved_topics:
                db.session.commit()
                logger.info(f"Saved {len(saved_topics)} new topics")
            
            return saved_topics
            
        except Exception as e:
            logger.error(f"Topic saving failed: {str(e)}")
            db.session.rollback()
            return []
    
    def _topic_exists(self, topic_data: Dict[str, Any], similarity_threshold: float = 0.9) -> bool:
        """Check if a similar topic already exists"""
        try:
            # Check for topics with similar centroids
            existing_topics = Topic.query.filter_by(category=topic_data['category']).all()
            
            query_embedding = topic_data['centroid_embedding']
            
            for existing_topic in existing_topics:
                if existing_topic.centroid_embedding is not None:
                    similarity = self.embedding_service.similarity(
                        query_embedding, 
                        np.array(existing_topic.centroid_embedding)
                    )
                    
                    if similarity > similarity_threshold:
                        return True
            
            return False
            
        except Exception as e:
            logger.error(f"Topic existence check failed: {str(e)}")
            return False
    
    def update_node_relationships(self, node_id: int):
        """Update relationships for a node based on similarity"""
        try:
            node = Node.query.get(node_id)
            if not node or node.embedding is None:
                return
            
            # Find similar nodes
            similar_nodes = self._find_similar_nodes(node.embedding, exclude_id=node_id)
            
            # Update relationships
            for similar_node, similarity in similar_nodes:
                self._update_relationship(node_id, similar_node.node_id, similarity)
            
            db.session.commit()
            logger.debug(f"Updated relationships for node {node_id}")
            
        except Exception as e:
            logger.error(f"Node relationship update failed: {str(e)}")
            db.session.rollback()
    
    def _find_similar_nodes(self, query_embedding: np.ndarray, 
                          exclude_id: int = None, limit: int = 20) -> List[Tuple[Node, float]]:
        """Find nodes similar to query embedding"""
        try:
            # Get all nodes with embeddings
            query = Node.query.filter(Node.embedding.isnot(None))
            if exclude_id:
                query = query.filter(Node.node_id != exclude_id)
            
            nodes = query.all()
            
            if not nodes:
                return []
            
            # Calculate similarities
            embeddings = np.array([node.embedding for node in nodes])
            similarities = self.embedding_service.batch_similarity(query_embedding, embeddings)
            
            # Sort by similarity and return top results
            similar_pairs = list(zip(nodes, similarities))
            similar_pairs.sort(key=lambda x: x[1], reverse=True)
            
            # Filter by threshold
            threshold = self.convergence_threshold
            filtered_pairs = [(node, sim) for node, sim in similar_pairs if sim >= threshold]
            
            return filtered_pairs[:limit]
            
        except Exception as e:
            logger.error(f"Similar node search failed: {str(e)}")
            return []
    
    def _update_relationship(self, node_id_1: int, node_id_2: int, similarity: float):
        """Update or create node relationship"""
        try:
            # Ensure consistent ordering
            if node_id_1 > node_id_2:
                node_id_1, node_id_2 = node_id_2, node_id_1
            
            # Check if relationship exists
            relationship = NodeRelationship.query.filter_by(
                node_id_1=node_id_1, 
                node_id_2=node_id_2
            ).first()
            
            if relationship:
                # Update existing relationship
                relationship.similarity_score = similarity
                relationship.co_occurrence_count += 1
            else:
                # Create new relationship
                relationship = NodeRelationship(
                    node_id_1=node_id_1,
                    node_id_2=node_id_2,
                    similarity_score=similarity,
                    co_occurrence_count=1
                )
                db.session.add(relationship)
            
        except Exception as e:
            logger.error(f"Relationship update failed: {str(e)}")

from app import db
from sqlalchemy import Text, Integer, Float, ARRAY, JSON, DateTime, func
import datetime

class Node(db.Model):
    __tablename__ = 'nodes'
    
    node_id = db.Column(Integer, primary_key=True)
    content = db.Column(Text, nullable=False)
    embedding = db.Column(Text)  # sentence-transformers embedding as JSON text
    frequency = db.Column(Integer, default=1)
    weight = db.Column(Float, default=1.0)
    category = db.Column(db.String(100))  # personal, work, academic, political, etc.
    meta_data = db.Column(JSON, default=dict)
    created_at = db.Column(DateTime, default=datetime.datetime.utcnow)
    
    def to_dict(self):
        return {
            'node_id': self.node_id,
            'content': self.content,
            'frequency': self.frequency,
            'weight': self.weight,
            'category': self.category,
            'metadata': self.meta_data,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Topic(db.Model):
    __tablename__ = 'topics'
    
    topic_id = db.Column(Integer, primary_key=True)
    label = db.Column(Text, nullable=False)
    centroid_embedding = db.Column(Text)  # centroid embedding as JSON text
    origin_node_ids = db.Column(ARRAY(Integer))
    total_weight = db.Column(Float)
    coherence_score = db.Column(Float)
    category = db.Column(db.String(100))
    meta_data = db.Column(JSON, default=dict)
    created_at = db.Column(DateTime, default=datetime.datetime.utcnow)
    
    def to_dict(self):
        return {
            'topic_id': self.topic_id,
            'label': self.label,
            'total_weight': self.total_weight,
            'coherence_score': self.coherence_score,
            'category': self.category,
            'origin_node_ids': self.origin_node_ids,
            'metadata': self.meta_data,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Document(db.Model):
    __tablename__ = 'documents'
    
    doc_id = db.Column(Integer, primary_key=True)
    content = db.Column(Text, nullable=False)
    embedding = db.Column(Text)  # document embedding as JSON text
    topic_ids = db.Column(ARRAY(Integer))
    predicted_category = db.Column(db.String(100))
    confidence_score = db.Column(Float)
    meta_data = db.Column(JSON, default=dict)
    created_at = db.Column(DateTime, default=datetime.datetime.utcnow)
    
    def to_dict(self):
        return {
            'doc_id': self.doc_id,
            'content': self.content,
            'topic_ids': self.topic_ids,
            'predicted_category': self.predicted_category,
            'confidence_score': self.confidence_score,
            'metadata': self.meta_data,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class NodeRelationship(db.Model):
    __tablename__ = 'node_relationships'
    
    rel_id = db.Column(Integer, primary_key=True)
    node_id_1 = db.Column(Integer, db.ForeignKey('nodes.node_id'), nullable=False)
    node_id_2 = db.Column(Integer, db.ForeignKey('nodes.node_id'), nullable=False)
    similarity_score = db.Column(Float)
    co_occurrence_count = db.Column(Integer, default=1)
    created_at = db.Column(DateTime, default=datetime.datetime.utcnow)
    
    __table_args__ = (
        db.UniqueConstraint('node_id_1', 'node_id_2', name='unique_node_relationship'),
    )

class ClassificationLog(db.Model):
    __tablename__ = 'classification_logs'
    
    log_id = db.Column(Integer, primary_key=True)
    input_text = db.Column(Text, nullable=False)
    predicted_category = db.Column(db.String(100))
    confidence_score = db.Column(Float)
    similar_topics = db.Column(JSON)
    similar_nodes = db.Column(JSON)
    processing_time = db.Column(Float)
    meta_data = db.Column(JSON, default=dict)
    created_at = db.Column(DateTime, default=datetime.datetime.utcnow)
    
    def to_dict(self):
        return {
            'log_id': self.log_id,
            'input_text': self.input_text,
            'predicted_category': self.predicted_category,
            'confidence_score': self.confidence_score,
            'similar_topics': self.similar_topics,
            'similar_nodes': self.similar_nodes,
            'processing_time': self.processing_time,
            'metadata': self.meta_data,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
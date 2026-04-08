# NodeWeaver - RAG Classifier API

## Overview

NodeWeaver is an intelligent Retrieval-Augmented Generation (RAG) classifier API designed for automatic task categorization and real-time topic detection. The system leverages semantic embeddings and weighted node convergence to classify text into categories like personal, work, academic, political, and others. Built with a focus on productivity automation, NodeWeaver integrates seamlessly with AxTask and Google Sheets to provide intelligent task organization capabilities.

**Version: 1.0.3 - Learning & Classification Enhancement** - NodeWeaver now features sophisticated learning mechanisms with classification correction and training data integration. The system can learn from misclassifications and adapt to domain-specific terminology, with enhanced political/legal category detection for better government meeting classification.

**Live Audio Topic Detection** - NodeWeaver features real-time audio processing capabilities, perfect for analyzing debates, meetings, YouTube videos, and any audio content. Users can upload audio files or use live microphone input to get instant topic classification as the content plays.

The system implements a sophisticated architecture where topics emerge from weighted node convergence using clustering algorithms, allowing for dynamic discovery of new patterns and categories in text data. This approach enables the system to adapt and learn from usage patterns while maintaining high classification accuracy.

## Recent Changes (2025-08-04)

### Version 1.0.3 - Learning & Classification Enhancement (Latest)
✓ Added sophisticated learning mechanisms with classification correction and training data integration
✓ New /api/v1/correct endpoint to correct misclassifications and learn from them
✓ New /api/v1/train endpoint to add labeled training examples for category improvement
✓ Enhanced category detection with dedicated "legal" category and improved political keywords
✓ Better confidence scoring for legal/political categories (0.85 vs 0.7) for more accurate classification
✓ Real-world testing: "city council meeting" now correctly classified as political (0.9) vs work (0.8)
✓ Comprehensive learning documentation in LEARNING_MECHANISMS.md
✓ Keyword extraction and storage from training data for continuous improvement

### Version 1.0.2 - Multi-Classification Enhancement
✓ Implemented multi-label classification - entries can have multiple topics/categories
✓ Updated business rules for many-to-many relationships between entries and topics
✓ Enhanced classification engine to return all matching categories with confidence scores
✓ Added automatic topic associations based on similarity scoring
✓ Improved keyword matching with better confidence calculation
✓ Classification now shows both primary category and all related topics
✓ Testing shows perfect results: "cake for birthday party" = personal + shopping
✓ Complex text gets multiple categories: "meeting + cake" = work + personal + finance + shopping

### System Debug and Gap Analysis
✓ Fixed JavaScript "TopicSenseClient is not defined" errors - completed rebranding
✓ Fixed Flask "'Flask' object has no attribute 'rag_engine'" - corrected extension access pattern
✓ Analyzed classification system - identified "unknown" issue in user images
✓ Created comprehensive SYSTEM_GAPS_ANALYSIS.md documenting current state and roadmap
✓ Enhanced simple classification keywords for better categorization
✓ System now functional with multi-label classification capabilities

### Application Rebranding to NodeWeaver
✓ Updated project name from TopicSense to NodeWeaver across all files
✓ Updated pyproject.toml package name and description
✓ Updated all documentation files (README.md, API_DOCUMENTATION.md, etc.)
✓ Updated HTML templates and web interface branding
✓ Updated Docker configuration and database references
✓ Updated configuration files and initialization scripts

### Version 1.0.1 Bug Fix Release
✓ Fixed Flask extensions compatibility for production deployment
✓ Resolved LSP type checking errors in app.py
✓ Implemented proper Flask extensions pattern for service storage
✓ Updated all version references to 1.0.1

### Version 1.0.0 Release Preparation
✓ Updated project metadata and versioning in pyproject.toml  
✓ Created comprehensive VERSION.md with release history
✓ Added CHANGELOG.md following Keep a Changelog format
✓ Implemented proper MIT LICENSE
✓ Created detailed CONTRIBUTING.md guidelines
✓ Added comprehensive API_DOCUMENTATION.md
✓ Created DEPLOYMENT.md with multiple deployment options
✓ Implemented SECURITY.md with security policies
✓ Added .gitignore for clean repository
✓ Created Dockerfile with multi-stage build
✓ Updated docker-compose.yml with production configuration
✓ Added .env.example for environment setup
✓ Implemented version information in application config

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Framework
- **Flask Application**: Core web framework with RESTful API design
- **SQLAlchemy ORM**: Database abstraction layer with declarative models
- **Blueprint Architecture**: Modular API organization with separate blueprints for classification and topic management

### Database Design
- **PostgreSQL with pgvector**: Primary database with vector similarity search capabilities
- **Vector Embeddings**: 384-dimensional vectors using sentence-transformers
- **Node-Based Architecture**: Discrete semantic units stored as weighted nodes
- **Topic Emergence**: Topics automatically detected through weighted node convergence using DBSCAN clustering
- **Relationship Modeling**: Captures semantic relationships between nodes and topics

### Core Services
- **RAG Engine**: Central classification engine coordinating embeddings, similarity search, and prediction
- **Audio Processor**: Real-time audio transcription and topic detection service
- **Embedding Service**: Text-to-vector conversion using rule-based and semantic approaches
- **Topic Detector**: Clustering-based topic emergence detection with configurable thresholds
- **Vector Similarity Search**: Text-based similarity search with future PostgreSQL pgvector integration

### API Architecture
- **Classification Endpoint**: `/api/v1/classify` for single text classification
- **Audio Processing Endpoints**: `/api/v1/audio/*` for real-time audio analysis and file upload
- **Topics Management**: `/api/v1/topics` for topic discovery and retrieval
- **Batch Processing**: Support for processing up to 100 texts simultaneously
- **Live Audio Streaming**: Real-time topic updates with WebSocket-ready architecture
- **Confidence Scoring**: Each classification includes confidence scores and similar topic/node discovery

### Frontend Components
- **Web Interface**: Bootstrap-based dark theme UI for testing and documentation
- **Live Audio Interface**: Real-time audio topic detection with visual feedback and transcription
- **API Documentation**: Interactive documentation with code examples
- **Test Interface**: Real-time classification testing with metadata support

### Integration Layer
- **AxTask Client**: Python client for seamless AxTask productivity integration
- **Google Apps Script**: JavaScript integration for Google Sheets automation
- **RESTful API**: Platform-independent integration support

## External Dependencies

### Core Technologies
- **Flask**: Web framework and API server
- **SQLAlchemy**: Database ORM and query builder
- **PostgreSQL**: Primary database with JSONB and array support
- **pgvector**: Vector similarity search extension
- **sentence-transformers**: Text embedding generation (all-MiniLM-L6-v2 model)

### Machine Learning Libraries
- **scikit-learn**: Clustering algorithms (DBSCAN, KMeans) for topic detection
- **numpy**: Numerical computing for vector operations
- **scipy**: Scientific computing for similarity calculations

### Integration Services
- **AxTask**: Productivity automation platform integration
- **Google Sheets API**: Apps Script integration for spreadsheet automation
- **Google Apps Script**: Server-side JavaScript for Google Workspace

### Development Tools
- **Docker**: Containerization with PostgreSQL and pgvector setup
- **Bootstrap**: Frontend UI framework with dark theme
- **Font Awesome**: Icon library for UI components
- **JavaScript Fetch API**: Client-side API communication

### Optional Enhancements
- **Redis**: Caching layer for improved response times (configurable)
- **OpenAI API**: Alternative embedding provider (configurable)
- **Various Embedding Models**: Configurable through environment variables
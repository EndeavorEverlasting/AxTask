# NodeWeaver Version History

## Version 1.0.2 (2025-08-04) - Multi-Classification Enhancement

### 🚀 Major Features
- **Multi-label Classification**: Entries can now have multiple topics/categories with individual confidence scores
- **Many-to-Many Relationships**: Business rule updated to support entries relating to multiple topics and topics having multiple entries
- **Enhanced Topic Associations**: Documents automatically associate with similar existing topics
- **Comprehensive Classification Results**: API returns all matching categories, not just the primary one

### 🔄 Changed Business Rules
- **Entry-Topic Relationship**: One entry can have many topics/classifications
- **Topic-Entry Relationship**: One topic can relate to many entries  
- **Confidence Scoring**: Each category association has individual confidence scores
- **Primary Classification**: Highest confidence category remains as primary for backward compatibility

### 🔧 Technical Updates
- Classification engine now returns `all_categories` array with confidence scores for each match
- Document model enhanced with `topic_associations` for many-to-many relationships
- Classification logs now store multiple category matches and topic associations
- Improved keyword matching with better confidence scoring based on multiple matches
- `classify_text()` method completely rewritten for multi-label support
- New `_predict_categories_multi()` method replaces single-category prediction

---

## Version 1.0.3 (2025-08-05) - Learning & Classification Enhancement

### 🧠 Learning Mechanisms
- **Classification Correction**: New `/api/v1/correct` endpoint to correct misclassifications and learn from them
- **Training Data Integration**: New `/api/v1/train` endpoint to add labeled training examples
- **Keyword Learning**: System extracts and stores new keywords from training data for category improvement
- **Corrective Feedback Loop**: When classifications are corrected, system learns and improves future accuracy

### 🎯 Enhanced Category Detection
- **New Legal Category**: Added dedicated "legal" category with specialized keywords (law, court, judge, attorney, etc.)
- **Improved Political Keywords**: Enhanced political category with municipal terms (city council, zoning, ordinance, civic, etc.)
- **Better Confidence Scoring**: Legal and political categories now have higher base confidence (0.85) for more accurate classification
- **Nuanced Distinction**: System can now distinguish between general "work" meetings vs. "political/legal" government meetings

### 📊 Real-World Testing Results
- **Before**: "Attend city council meeting about zoning changes" → work (0.8)
- **After**: "Attend city council meeting about zoning changes" → political (0.9), legal (0.85), work (0.8)
- **Improvement**: System correctly prioritizes political/legal nature over generic work classification

### 🔧 Technical Improvements
- Added `add_training_data()` method for supervised learning integration
- Added `correct_classification()` method for corrective feedback
- Enhanced keyword extraction and storage from training examples
- Improved category keyword databases with domain-specific terms
- Added training metadata tracking for learning analysis

### 📝 Documentation Enhancements
- Comprehensive learning mechanism documentation
- Training and correction API endpoint specifications
- Category enhancement guidelines and examples
- Learning feedback loop architecture documentation

---

## Version 1.0.1 (2025-08-04) - Bug Fix Release

### 🐛 Bug Fixes
- **Flask Extensions Compatibility**: Fixed LSP type checking errors for Flask app.rag_engine attribute
- **Service Initialization**: Moved RAG engine to proper Flask extensions pattern using app.extensions dictionary
- **Application Startup**: Resolved AttributeError during application initialization in production mode

### 🔧 Technical Changes
- Implemented proper Flask extensions pattern for service storage
- Added extensions dictionary initialization for better Flask compatibility
- Enhanced error handling during service initialization

---

## Version 1.0.0 (2025-08-04) - Production Release

### 🎉 Major Features
- **Complete RAG Classification System**: Full implementation of retrieval-augmented generation for text classification
- **Real-time Audio Processing**: Live audio topic detection with WebSocket support
- **Topic Emergence Detection**: Advanced clustering algorithms for dynamic topic discovery
- **Multi-platform Integration**: AxTask and Google Sheets integration ready
- **Production-Ready API**: RESTful endpoints with comprehensive error handling

### 🔧 Core Components
- **Flask Application Framework**: Modular blueprint architecture
- **PostgreSQL with pgvector**: Vector similarity search capabilities
- **Sentence Transformers**: 384-dimensional semantic embeddings
- **Audio Processing Pipeline**: Speech-to-text with real-time classification
- **Web Interface**: Complete test interface and live audio dashboard

### 📚 API Endpoints
- `POST /api/v1/classify` - Text classification with confidence scoring
- `POST /api/v1/audio/upload` - Audio file processing and classification
- `GET /api/v1/audio/live` - Real-time audio processing interface
- `GET /api/v1/topics` - Topic discovery and management
- `GET /api/v1/topics/detect` - Batch topic emergence detection

### 🛠 Technical Architecture
- **Database Models**: User, Node, Topic, Classification with relationship modeling
- **Service Layer**: RAG Engine, Audio Processor, Embedding Service, Topic Detector
- **Vector Operations**: Semantic similarity search with weighted node convergence
- **Audio Processing**: LibROSA, PyAudio, SpeechRecognition, WebRTC VAD
- **Machine Learning**: Scikit-learn clustering, Sentence Transformers embeddings

### 📦 Dependencies
- Flask 3.1.1+ with SQLAlchemy ORM
- PostgreSQL with pgvector extension
- sentence-transformers for embeddings
- librosa and pyaudio for audio processing
- scikit-learn for clustering algorithms
- gunicorn for production WSGI server

### 🔗 Integrations
- **AxTask Client**: Productivity automation integration
- **Google Apps Script**: Spreadsheet categorization automation
- **Docker Support**: Complete containerization with docker-compose
- **Database Migration**: Automated schema creation and management

### 📋 Configuration
- Environment-based configuration with sensible defaults
- Configurable thresholds for topic detection and clustering
- Scalable vector dimensions and embedding models
- Production-ready logging and monitoring

---

## Previous Versions

### Version 0.1.0 (Development)
- Initial development and proof of concept
- Basic classification capabilities
- Foundation architecture implementation

---

## Upgrade Notes

### Upgrading to 1.0.0
- This is the first production release
- All APIs are stable and backward compatible
- Database migrations handled automatically
- Configuration environment variables may need updating

### Breaking Changes
- None (initial production release)

### Deprecations
- None

---

## Release Schedule

- **Major versions** (x.0.0): New features, potential breaking changes
- **Minor versions** (1.x.0): New features, backward compatible
- **Patch versions** (1.0.x): Bug fixes, security updates

---

## Support

For issues and feature requests, please refer to the project documentation or contact the development team.
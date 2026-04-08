import os
import logging
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from werkzeug.middleware.proxy_fix import ProxyFix

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

def create_app():
    # Create the app
    app = Flask(__name__)
    app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key-change-in-production")
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
    
    # Configure the database
    database_url = os.environ.get("DATABASE_URL", "postgresql://rag_user:rag_pass@localhost:5432/nodeweaver")
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    
    # Initialize the app with the extension
    db.init_app(app)
    
    # Initialize Flask extensions dictionary if not exists
    if not hasattr(app, 'extensions'):
        app.extensions = {}
    
    with app.app_context():
        # Import models to ensure tables are created
        import models
        db.create_all()
        
        # Initialize services and store in app context
        from services.rag_engine_simple import SimpleRAGEngine
        rag_engine = SimpleRAGEngine(db)
        app.extensions['rag_engine'] = rag_engine
        logger.info("Simple RAG Engine initialized")
    
    # Register blueprints
    from api.classifier import classifier_bp
    from api.topics import topics_bp
    from api.audio import audio_bp, init_audio_processor
    from api.mode import mode_bp
    from services.mode_maintenance import start_mode_maintenance

    app.register_blueprint(classifier_bp, url_prefix='/api/v1')
    app.register_blueprint(topics_bp, url_prefix='/api/v1')
    app.register_blueprint(audio_bp, url_prefix='/api/v1')
    app.register_blueprint(mode_bp, url_prefix='/api/v1')

    start_mode_maintenance(app)
    
    # Initialize audio processor
    with app.app_context():
        init_audio_processor(app.extensions['rag_engine'])
    
    # Main routes
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/docs')
    def api_docs():
        return render_template('api_docs.html')
    
    @app.route('/test')
    def test_interface():
        return render_template('test_interface.html')
    
    @app.route('/live')
    def live_audio():
        return render_template('live_audio.html')
    
    # Health check and version endpoints
    @app.route('/health')
    def health_check():
        """Health check endpoint for load balancers and monitoring"""
        from config import Config
        from datetime import datetime
        try:
            # Basic database connectivity check
            db.session.execute(db.text('SELECT 1'))
            db_status = 'healthy'
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            db_status = 'unhealthy'
        
        return {
            'status': 'healthy' if db_status == 'healthy' else 'unhealthy',
            'version': Config.APP_VERSION,
            'database': db_status,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }, 200 if db_status == 'healthy' else 503
    
    @app.route('/api/v1/version')
    def version_info():
        """Get application version information"""
        from config import Config
        return {
            'version': Config.APP_VERSION,
            'api_version': Config.API_VERSION,
            'name': 'NodeWeaver',
            'description': 'RAG Classifier API for automatic task categorization with audio processing capabilities'
        }
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Endpoint not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {error}")
        return jsonify({'error': 'Internal server error'}), 500
    
    return app

# Create app instance
app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

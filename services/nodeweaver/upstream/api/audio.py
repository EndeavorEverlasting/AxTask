"""Audio processing API endpoints"""
from flask import Blueprint, request, jsonify, current_app
import logging
from services.audio_processor_simple import SimpleAudioProcessor, SimpleAudioTopicStreamer

logger = logging.getLogger(__name__)

audio_bp = Blueprint('audio', __name__)

# Global audio processor instance
audio_processor = None
topic_streamer = None

def init_audio_processor(rag_engine):
    """Initialize audio processor with RAG engine"""
    global audio_processor, topic_streamer
    audio_processor = SimpleAudioProcessor(rag_engine)
    topic_streamer = SimpleAudioTopicStreamer(audio_processor)
    logger.info("Simple audio processor initialized")

@audio_bp.route('/audio/start', methods=['POST'])
def start_audio_processing():
    """Start real-time audio processing"""
    try:
        if not audio_processor:
            return jsonify({'error': 'Audio processor not initialized'}), 500
        
        data = request.get_json() or {}
        source_type = data.get('source_type', 'microphone')
        source_path = data.get('source_path')
        
        result = audio_processor.start_live_processing(source_type, source_path)
        
        if 'error' in result:
            return jsonify(result), 400
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Audio start error: {str(e)}")
        return jsonify({'error': 'Failed to start audio processing', 'details': str(e)}), 500

@audio_bp.route('/audio/stop', methods=['POST'])
def stop_audio_processing():
    """Stop audio processing"""
    try:
        if not audio_processor:
            return jsonify({'error': 'Audio processor not initialized'}), 500
        
        result = audio_processor.stop_processing()
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Audio stop error: {str(e)}")
        return jsonify({'error': 'Failed to stop audio processing', 'details': str(e)}), 500

@audio_bp.route('/audio/status', methods=['GET'])
def get_audio_status():
    """Get current audio processing status"""
    try:
        if not audio_processor:
            return jsonify({'error': 'Audio processor not initialized'}), 500
        
        status = audio_processor.get_status()
        return jsonify(status)
        
    except Exception as e:
        logger.error(f"Audio status error: {str(e)}")
        return jsonify({'error': 'Failed to get audio status', 'details': str(e)}), 500

@audio_bp.route('/audio/results', methods=['GET'])
def get_audio_results():
    """Get recent transcription and classification results"""
    try:
        if not audio_processor:
            return jsonify({'error': 'Audio processor not initialized'}), 500
        
        limit = request.args.get('limit', 10, type=int)
        results = audio_processor.get_recent_results(limit)
        
        return jsonify({
            'results': results,
            'count': len(results)
        })
        
    except Exception as e:
        logger.error(f"Audio results error: {str(e)}")
        return jsonify({'error': 'Failed to get audio results', 'details': str(e)}), 500

@audio_bp.route('/audio/topics/current', methods=['GET'])
def get_current_topics():
    """Get currently active topics from audio stream"""
    try:
        if not topic_streamer:
            return jsonify({'error': 'Topic streamer not initialized'}), 500
        
        topics = topic_streamer.get_current_topics()
        return jsonify({
            'current_topics': topics,
            'count': len(topics)
        })
        
    except Exception as e:
        logger.error(f"Current topics error: {str(e)}")
        return jsonify({'error': 'Failed to get current topics', 'details': str(e)}), 500

@audio_bp.route('/audio/topics/history', methods=['GET'])
def get_topic_history():
    """Get topic detection history"""
    try:
        if not topic_streamer:
            return jsonify({'error': 'Topic streamer not initialized'}), 500
        
        limit = request.args.get('limit', 50, type=int)
        history = topic_streamer.get_topic_history(limit)
        
        return jsonify({
            'topic_history': history,
            'count': len(history)
        })
        
    except Exception as e:
        logger.error(f"Topic history error: {str(e)}")
        return jsonify({'error': 'Failed to get topic history', 'details': str(e)}), 500

@audio_bp.route('/audio/upload', methods=['POST'])
def upload_audio_file():
    """Upload and process audio file"""
    try:
        if not audio_processor:
            return jsonify({'error': 'Audio processor not initialized'}), 500
        
        if 'audio_file' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save uploaded file temporarily
        import tempfile
        import os
        
        temp_dir = tempfile.mkdtemp()
        file_path = os.path.join(temp_dir, audio_file.filename)
        audio_file.save(file_path)
        
        # Start processing the uploaded file
        result = audio_processor.start_live_processing('file', file_path)
        
        if 'error' in result:
            # Clean up temp file
            os.remove(file_path)
            os.rmdir(temp_dir)
            return jsonify(result), 400
        
        return jsonify({
            'status': 'processing_started',
            'file_path': file_path,
            'filename': audio_file.filename
        })
        
    except Exception as e:
        logger.error(f"Audio upload error: {str(e)}")
        return jsonify({'error': 'Failed to process uploaded file', 'details': str(e)}), 500
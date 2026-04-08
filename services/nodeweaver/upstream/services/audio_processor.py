"""Real-time audio processing and transcription service"""
import os
import time
import json
import logging
import threading
import queue
from typing import Dict, List, Any, Optional, Callable
from datetime import datetime

import speech_recognition as sr
import pyaudio
import webrtcvad
import numpy as np
from pydub import AudioSegment
from pydub.utils import make_chunks
import librosa

logger = logging.getLogger(__name__)

class AudioProcessor:
    """Real-time audio processing with transcription and topic detection"""
    
    def __init__(self, rag_engine, sample_rate=16000, chunk_duration=30):
        self.rag_engine = rag_engine
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration  # seconds
        self.chunk_size = int(sample_rate * chunk_duration / 1000)
        
        # Audio processing components
        self.recognizer = sr.Recognizer()
        self.microphone = None
        self.vad = webrtcvad.Vad(2)  # Aggressiveness level 0-3
        
        # Threading and state management
        self.is_processing = False
        self.audio_queue = queue.Queue()
        self.result_queue = queue.Queue()
        self.processing_thread = None
        
        # Callbacks for real-time updates
        self.on_transcription = None
        self.on_topic_detected = None
        self.on_segment_complete = None
        
        logger.info("Audio Processor initialized")
    
    def start_live_processing(self, source_type="microphone", source_path=None):
        """Start real-time audio processing"""
        if self.is_processing:
            return {"error": "Audio processing already running"}
        
        try:
            self.is_processing = True
            
            if source_type == "microphone":
                self.processing_thread = threading.Thread(
                    target=self._process_microphone_audio
                )
            elif source_type == "file":
                if not source_path or not os.path.exists(source_path):
                    return {"error": "Invalid file path"}
                self.processing_thread = threading.Thread(
                    target=self._process_file_audio,
                    args=(source_path,)
                )
            elif source_type == "url":
                self.processing_thread = threading.Thread(
                    target=self._process_url_audio,
                    args=(source_path,)
                )
            else:
                return {"error": "Invalid source type"}
            
            self.processing_thread.start()
            logger.info(f"Started audio processing for {source_type}")
            
            return {"status": "started", "source_type": source_type}
            
        except Exception as e:
            logger.error(f"Failed to start audio processing: {str(e)}")
            self.is_processing = False
            return {"error": str(e)}
    
    def stop_processing(self):
        """Stop audio processing"""
        self.is_processing = False
        if self.processing_thread and self.processing_thread.is_alive():
            self.processing_thread.join(timeout=5.0)
        
        logger.info("Audio processing stopped")
        return {"status": "stopped"}
    
    def _process_microphone_audio(self):
        """Process live microphone audio"""
        try:
            with sr.Microphone(sample_rate=self.sample_rate) as source:
                self.recognizer.adjust_for_ambient_noise(source)
                logger.info("Listening to microphone...")
                
                while self.is_processing:
                    try:
                        # Listen for audio with timeout
                        audio = self.recognizer.listen(source, timeout=1, phrase_time_limit=5)
                        self._process_audio_chunk(audio)
                        
                    except sr.WaitTimeoutError:
                        continue  # No audio detected, continue listening
                    except Exception as e:
                        logger.error(f"Microphone processing error: {str(e)}")
                        continue
                        
        except Exception as e:
            logger.error(f"Microphone initialization error: {str(e)}")
            self.is_processing = False
    
    def _process_file_audio(self, file_path):
        """Process audio from file (MP3, MP4, WAV, etc.)"""
        try:
            logger.info(f"Processing audio file: {file_path}")
            
            # Load audio file using pydub (supports MP3, MP4, WAV, etc.)
            audio_segment = AudioSegment.from_file(file_path)
            
            # Convert to mono and target sample rate
            audio_segment = audio_segment.set_channels(1).set_frame_rate(self.sample_rate)
            
            # Process in chunks for real-time experience
            chunk_length_ms = 5000  # 5 second chunks
            chunks = make_chunks(audio_segment, chunk_length_ms)
            
            for i, chunk in enumerate(chunks):
                if not self.is_processing:
                    break
                
                # Convert chunk to audio data
                audio_data = sr.AudioData(
                    chunk.raw_data,
                    self.sample_rate,
                    chunk.sample_width
                )
                
                self._process_audio_chunk(audio_data, segment_info={
                    "file_path": file_path,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "timestamp": i * chunk_length_ms / 1000.0
                })
                
                # Add small delay to simulate real-time processing
                time.sleep(chunk_length_ms / 1000.0 * 0.8)  # 80% of real-time
                
        except Exception as e:
            logger.error(f"File processing error: {str(e)}")
            self.is_processing = False
    
    def _process_url_audio(self, url):
        """Process audio from URL (YouTube, streaming, etc.)"""
        try:
            logger.info(f"Processing audio from URL: {url}")
            
            # For YouTube URLs, we'd need yt-dlp or similar
            # For now, implement basic URL audio processing
            
            # This is a placeholder - in production you'd use yt-dlp
            # to extract audio from YouTube URLs
            
            logger.warning("URL audio processing not fully implemented yet")
            self.is_processing = False
            
        except Exception as e:
            logger.error(f"URL processing error: {str(e)}")
            self.is_processing = False
    
    def _process_audio_chunk(self, audio_data, segment_info=None):
        """Process a single audio chunk"""
        try:
            # Transcribe audio
            text = self._transcribe_audio(audio_data)
            
            if text and text.strip():
                logger.info(f"Transcribed: {text[:100]}...")
                
                # Classify the transcribed text
                classification_result = self.rag_engine.classify_text(
                    text, 
                    metadata={
                        "source": "audio",
                        "timestamp": datetime.now().isoformat(),
                        "segment_info": segment_info
                    }
                )
                
                # Prepare result
                result = {
                    "timestamp": datetime.now().isoformat(),
                    "transcription": text,
                    "classification": classification_result,
                    "segment_info": segment_info
                }
                
                # Call callbacks if set
                if self.on_transcription:
                    self.on_transcription(text, segment_info)
                
                if self.on_topic_detected:
                    self.on_topic_detected(classification_result, text, segment_info)
                
                if self.on_segment_complete:
                    self.on_segment_complete(result)
                
                # Add to result queue for API access
                self.result_queue.put(result)
                
        except Exception as e:
            logger.error(f"Audio chunk processing error: {str(e)}")
    
    def _transcribe_audio(self, audio_data):
        """Transcribe audio data to text"""
        try:
            # Try Google Speech Recognition (free tier)
            text = self.recognizer.recognize_google(audio_data)
            return text
            
        except sr.UnknownValueError:
            # Could not understand audio
            return ""
        except sr.RequestError as e:
            logger.error(f"Speech recognition error: {str(e)}")
            return ""
    
    def get_recent_results(self, limit=10):
        """Get recent transcription and classification results"""
        results = []
        
        # Get results from queue (non-blocking)
        for _ in range(limit):
            try:
                result = self.result_queue.get_nowait()
                results.append(result)
            except queue.Empty:
                break
        
        return results
    
    def set_callbacks(self, on_transcription=None, on_topic_detected=None, on_segment_complete=None):
        """Set callback functions for real-time updates"""
        self.on_transcription = on_transcription
        self.on_topic_detected = on_topic_detected
        self.on_segment_complete = on_segment_complete
    
    def get_status(self):
        """Get current processing status"""
        return {
            "is_processing": self.is_processing,
            "queue_size": self.result_queue.qsize(),
            "sample_rate": self.sample_rate,
            "chunk_duration": self.chunk_duration
        }

class AudioTopicStreamer:
    """Manages live topic streaming for web interface"""
    
    def __init__(self, audio_processor):
        self.audio_processor = audio_processor
        self.clients = set()
        self.current_topics = []
        self.topic_history = []
        
        # Set up callbacks
        self.audio_processor.set_callbacks(
            on_topic_detected=self._on_topic_detected,
            on_segment_complete=self._on_segment_complete
        )
    
    def _on_topic_detected(self, classification_result, text, segment_info):
        """Handle new topic detection"""
        topic_data = {
            "timestamp": datetime.now().isoformat(),
            "category": classification_result.get("predicted_category"),
            "confidence": classification_result.get("confidence_score"),
            "text_snippet": text[:200] + "..." if len(text) > 200 else text,
            "segment_info": segment_info
        }
        
        self.current_topics.append(topic_data)
        self.topic_history.append(topic_data)
        
        # Keep only recent topics
        if len(self.current_topics) > 5:
            self.current_topics.pop(0)
        
        # Broadcast to connected clients
        self._broadcast_topic_update(topic_data)
    
    def _on_segment_complete(self, result):
        """Handle segment completion"""
        # Could be used for additional processing
        pass
    
    def _broadcast_topic_update(self, topic_data):
        """Broadcast topic updates to connected clients"""
        # This would typically use WebSockets
        # For now, store for polling-based updates
        pass
    
    def get_current_topics(self):
        """Get currently active topics"""
        return self.current_topics
    
    def get_topic_history(self, limit=50):
        """Get topic history"""
        return self.topic_history[-limit:] if limit else self.topic_history
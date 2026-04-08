"""
NodeWeaver - RAG Classifier API

An intelligent, platform-independent RAG (Retrieval-Augmented Generation) classifier API 
designed for automatic task categorization with audio processing capabilities.

Version: 1.0.0
"""

__version__ = "1.0.0"
__title__ = "NodeWeaver"
__description__ = "An intelligent RAG classifier API for automatic task categorization with audio processing capabilities"
__author__ = "AxTask Team"
__license__ = "MIT"

from .app import create_app

__all__ = ["create_app", "__version__"]
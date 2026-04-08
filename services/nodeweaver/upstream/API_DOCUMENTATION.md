# NodeWeaver API Documentation

**Version:** 1.0.1  
**Base URL:** `http://localhost:5000/api/v1`  
**Content-Type:** `application/json`

## Overview

NodeWeaver provides a comprehensive RESTful API for text classification, audio processing, and topic detection using advanced RAG (Retrieval-Augmented Generation) techniques.

## Authentication

Currently, the API does not require authentication for development. Production deployments should implement appropriate authentication mechanisms.

## Rate Limiting

- Maximum 100 requests per minute per IP
- Batch processing limited to 100 texts per request
- Audio files limited to 10MB per upload

## API Endpoints

### Text Classification

#### Classify Text
Classify a single text input into predefined categories.

```http
POST /api/v1/classify
```

**Request Body:**
```json
{
  "text": "I need to finish my research paper by tomorrow",
  "categories": ["personal", "work", "academic", "other"]  // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "text": "I need to finish my research paper by tomorrow",
    "category": "academic",
    "confidence": 0.89,
    "similar_topics": [
      {
        "topic": "education",
        "similarity": 0.76
      },
      {
        "topic": "deadline management",
        "similarity": 0.68
      }
    ]
  },
  "timestamp": "2025-08-04T19:30:52Z"
}
```

#### Batch Classification
Process multiple texts simultaneously.

```http
POST /api/v1/classify/batch
```

**Request Body:**
```json
{
  "texts": [
    "Meeting with client at 2pm",
    "Buy groceries on the way home",
    "Submit assignment before deadline"
  ],
  "categories": ["personal", "work", "academic"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "text": "Meeting with client at 2pm",
        "category": "work",
        "confidence": 0.92
      },
      {
        "text": "Buy groceries on the way home",
        "category": "personal",
        "confidence": 0.87
      },
      {
        "text": "Submit assignment before deadline",
        "category": "academic",
        "confidence": 0.91
      }
    ],
    "processed_count": 3,
    "failed_count": 0
  },
  "timestamp": "2025-08-04T19:30:52Z"
}
```

### Audio Processing

#### Upload Audio File
Process an audio file for topic classification.

```http
POST /api/v1/audio/upload
```

**Request:**
- Content-Type: `multipart/form-data`
- File parameter: `audio`
- Supported formats: WAV, MP3, M4A, FLAC
- Maximum size: 10MB

**Response:**
```json
{
  "success": true,
  "data": {
    "transcription": "Let's discuss the quarterly sales report and market analysis",
    "classification": {
      "category": "work",
      "confidence": 0.94,
      "topics": ["business", "sales", "analysis"]
    },
    "duration": 12.5,
    "processing_time": 2.3
  },
  "timestamp": "2025-08-04T19:30:52Z"
}
```

#### Live Audio Processing
Get the live audio processing interface.

```http
GET /api/v1/audio/live
```

**Response:**
Returns HTML interface for real-time audio processing with WebSocket support.

### Topic Management

#### Get All Topics
Retrieve discovered topics with metadata.

```http
GET /api/v1/topics
```

**Query Parameters:**
- `limit` (optional): Number of topics to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `sort` (optional): Sort by 'frequency', 'recent', 'alphabetical' (default: 'frequency')

**Response:**
```json
{
  "success": true,
  "data": {
    "topics": [
      {
        "id": 1,
        "name": "project management",
        "frequency": 45,
        "confidence": 0.87,
        "created_at": "2025-08-04T10:15:30Z",
        "last_used": "2025-08-04T19:25:10Z",
        "related_nodes": ["deadlines", "tasks", "planning"]
      }
    ],
    "total": 23,
    "limit": 50,
    "offset": 0
  },
  "timestamp": "2025-08-04T19:30:52Z"
}
```

#### Detect New Topics
Analyze text for topic emergence using clustering.

```http
POST /api/v1/topics/detect
```

**Request Body:**
```json
{
  "texts": [
    "Working on machine learning project",
    "Training neural networks for classification",
    "Implementing deep learning algorithms"
  ],
  "min_cluster_size": 3,
  "convergence_threshold": 0.7
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "detected_topics": [
      {
        "topic": "machine learning",
        "texts_count": 3,
        "confidence": 0.91,
        "keywords": ["machine learning", "neural networks", "deep learning", "algorithms"],
        "cluster_coherence": 0.84
      }
    ],
    "processing_stats": {
      "total_texts": 3,
      "clusters_found": 1,
      "processing_time": 0.45
    }
  },
  "timestamp": "2025-08-04T19:30:52Z"
}
```

#### Get Topic Details
Retrieve detailed information about a specific topic.

```http
GET /api/v1/topics/{topic_id}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "project management",
    "description": "Tasks and activities related to project planning and execution",
    "frequency": 45,
    "confidence": 0.87,
    "related_nodes": [
      {
        "node": "deadlines",
        "weight": 0.82,
        "frequency": 12
      }
    ],
    "classification_history": [
      {
        "text": "Update project timeline",
        "classified_at": "2025-08-04T19:20:10Z",
        "confidence": 0.89
      }
    ],
    "created_at": "2025-08-04T10:15:30Z",
    "updated_at": "2025-08-04T19:25:10Z"
  },
  "timestamp": "2025-08-04T19:30:52Z"
}
```

## Error Responses

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Text input is required and cannot be empty",
    "details": {
      "field": "text",
      "received": "",
      "expected": "non-empty string"
    }
  },
  "timestamp": "2025-08-04T19:30:52Z"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input parameters |
| `FILE_TOO_LARGE` | 413 | Audio file exceeds size limit |
| `UNSUPPORTED_FORMAT` | 415 | Audio format not supported |
| `PROCESSING_ERROR` | 500 | Internal processing failure |
| `SERVICE_UNAVAILABLE` | 503 | External service dependency unavailable |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

## Data Models

### Classification Result
```json
{
  "text": "string",
  "category": "string",
  "confidence": "number (0-1)",
  "similar_topics": [
    {
      "topic": "string",
      "similarity": "number (0-1)"
    }
  ]
}
```

### Topic
```json
{
  "id": "integer",
  "name": "string",
  "frequency": "integer",
  "confidence": "number (0-1)",
  "created_at": "ISO 8601 timestamp",
  "last_used": "ISO 8601 timestamp",
  "related_nodes": ["string array"]
}
```

### Audio Processing Result
```json
{
  "transcription": "string",
  "classification": {
    "category": "string",
    "confidence": "number (0-1)",
    "topics": ["string array"]
  },
  "duration": "number (seconds)",
  "processing_time": "number (seconds)"
}
```

## WebSocket Events (Live Audio)

For real-time audio processing, connect to WebSocket endpoint:
`ws://localhost:5000/api/v1/audio/live/ws`

### Client Events
- `audio_chunk`: Send base64-encoded audio data
- `start_recording`: Initialize audio processing
- `stop_recording`: Finalize audio processing

### Server Events
- `transcription_update`: Real-time transcription text
- `topic_detected`: New topic classification
- `processing_complete`: Final results ready
- `error`: Processing error occurred

## SDKs and Integration

### Python SDK Example
```python
import requests

class TopicSenseClient:
    def __init__(self, base_url="http://localhost:5000/api/v1"):
        self.base_url = base_url
    
    def classify_text(self, text, categories=None):
        payload = {"text": text}
        if categories:
            payload["categories"] = categories
        
        response = requests.post(
            f"{self.base_url}/classify",
            json=payload
        )
        return response.json()

# Usage
client = TopicSenseClient()
result = client.classify_text("Finish the quarterly report")
print(result["data"]["category"])  # "work"
```

### JavaScript SDK Example
```javascript
class TopicSenseClient {
    constructor(baseUrl = 'http://localhost:5000/api/v1') {
        this.baseUrl = baseUrl;
    }
    
    async classifyText(text, categories = null) {
        const payload = { text };
        if (categories) payload.categories = categories;
        
        const response = await fetch(`${this.baseUrl}/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        return response.json();
    }
}

// Usage
const client = new TopicSenseClient();
const result = await client.classifyText('Plan vacation for next month');
console.log(result.data.category); // "personal"
```

## Performance Optimization

- Use batch processing for multiple texts
- Implement client-side caching for repeated classifications
- Consider WebSocket connections for real-time requirements
- Monitor response times and adjust timeout settings

## Support and Troubleshooting

For API issues:
1. Check response status codes and error messages
2. Verify request format matches documentation
3. Ensure audio files meet format and size requirements
4. Review server logs for detailed error information

For integration support, refer to the main project documentation or contact the development team.
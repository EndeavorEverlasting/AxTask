# Getting Started with NodeWeaver

Welcome to NodeWeaver! This guide will help you get up and running quickly.

## Quick Start

### 1. Prerequisites

- Python 3.11 or higher
- PostgreSQL 13+ with pgvector extension
- Git (for cloning the repository)

### 2. Installation

```bash
# Clone the repository
git clone <your-repository-url>
cd nodeweaver

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r pyproject.toml  # Or use: pip install -e .
```

### 3. Database Setup

**Option A: Using Docker (Recommended)**
```bash
# Start PostgreSQL with pgvector
docker run -d \
  --name nodeweaver-db \
  -e POSTGRES_DB=nodeweaver \
  -e POSTGRES_USER=rag_user \
  -e POSTGRES_PASSWORD=rag_pass \
  -p 5432:5432 \
  pgvector/pgvector:pg15
```

**Option B: Local PostgreSQL**
```sql
-- Create database and user
CREATE DATABASE nodeweaver;
CREATE USER rag_user WITH PASSWORD 'rag_pass';
GRANT ALL PRIVILEGES ON DATABASE nodeweaver TO rag_user;
\c nodeweaver;
CREATE EXTENSION vector;
```

### 4. Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings
# DATABASE_URL=postgresql://rag_user:rag_pass@localhost:5432/topicsense
# SESSION_SECRET=your-secret-key-here
```

### 5. Initialize Database

```bash
python -c "from app import create_app; from models import db; app = create_app(); app.app_context().push(); db.create_all()"
```

### 6. Run the Application

```bash
# Development server
python main.py

# Production server
gunicorn --bind 0.0.0.0:5000 main:app
```

The application will be available at `http://localhost:5000`

## First Steps

### 1. Test the API

Visit `http://localhost:5000/test` for the interactive test interface.

**Classify Text:**
```bash
curl -X POST http://localhost:5000/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "I need to finish my research paper by tomorrow"}'
```

**Check Health:**
```bash
curl http://localhost:5000/health
```

### 2. Upload Audio File

Visit `http://localhost:5000/live` for the audio processing interface, or use the API:

```bash
curl -X POST http://localhost:5000/api/v1/audio/upload \
  -F "audio=@your-audio-file.wav"
```

### 3. Explore Topics

```bash
# Get discovered topics
curl http://localhost:5000/api/v1/topics

# Detect new topics from text
curl -X POST http://localhost:5000/api/v1/topics/detect \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Meeting with client", "Project deadline", "Team standup"]}'
```

## Docker Quick Start

For a complete setup with all dependencies:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

## Web Interface

TopicSense includes several web interfaces:

- **Home**: `http://localhost:5000/` - Project overview
- **API Docs**: `http://localhost:5000/docs` - Interactive API documentation
- **Test Interface**: `http://localhost:5000/test` - Text classification testing
- **Live Audio**: `http://localhost:5000/live` - Real-time audio processing

## Common Use Cases

### 1. Task Categorization

```python
import requests

def categorize_task(task_description):
    response = requests.post('http://localhost:5000/api/v1/classify', 
                           json={'text': task_description})
    return response.json()['data']['category']

# Example
category = categorize_task("Schedule dentist appointment")
print(category)  # "personal"
```

### 2. Meeting Analysis

Upload meeting recordings to automatically classify discussion topics and extract key themes.

### 3. Email Classification

Process email content to automatically sort into categories like work, personal, finance, etc.

### 4. Content Moderation

Classify user-generated content into appropriate categories for moderation and organization.

## Integration Examples

### AxTask Integration

```python
from integration.axtask_client import AxTaskClient

client = AxTaskClient(base_url='http://localhost:5000')
tasks = client.get_tasks()
categorized = client.classify_tasks(tasks)
```

### Google Sheets Integration

Use the provided Apps Script in `integration/google_apps_script.js` to automatically categorize spreadsheet data.

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check PostgreSQL is running
   - Verify DATABASE_URL in .env
   - Ensure pgvector extension is installed

2. **Audio Processing Fails**
   - Install system audio libraries: `sudo apt install portaudio19-dev`
   - Check audio file format (supported: WAV, MP3, M4A, FLAC)
   - Verify file size under 10MB

3. **Import Errors**
   - Activate virtual environment: `source venv/bin/activate`
   - Install dependencies: `pip install -r pyproject.toml`

### Getting Help

- Check the [API Documentation](API_DOCUMENTATION.md)
- Review [Deployment Guide](DEPLOYMENT.md)
- See [Contributing Guidelines](CONTRIBUTING.md)

## Next Steps

- Explore the comprehensive [API Documentation](API_DOCUMENTATION.md)
- Set up production deployment using the [Deployment Guide](DEPLOYMENT.md)
- Customize categories and thresholds in `config.py`
- Integrate with your existing systems
- Contribute to the project following [CONTRIBUTING.md](CONTRIBUTING.md)

## Performance Tips

- Use batch processing for multiple texts
- Implement caching for repeated classifications
- Monitor database performance with indexes
- Consider Redis for improved response times

Welcome to TopicSense! Start building intelligent task categorization into your applications.
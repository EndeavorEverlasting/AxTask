# NodeWeaver Deployment Guide

This guide covers deployment options for NodeWeaver in various environments.

## Table of Contents

- [Quick Start (Development)](#quick-start-development)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Monitoring and Logging](#monitoring-and-logging)

## Quick Start (Development)

### Prerequisites
- Python 3.11+
- PostgreSQL 13+ with pgvector extension
- Git

### Setup Steps

1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd nodeweaver
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Environment configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Initialize database**
   ```bash
   python -c "from app import create_app; from models import db; app = create_app(); app.app_context().push(); db.create_all()"
   ```

4. **Start development server**
   ```bash
   python main.py
   ```

The application will be available at `http://localhost:5000`

## Production Deployment

### Using Gunicorn (Recommended)

1. **Install production dependencies**
   ```bash
   pip install gunicorn
   ```

2. **Create gunicorn configuration**
   ```python
   # gunicorn.conf.py
   bind = "0.0.0.0:5000"
   workers = 4
   worker_class = "sync"
   worker_connections = 1000
   max_requests = 1000
   max_requests_jitter = 100
   timeout = 30
   keepalive = 2
   preload_app = True
   reload = False
   
   # Logging
   accesslog = "-"
   errorlog = "-"
   loglevel = "info"
   access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'
   ```

3. **Start production server**
   ```bash
   gunicorn --config gunicorn.conf.py main:app
   ```

### Using uWSGI

1. **Install uWSGI**
   ```bash
   pip install uwsgi
   ```

2. **Create uWSGI configuration**
   ```ini
   # uwsgi.ini
   [uwsgi]
   module = main:app
   master = true
   processes = 4
   threads = 2
   socket = 127.0.0.1:5000
   chmod-socket = 660
   vacuum = true
   die-on-term = true
   logto = /var/log/uwsgi/topicsense.log
   ```

3. **Start uWSGI**
   ```bash
   uwsgi --ini uwsgi.ini
   ```

## Docker Deployment

### Using Docker Compose (Recommended)

The project includes a complete docker-compose setup:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Custom Docker Build

1. **Build the image**
   ```bash
   docker build -t topicsense:1.0.0 .
   ```

2. **Run with PostgreSQL**
   ```bash
   # Start PostgreSQL
   docker run -d \
     --name topicsense-db \
     -e POSTGRES_DB=topicsense \
     -e POSTGRES_USER=rag_user \
     -e POSTGRES_PASSWORD=rag_pass \
     -p 5432:5432 \
     pgvector/pgvector:pg15
   
   # Start TopicSense
   docker run -d \
     --name topicsense-app \
     --link topicsense-db:postgres \
     -e DATABASE_URL=postgresql://rag_user:rag_pass@postgres:5432/topicsense \
     -p 5000:5000 \
     topicsense:1.0.0
   ```

## Cloud Deployment

### Replit Deployment

1. **Configure environment variables** in Replit Secrets:
   ```
   DATABASE_URL=<your-postgres-url>
   SESSION_SECRET=<random-secret-key>
   ```

2. **Deploy using Replit**
   - Click the Deploy button in your Repl
   - Choose "Web Service" 
   - Configure domain and resources
   - Deploy

### AWS Deployment

#### Using AWS App Runner

1. **Create `apprunner.yaml`**
   ```yaml
   version: 1.0
   runtime: python3
   build:
     commands:
       build:
         - pip install -r requirements.txt
   run:
     runtime-version: 3.11
     command: gunicorn --bind 0.0.0.0:8080 main:app
     network:
       port: 8080
       env: PORT
   ```

2. **Deploy via AWS Console**
   - Connect your GitHub repository
   - Configure environment variables
   - Set up RDS PostgreSQL instance
   - Deploy

#### Using EC2

1. **Launch EC2 instance** (Ubuntu 20.04 LTS)

2. **Install dependencies**
   ```bash
   sudo apt update
   sudo apt install python3.11 python3.11-venv postgresql-client nginx
   ```

3. **Setup application**
   ```bash
   git clone <repository-url>
   cd nodeweaver
   python3.11 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. **Configure Nginx**
   ```nginx
   # /etc/nginx/sites-available/nodeweaver
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://127.0.0.1:5000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

5. **Create systemd service**
   ```ini
   # /etc/systemd/system/nodeweaver.service
   [Unit]
   Description=NodeWeaver Web Application
   After=network.target
   
   [Service]
   User=ubuntu
   Group=ubuntu
   WorkingDirectory=/home/ubuntu/nodeweaver
   Environment=PATH=/home/ubuntu/nodeweaver/venv/bin
   EnvironmentFile=/home/ubuntu/nodeweaver/.env
   ExecStart=/home/ubuntu/nodeweaver/venv/bin/gunicorn --bind 127.0.0.1:5000 main:app
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

### Google Cloud Platform

#### Using Cloud Run

1. **Create Dockerfile** (if not using provided one)

2. **Build and push to Container Registry**
   ```bash
   gcloud builds submit --tag gcr.io/PROJECT-ID/topicsense
   ```

3. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy topicsense \
     --image gcr.io/PROJECT-ID/topicsense \
     --platform managed \
     --region us-central1 \
     --set-env-vars DATABASE_URL=$DATABASE_URL
   ```

#### Using App Engine

1. **Create `app.yaml`**
   ```yaml
   runtime: python311
   
   env_variables:
     DATABASE_URL: postgresql://user:pass@host:5432/dbname
     SESSION_SECRET: your-secret-key
   
   automatic_scaling:
     min_instances: 1
     max_instances: 10
   ```

2. **Deploy**
   ```bash
   gcloud app deploy
   ```

## Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Security
SESSION_SECRET=your-secret-key-here

# RAG Configuration
EMBEDDING_MODEL=all-MiniLM-L6-v2
VECTOR_DIMENSION=384

# Topic Detection
CONVERGENCE_THRESHOLD=0.7
MIN_CLUSTER_SIZE=3
COHERENCE_THRESHOLD=0.6

# API Configuration
MAX_INPUT_LENGTH=10000
LOG_LEVEL=INFO
```

### Optional Environment Variables

```bash
# Performance
REDIS_URL=redis://localhost:6379/0

# External Services
OPENAI_API_KEY=your-openai-key

# Monitoring
SENTRY_DSN=your-sentry-dsn

# CORS (for frontend integration)
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## Database Setup

### PostgreSQL with pgvector

1. **Install PostgreSQL**
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   
   # macOS
   brew install postgresql
   ```

2. **Install pgvector extension**
   ```bash
   # From source
   git clone https://github.com/pgvector/pgvector.git
   cd pgvector
   make && sudo make install
   
   # Or using package manager
   sudo apt install postgresql-14-pgvector  # Ubuntu
   ```

3. **Create database and user**
   ```sql
   CREATE DATABASE topicsense;
   CREATE USER rag_user WITH PASSWORD 'rag_pass';
   GRANT ALL PRIVILEGES ON DATABASE topicsense TO rag_user;
   \c topicsense
   CREATE EXTENSION vector;
   ```

### Database Migrations

For production deployments, run migrations:

```bash
# Initialize database tables
python -c "from app import create_app; from models import db; app = create_app(); app.app_context().push(); db.create_all()"

# Or using migration script
python scripts/migrate.py
```

## SSL/TLS Configuration

### Using Let's Encrypt with Nginx

1. **Install Certbot**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Obtain certificate**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. **Auto-renewal**
   ```bash
   sudo crontab -e
   # Add: 0 12 * * * /usr/bin/certbot renew --quiet
   ```

## Monitoring and Logging

### Application Logging

Configure structured logging in production:

```python
# config.py
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(name)s %(levelname)s %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/var/log/topicsense/app.log')
    ]
)
```

### Health Check Endpoint

Add health check for load balancers:

```python
@app.route('/health')
def health_check():
    return {'status': 'healthy', 'version': '1.0.0'}, 200
```

### Monitoring with Prometheus

1. **Install prometheus-flask-exporter**
   ```bash
   pip install prometheus-flask-exporter
   ```

2. **Add to application**
   ```python
   from prometheus_flask_exporter import PrometheusMetrics
   
   metrics = PrometheusMetrics(app)
   ```

3. **Metrics endpoint** available at `/metrics`

## Performance Tuning

### Database Optimization

1. **Create indexes**
   ```sql
   CREATE INDEX idx_nodes_embedding ON nodes USING ivfflat (embedding vector_cosine_ops);
   CREATE INDEX idx_topics_name ON topics(name);
   CREATE INDEX idx_classifications_created_at ON classifications(created_at);
   ```

2. **Connection pooling**
   ```python
   # config.py
   SQLALCHEMY_ENGINE_OPTIONS = {
       "pool_size": 20,
       "max_overflow": 30,
       "pool_pre_ping": True,
       "pool_recycle": 300,
   }
   ```

### Caching

Implement Redis caching for frequent queries:

```python
import redis
from functools import wraps

redis_client = redis.Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'))

def cache_result(timeout=300):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            cached = redis_client.get(key)
            if cached:
                return json.loads(cached)
            result = func(*args, **kwargs)
            redis_client.setex(key, timeout, json.dumps(result))
            return result
        return wrapper
    return decorator
```

## Security Considerations

### Production Security Checklist

- [ ] Use environment variables for secrets
- [ ] Enable HTTPS/TLS
- [ ] Configure proper CORS headers
- [ ] Implement rate limiting
- [ ] Use strong session secrets
- [ ] Enable database connection encryption
- [ ] Set up proper firewall rules
- [ ] Regular security updates
- [ ] Monitor for suspicious activity
- [ ] Backup database regularly

### Example Security Headers

```python
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=['https://yourdomain.com'])

@app.after_request
def after_request(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response
```

## Troubleshooting

### Common Issues

1. **Database connection errors**
   - Check DATABASE_URL format
   - Verify PostgreSQL is running
   - Confirm pgvector extension is installed

2. **Memory issues**
   - Monitor embedding model memory usage
   - Adjust worker processes
   - Implement result caching

3. **Audio processing failures**
   - Check audio file formats
   - Verify PyAudio installation
   - Monitor disk space for temporary files

### Log Analysis

Monitor these log patterns:

```bash
# Application errors
grep "ERROR" /var/log/topicsense/app.log

# Database queries
grep "SQL" /var/log/topicsense/app.log

# API response times
grep "POST /api/v1/classify" /var/log/nginx/access.log | awk '{print $NF}'
```

## Backup and Recovery

### Database Backup

```bash
# Create backup
pg_dump -h hostname -U username -d topicsense > backup_$(date +%Y%m%d).sql

# Restore backup
psql -h hostname -U username -d topicsense < backup_20250804.sql
```

### Automated Backups

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -d topicsense | gzip > /backups/topicsense_$DATE.sql.gz
aws s3 cp /backups/topicsense_$DATE.sql.gz s3://your-backup-bucket/
find /backups -name "*.sql.gz" -mtime +7 -delete
```

For additional deployment support, refer to the project documentation or contact the development team.
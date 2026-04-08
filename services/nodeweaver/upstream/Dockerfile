# TopicSense Docker Image
# Multi-stage build for optimized production image

FROM python:3.11-slim-bullseye as base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libasound2-dev \
    portaudio19-dev \
    libsndfile1-dev \
    ffmpeg \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Install Python dependencies
COPY pyproject.toml uv.lock* ./
RUN pip install uv && \
    uv pip install --system -r pyproject.toml

# Development stage
FROM base as development

# Copy source code
COPY . .

# Create directories for uploads
RUN mkdir -p uploaded_audio temp_audio logs

# Expose port
EXPOSE 5000

# Command for development
CMD ["python", "main.py"]

# Production stage
FROM base as production

# Create non-root user
RUN groupadd -r topicsense && useradd -r -g topicsense topicsense

# Copy source code
COPY --chown=topicsense:topicsense . .

# Create directories for uploads with proper permissions
RUN mkdir -p uploaded_audio temp_audio logs && \
    chown -R topicsense:topicsense uploaded_audio temp_audio logs

# Switch to non-root user
USER topicsense

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health')" || exit 1

# Command for production
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--timeout", "30", "--keep-alive", "2", "main:app"]
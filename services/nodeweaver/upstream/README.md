# NodeWeaver - RAG Classifier API

![Version](https://img.shields.io/badge/Version-1.0.1-brightgreen) ![Python](https://img.shields.io/badge/Python-3.11%2B-blue) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-blue) ![Docker](https://img.shields.io/badge/Docker-Ready-blue)

**NodeWeaver** is an intelligent, production-ready RAG (Retrieval-Augmented Generation) classifier API designed for automatic task categorization with real-time audio processing capabilities. It integrates seamlessly with AxTask and Google Sheets to eliminate manual task classification through advanced topic emergence detection and weighted node convergence algorithms.

## 🚀 Quick Start

```bash
# Clone and setup
git clone <your-repository-url>
cd nodeweaver && python -m venv venv && source venv/bin/activate

# Start with Docker (recommended)
docker-compose up -d

# Or local setup
pip install -e . && python main.py
```

**➜** Visit `http://localhost:5000` to get started! 

**📖** New here? Check out our [Getting Started Guide](GETTING_STARTED.md)

### Auto-sync dependencies after pull

Think of this like turning on auto-help once.

1. Click one file one time:
   - Windows: double-click [`setup-hooks.cmd`](setup-hooks.cmd)
   - macOS/Linux: run [`setup-hooks.sh`](setup-hooks.sh)
2. That setup automatically does:
   - `git config core.hooksPath .githooks`
   - dependency sync

When dependency files change (`pyproject.toml`, `uv.lock`, or requirements files), the repo `post-merge` hook now runs:

```bash
python scripts/sync_dependencies.py --with-dev
```

Manual fallback (any time):

```bash
python scripts/sync_dependencies.py --with-dev
```

NodeWeaver is Python-first and does not require Node.js/npm for dependency management.

## 🚀 Features

### Core Capabilities
- **Automatic Text Classification**: Intelligent categorization into personal, work, academic, political, and other categories
- **Topic Emergence Detection**: Discovers new topics through weighted node convergence using DBSCAN clustering
- **Vector Similarity Search**: PostgreSQL with pgvector for high-performance semantic search
- **Batch Processing**: Process up to 100 texts simultaneously for efficiency
- **RESTful API**: Clean, well-documented API endpoints for easy integration

### Integration Support
- **AxTask Integration**: Seamless connection with AxTask for productivity automation
- **Google Sheets**: Apps Script integration for automatic spreadsheet categorization
- **Extensible Architecture**: Easy to integrate with other productivity tools and platforms

### Advanced Features
- **Confidence Scoring**: Each classification includes a confidence score (0-1)
- **Similar Topic/Node Discovery**: Find related concepts and patterns
- **Training Capabilities**: Improve accuracy with custom training data
- **Performance Monitoring**: Built-in metrics and logging for system health
- **Caching**: Redis integration for improved response times
- **Meeting & Debate Topic Tracking**: Continuously identify when participants change topics, dwell on specific ones, or diverge into tangents. Useful for meeting summarization, political discourse analysis, and podcast breakdowns.
- **Logical Fallacy Heuristics**: Infer topic shifts that defy internal consistency, helping flag potential red herrings, strawman arguments, or non sequiturs. This is built on the foundation of graph-weight discontinuities or abrupt semantic distance jumps between nodes.
- **Temporal Topic Heatmaps**: Visualize which topics dominate in a time window and how they evolve across sessions. Ideal for trend analysis or longitudinal research.

## 🏗️ Architecture

NodeWeaver uses a sophisticated multi-layer architecture:


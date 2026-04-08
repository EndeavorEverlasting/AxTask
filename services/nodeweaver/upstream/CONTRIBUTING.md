# Contributing to NodeWeaver

Thank you for your interest in contributing to NodeWeaver! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Process](#contributing-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Python 3.11 or higher
- PostgreSQL 13+ with pgvector extension
- Docker and Docker Compose (optional but recommended)
- Git for version control

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nodeweaver
   ```

2. **Set up virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize database**
   ```bash
   python -c "from app import create_app; from models import db; app = create_app(); app.app_context().push(); db.create_all()"
   ```

6. **Run the application**
   ```bash
   python main.py
   ```

## Contributing Process

### 1. Issue Creation

- Check existing issues before creating new ones
- Use clear, descriptive titles
- Provide detailed descriptions with:
  - Steps to reproduce (for bugs)
  - Expected vs actual behavior
  - Environment details
  - Screenshots if applicable

### 2. Feature Requests

- Explain the use case and benefits
- Provide examples of how the feature would work
- Consider backward compatibility
- Discuss potential implementation approaches

### 3. Pull Request Process

1. **Fork the repository** and create a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following coding standards

3. **Write or update tests** for your changes

4. **Update documentation** if necessary

5. **Commit your changes** with clear, descriptive messages
   ```bash
   git commit -m "feat: add audio processing enhancement"
   ```

6. **Push to your fork** and create a pull request

7. **Address review feedback** and update as needed

### Commit Message Format

Use conventional commit format:
```
type(scope): description

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Coding Standards

### Python Code Style

- Follow PEP 8 style guidelines
- Use type hints where appropriate
- Maximum line length: 88 characters (Black formatter)
- Use descriptive variable and function names
- Add docstrings for classes and functions

### Code Organization

- Keep functions small and focused
- Use meaningful module and package names
- Separate concerns into appropriate layers:
  - Models: Data structures and database interactions
  - Services: Business logic and processing
  - API: Request handling and routing
  - Utils: Helper functions and utilities

### Database Migrations

- Always create migrations for schema changes
- Test migrations both up and down
- Include descriptive migration messages
- Never edit existing migrations

### API Design

- Follow RESTful conventions
- Use appropriate HTTP status codes
- Include comprehensive error handling
- Validate input data
- Document all endpoints

## Testing

### Running Tests

```bash
# Run all tests
python -m pytest

# Run with coverage
python -m pytest --cov=.

# Run specific test file
python -m pytest tests/test_classifier.py
```

### Test Guidelines

- Write unit tests for all new functions
- Include integration tests for API endpoints
- Mock external dependencies
- Use descriptive test names
- Test both success and failure scenarios

### Test Structure

```python
def test_function_name_expected_behavior():
    # Given
    setup_test_data()
    
    # When
    result = function_under_test()
    
    # Then
    assert result == expected_result
```

## Documentation

### Code Documentation

- Add docstrings to all public functions and classes
- Use Google-style docstrings
- Document parameters, return values, and exceptions
- Include usage examples for complex functions

### API Documentation

- Document all endpoints in the API docs
- Include request/response examples
- Specify required and optional parameters
- Document error responses

### README Updates

- Keep installation instructions current
- Update feature lists when adding functionality
- Include new configuration options
- Add examples for new features

## Project Structure

```
topicsense/
├── api/                 # API blueprints and routing
├── models/              # Database models
├── services/            # Business logic services
├── utils/               # Utility functions
├── templates/           # HTML templates
├── static/              # CSS, JS, images
├── tests/               # Test files
├── integration/         # External integrations
└── docs/                # Additional documentation
```

## Performance Guidelines

- Use database indexes appropriately
- Implement caching where beneficial
- Monitor memory usage for large operations
- Profile code for performance bottlenecks
- Use async processing for long-running tasks

## Security Considerations

- Validate all input data
- Use parameterized queries
- Implement proper authentication
- Handle secrets securely
- Follow OWASP guidelines

## Questions and Support

- Check existing documentation first
- Search closed issues for similar problems
- Join our community discussions
- Contact maintainers for complex questions

Thank you for contributing to TopicSense! Your efforts help make this project better for everyone.
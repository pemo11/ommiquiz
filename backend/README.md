# Ommiquiz Backend

FastAPI-based backend server for the Ommiquiz application.

## Setup

1. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000

## API Documentation

Once the server is running, you can access:
- Interactive API docs: http://localhost:8000/docs
- Alternative API docs: http://localhost:8000/redoc

## API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check
- `GET /api/quiz/list` - List all available quizzes
- `GET /api/quiz/{quiz_name}` - Get a specific quiz
- `POST /api/quiz/validate` - Validate an answer

## Quiz Format

Quizzes are stored as YAML files in the `quizzes/` directory. Example format:

```yaml
title: Quiz Title
description: Quiz description
questions:
  - id: q1
    text: Question text?
    options:
      - Option 1
      - Option 2
      - Option 3
      - Option 4
    correct_answer: 0  # Index of the correct option (0-based)
```

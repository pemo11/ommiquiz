# ommiquiz

A simple quiz service with a FastAPI backend and a React client UI for serving and playing YAML-based quizzes.

## Project Structure

```
ommiquiz/
├── backend/          # FastAPI backend server
│   ├── app/          # Application code
│   ├── quizzes/      # YAML quiz files
│   └── requirements.txt
├── client/           # React frontend application
└── README.md
```

## Setup

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000
- API Documentation: http://localhost:8000/docs
- Alternative docs: http://localhost:8000/redoc

### Frontend Setup

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will open at http://localhost:3000

## Running the Full Application

You need to run both the backend and frontend simultaneously:

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd client
npm start
```

Then open http://localhost:3000 in your browser.

## Creating Quizzes

Quizzes are stored as YAML files in the `backend/quizzes/` directory. 

Example quiz format (`backend/quizzes/example.yaml`):

```yaml
title: My Quiz Title
description: A brief description of the quiz
questions:
  - id: q1
    text: What is the capital of France?
    options:
      - London
      - Paris
      - Berlin
      - Madrid
    correct_answer: 1  # Index of the correct option (0-based)
  
  - id: q2
    text: Which planet is known as the Red Planet?
    options:
      - Venus
      - Mars
      - Jupiter
      - Saturn
    correct_answer: 1
```

## API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check
- `GET /api/quiz/list` - List all available quizzes
- `GET /api/quiz/{quiz_name}` - Get a specific quiz by name
- `POST /api/quiz/validate` - Validate a quiz answer

## Features

- ✅ FastAPI backend with automatic API documentation
- ✅ React frontend with modern UI
- ✅ YAML-based quiz format
- ✅ Real-time answer validation
- ✅ Score tracking
- ✅ Multiple quiz support
- ✅ Responsive design

## Technologies Used

**Backend:**
- FastAPI - Modern Python web framework
- Uvicorn - ASGI server
- PyYAML - YAML file parsing
- Pydantic - Data validation

**Frontend:**
- React - UI library
- Modern CSS - Styling
- Fetch API - Backend communication

## License

MIT


# Ommiquiz

A simple quiz service with a FastAPI backend and a React client UI for serving and playing YAML-based flashcard quizzes.

## Features

- 🎓 **FastAPI Backend**: RESTful API for serving flashcard data from YAML files
- ⚛️ **React Frontend**: Interactive flashcard viewer with flip animations
- 🔄 **Card Flipping**: Click on cards to flip between questions and answers
- 📊 **Progress Tracking**: Display card number, total cards, and elapsed time
- 🐳 **Docker Support**: Complete containerization with Docker Compose
- 📝 **Flexible Content**: Support for single-answer and multiple-answer flashcards
- 🏷️ **Rich Metadata**: Author, creation date, topics, keywords, language, and difficulty level

## Project Structure

```
ommiquiz/
├── backend/
│   ├── app/
│   │   └── main.py          # FastAPI application
│   ├── flashcards/          # YAML flashcard files
│   │   ├── python-basics.yaml
│   │   └── javascript-basics.yaml
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── FlashcardSelector.js
│   │   │   ├── FlashcardViewer.js
│   │   │   └── *.css
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
└── docker-compose.yml
```

## YAML Flashcard Format

Flashcard files should follow this structure:

```yaml
id: flashcard-id
author: Author Name
createDate: 2025-11-09
language: en
level: beginner
topics:
  - topic1
  - topic2
keywords:
  - keyword1
  - keyword2

cards:
  - question: Your question here?
    answer: Single answer for the question
    type: single
  
  - question: Question with multiple answers?
    answers:
      - Answer 1
      - Answer 2
      - Answer 3
    type: multiple
```

## Getting Started

### Prerequisites

- Docker
- Docker Compose

### Running with Docker Compose

1. Clone the repository:
   ```bash
   git clone https://github.com/pemo11/ommiquiz.git
   cd ommiquiz
   ```

2. Start the application:
   ```bash
   docker-compose up --build
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Running Locally (Development)

#### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm start
```

The frontend will run on http://localhost:3000 and proxy API requests to the backend.

## API Endpoints

- `GET /` - Welcome message
- `GET /flashcards` - List all available flashcard sets
- `GET /flashcards/catalog` - Download the aggregated YAML catalog of all flashcard metadata
- `GET /flashcards/{flashcard_id}` - Get a specific flashcard set by ID
- `GET /health` - Health check endpoint

## Adding New Flashcards

1. Create a new YAML file in `backend/flashcards/`
2. Follow the YAML format structure (see above)
3. The flashcard will be automatically available in the application

## Usage

1. Open the application in your browser
2. Select a flashcard set from the list
3. Click on a card to flip it and see the answer
4. Use Previous/Next buttons to navigate through cards
5. Track your progress with the card counter and timer
6. Click "Back" to return to the flashcard selection

## Technologies Used

### Backend
- FastAPI - Modern Python web framework
- Pydantic - Data validation
- PyYAML - YAML file parsing
- Uvicorn - ASGI server

### Frontend
- React 18 - UI library
- CSS3 - Styling with animations
- Nginx - Production web server

### DevOps
- Docker - Containerization
- Docker Compose - Multi-container orchestration

## License

This project is open source and available under the MIT License.

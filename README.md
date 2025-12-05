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

### Production API URL (Wichtig für getrennte Deployments)

Die React-App verwendet in der Produktion **nicht** automatisch den Backend-Host, wenn Frontend und Backend auf verschiedenen Domains oder Droplets laufen. Setzen Sie deshalb vor dem Build immer die Umgebungsvariable `REACT_APP_API_URL` auf die öffentliche Backend-URL (inkl. `/api`-Präfix), z. B.:

```bash
# Beispiel: Backend läuft unter https://ommiquiz-backend.example.com
export REACT_APP_API_URL="https://ommiquiz-backend.example.com/api"
npm run build
```

Ohne diese Variable versucht das Frontend Anfragen an `${window.location.origin}/api` zu senden und erhält dann HTML (die eigene `index.html`) statt JSON – exakt der Fehler „Server returned non-JSON response. Content-Type: text/html“. Stellen Sie sicher, dass der Wert beim Image-Build gesetzt wird (z. B. über eine `.env.production`).

### Running Locally (Development)

#### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

To store flashcard YAML files in an S3-compatible bucket instead of the local filesystem, set the following environment variables:

- `FLASHCARDS_STORAGE=s3`
- `S3_BUCKET=<bucket-name>`
- `S3_PREFIX=flashcards/` (optional, defaults to `flashcards/`)
- `S3_ENDPOINT_URL` (optional for services like MinIO)
- `AWS_REGION` (optional, required for AWS S3)

Uploads, updates, deletions, and catalog generation will read and write directly against the configured bucket.

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
- `GET /flashcards/catalog/data` - Read the generated catalog file and return the same information as JSON
- `GET /flashcards/{flashcard_id}` - Get a specific flashcard set by ID
- `GET /health` - Health check endpoint
- `POST /api/auth/login` - Authenticate a user with Auth0 using email and password credentials

### Auth0 Configuration

To enable email/password login through Auth0, set the following environment variables for the backend:

- `AUTH0_DOMAIN` – Your Auth0 domain (e.g., `example.us.auth0.com`).
- `AUTH0_AUDIENCE` – API audience configured in Auth0.
- `AUTH0_CLIENT_ID` – Auth0 Application Client ID for Resource Owner Password flows.
- `AUTH0_CLIENT_SECRET` – Auth0 Application Client Secret.
- `AUTH0_ALGORITHMS` – (Optional) Comma-separated algorithms for token verification, defaults to `RS256`.
- `AUTH0_ISSUER` – (Optional) Custom issuer URL if different from the domain-based default.
- `AUTH0_REALM` – (Optional) Auth0 database connection/realm name required for some tenants.

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

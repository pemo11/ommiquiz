from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import quiz

app = FastAPI(
    title="Ommiquiz API",
    description="A simple quiz service with YAML-based quizzes",
    version="0.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(quiz.router, prefix="/api/quiz", tags=["quiz"])

@app.get("/")
async def root():
    return {"message": "Welcome to Ommiquiz API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

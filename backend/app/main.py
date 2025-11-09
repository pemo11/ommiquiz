from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import yaml
import os
import re
from pathlib import Path
from typing import Dict, Any, Optional

app = FastAPI(title="Ommiquiz API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Support both Docker and local development paths
if Path("/app/flashcards").exists():
    FLASHCARDS_DIR = Path("/app/flashcards")
else:
    FLASHCARDS_DIR = Path(__file__).parent.parent / "flashcards"

# Compile regex pattern once for performance
VALID_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')


def get_safe_flashcard_path(flashcard_id: str) -> Optional[Path]:
    """
    Safely construct and validate a flashcard file path.
    Returns None if the flashcard doesn't exist or validation fails.
    """
    # Validate ID format to prevent path traversal
    if not VALID_ID_PATTERN.match(flashcard_id):
        return None
    
    # Construct paths with validated ID
    yaml_path = FLASHCARDS_DIR / f"{flashcard_id}.yaml"
    yml_path = FLASHCARDS_DIR / f"{flashcard_id}.yml"
    
    # Check which file exists
    candidate_path = None
    if yaml_path.exists():
        candidate_path = yaml_path
    elif yml_path.exists():
        candidate_path = yml_path
    else:
        return None
    
    # Ensure resolved path is within FLASHCARDS_DIR
    try:
        resolved_path = candidate_path.resolve()
        resolved_base = FLASHCARDS_DIR.resolve()
        if not str(resolved_path).startswith(str(resolved_base)):
            return None
    except Exception:
        return None
    
    return resolved_path


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Welcome to Ommiquiz API"}


@app.get("/flashcards")
async def list_flashcards():
    """List all available flashcard files"""
    if not FLASHCARDS_DIR.exists():
        return {"flashcards": []}
    
    flashcard_files = []
    for file_path in FLASHCARDS_DIR.glob("*.yaml"):
        flashcard_files.append({
            "id": file_path.stem,
            "filename": file_path.name
        })
    
    for file_path in FLASHCARDS_DIR.glob("*.yml"):
        flashcard_files.append({
            "id": file_path.stem,
            "filename": file_path.name
        })
    
    return {"flashcards": flashcard_files}


@app.get("/flashcards/{flashcard_id}")
async def get_flashcard(flashcard_id: str) -> Dict[str, Any]:
    """Get a specific flashcard file by ID"""
    # Get safe path using validation function
    file_path = get_safe_flashcard_path(flashcard_id)
    
    if file_path is None:
        raise HTTPException(status_code=404, detail=f"Flashcard '{flashcard_id}' not found")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        return data
    except yaml.YAMLError as e:
        raise HTTPException(status_code=500, detail=f"Error parsing YAML file: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

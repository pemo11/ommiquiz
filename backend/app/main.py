from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import yaml
import os
from pathlib import Path
from typing import Dict, Any

app = FastAPI(title="Ommiquiz API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FLASHCARDS_DIR = Path("/app/flashcards")


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
    # Try both .yaml and .yml extensions
    yaml_file = FLASHCARDS_DIR / f"{flashcard_id}.yaml"
    yml_file = FLASHCARDS_DIR / f"{flashcard_id}.yml"
    
    file_path = None
    if yaml_file.exists():
        file_path = yaml_file
    elif yml_file.exists():
        file_path = yml_file
    else:
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

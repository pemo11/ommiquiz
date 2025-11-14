from fastapi import FastAPI, HTTPException, UploadFile, File, APIRouter, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import yaml
import os
import re
import tempfile
import shutil
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

# Create API router with /api prefix
api_router = APIRouter(prefix="/api")

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


@api_router.get("/")
async def api_root():
    """API root endpoint"""
    return {"message": "Welcome to Ommiquiz API"}


@api_router.get("/flashcards")
async def list_flashcards():
    """List all available flashcard files with metadata"""
    if not FLASHCARDS_DIR.exists():
        return {"flashcards": []}
    
    flashcard_files = []
    
    # Process .yaml files
    for file_path in FLASHCARDS_DIR.glob("*.yaml"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
            flashcard_files.append({
                "id": file_path.stem,
                "filename": file_path.name,
                "title": data.get("title", file_path.stem),
                "description": data.get("description", ""),
                "language": data.get("language", ""),
                "level": data.get("level", ""),
                "author": data.get("author", ""),
                "topics": data.get("topics", []),
                "module": data.get("module", "")
            })
        except Exception:
            # If YAML parsing fails, fall back to filename
            flashcard_files.append({
                "id": file_path.stem,
                "filename": file_path.name,
                "title": file_path.stem,
                "description": "",
                "language": "",
                "level": "",
                "author": "",
                "topics": [],
                "module": ""
            })
    
    # Process .yml files
    for file_path in FLASHCARDS_DIR.glob("*.yml"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
            flashcard_files.append({
                "id": file_path.stem,
                "filename": file_path.name,
                "title": data.get("title", file_path.stem),
                "description": data.get("description", ""),
                "language": data.get("language", ""),
                "level": data.get("level", ""),
                "author": data.get("author", ""),
                "topics": data.get("topics", []),
                "module": data.get("module", "")
            })
        except Exception:
            # If YAML parsing fails, fall back to filename
            flashcard_files.append({
                "id": file_path.stem,
                "filename": file_path.name,
                "title": file_path.stem,
                "description": "",
                "language": "",
                "level": "",
                "author": "",
                "topics": [],
                "module": ""
            })
    
    return {"flashcards": flashcard_files}


@api_router.get("/flashcards/{flashcard_id}")
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


@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


def validate_flashcard_yaml(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate flashcard YAML structure and content.
    Returns validation result with errors if any.
    """
    errors = []
    warnings = []
    
    # Required fields in root
    required_fields = ["id", "author", "title", "description", "createDate", 
                      "language", "level", "topics", "keywords", "flashcards"]
    
    for field in required_fields:
        if field not in data:
            errors.append(f"Missing required field: '{field}'")
    
    # Validate ID format
    if "id" in data:
        if not isinstance(data["id"], str) or not VALID_ID_PATTERN.match(data["id"]):
            errors.append("Field 'id' must be alphanumeric with hyphens/underscores only")
    
    # Validate language
    if "language" in data:
        valid_languages = ["en", "de", "fr", "es", "it", "pt", "nl", "ru", "ja", "zh"]
        if data["language"] not in valid_languages:
            warnings.append(f"Language '{data['language']}' not in common list: {valid_languages}")
    
    # Validate level
    if "level" in data:
        valid_levels = ["beginner", "intermediate", "advanced", "expert"]
        if data["level"] not in valid_levels:
            warnings.append(f"Level '{data['level']}' not in standard list: {valid_levels}")
    
    # Validate flashcards structure
    if "flashcards" in data:
        if not isinstance(data["flashcards"], list):
            errors.append("Field 'flashcards' must be a list")
        else:
            for i, card in enumerate(data["flashcards"]):
                if not isinstance(card, dict):
                    errors.append(f"Flashcard {i+1} must be an object")
                    continue
                
                # Required card fields
                if "question" not in card:
                    errors.append(f"Flashcard {i+1} missing 'question' field")
                if "type" not in card:
                    errors.append(f"Flashcard {i+1} missing 'type' field")
                
                # Validate card type and answers
                if "type" in card:
                    if card["type"] == "single":
                        if "answer" not in card:
                            errors.append(f"Flashcard {i+1} with type 'single' missing 'answer' field")
                    elif card["type"] == "multiple":
                        if "answers" not in card:
                            errors.append(f"Flashcard {i+1} with type 'multiple' missing 'answers' field")
                        elif not isinstance(card["answers"], list):
                            errors.append(f"Flashcard {i+1} 'answers' must be a list")
                    else:
                        errors.append(f"Flashcard {i+1} has invalid type '{card['type']}'. Must be 'single' or 'multiple'")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }


class FlashcardUpdateRequest(BaseModel):
    content: str
    filename: str

@api_router.put("/flashcards/{flashcard_id}")
async def update_flashcard(flashcard_id: str, request: FlashcardUpdateRequest):
    """Update an existing flashcard file"""
    
    # Validate ID format
    if not VALID_ID_PATTERN.match(flashcard_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid flashcard ID format. Use only letters, numbers, hyphens, and underscores"
        )
    
    # Get the existing file path
    file_path = get_safe_flashcard_path(flashcard_id)
    
    if file_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Flashcard '{flashcard_id}' not found"
        )
    
    # Parse YAML content
    try:
        data = yaml.safe_load(request.content)
    except yaml.YAMLError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid YAML format: {str(e)}"
        )
    
    # Validate flashcard structure
    validation = validate_flashcard_yaml(data)
    if not validation["valid"]:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "YAML validation failed",
                "errors": validation["errors"],
                "warnings": validation["warnings"]
            }
        )
    
    # Verify that the ID in the content matches the URL parameter
    if data.get("id") != flashcard_id:
        raise HTTPException(
            status_code=400,
            detail=f"ID mismatch: URL specifies '{flashcard_id}' but content has '{data.get('id')}'"
        )
    
    # Update the file
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        
        return {
            "success": True,
            "message": f"Flashcard '{flashcard_id}' updated successfully",
            "filename": file_path.name,
            "flashcard_id": flashcard_id,
            "warnings": validation["warnings"],
            "stats": {
                "total_cards": len(data.get("flashcards", [])),
                "language": data.get("language"),
                "level": data.get("level"),
                "topics": data.get("topics", [])
            }
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update file: {str(e)}"
        )

@api_router.post("/flashcards/upload")
async def upload_flashcard(file: UploadFile = File(...), overwrite: str = Form(default="false")):
    """Upload and validate a new flashcard YAML file"""
    
    # Validate file extension
    if not (file.filename.endswith('.yaml') or file.filename.endswith('.yml')):
        raise HTTPException(
            status_code=400, 
            detail="File must have .yaml or .yml extension"
        )
    
    # Validate file size (max 1MB)
    content = await file.read()
    if len(content) > 1024 * 1024:  # 1MB limit
        raise HTTPException(
            status_code=413,
            detail="File size too large. Maximum size is 1MB"
        )
    
    # Parse YAML content
    try:
        data = yaml.safe_load(content.decode('utf-8'))
    except yaml.YAMLError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid YAML format: {str(e)}"
        )
    except UnicodeDecodeError as e:
        raise HTTPException(
            status_code=400,
            detail=f"File encoding error: {str(e)}. Please use UTF-8 encoding"
        )
    
    # Validate flashcard structure
    validation = validate_flashcard_yaml(data)
    if not validation["valid"]:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "YAML validation failed",
                "errors": validation["errors"],
                "warnings": validation["warnings"]
            }
        )
    
    # Generate filename from ID or use original filename
    if "id" in data:
        filename = f"{data['id']}.yaml"
    else:
        filename = file.filename
    
    # Check if file already exists
    target_path = FLASHCARDS_DIR / filename
    allow_overwrite = overwrite.lower() == "true"
    
    if target_path.exists() and not allow_overwrite:
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "message": f"Flashcard with ID '{data.get('id', filename)}' already exists",
                "suggestion": "Use a different ID or enable overwrite option"
            }
        )
    
    # Ensure flashcards directory exists
    FLASHCARDS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save file
    try:
        with open(target_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        
        action = "overwritten" if target_path.existed() else "created"
        
        return {
            "success": True,
            "message": f"Flashcard '{data.get('id', filename)}' {action} successfully",
            "filename": filename,
            "flashcard_id": data.get("id"),
            "warnings": validation["warnings"],
            "stats": {
                "total_cards": len(data.get("flashcards", [])),
                "language": data.get("language"),
                "level": data.get("level"),
                "topics": data.get("topics", [])
            }
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )


@api_router.delete("/flashcards/{flashcard_id}")
async def delete_flashcard(flashcard_id: str):
    """Delete a flashcard file"""
    
    # Get safe path using validation function
    file_path = get_safe_flashcard_path(flashcard_id)
    
    if file_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Flashcard '{flashcard_id}' not found"
        )
    
    try:
        file_path.unlink()  # Delete the file
        return {
            "success": True,
            "message": f"Flashcard '{flashcard_id}' deleted successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )


@api_router.post("/flashcards/validate")
async def validate_flashcard_file(file: UploadFile = File(...)):
    """Validate a flashcard YAML file without saving it"""
    
    # Validate file extension
    if not (file.filename.endswith('.yaml') or file.filename.endswith('.yml')):
        raise HTTPException(
            status_code=400,
            detail="File must have .yaml or .yml extension"
        )
    
    # Parse YAML content
    try:
        content = await file.read()
        data = yaml.safe_load(content.decode('utf-8'))
    except yaml.YAMLError as e:
        return {
            "valid": False,
            "errors": [f"Invalid YAML format: {str(e)}"],
            "warnings": []
        }
    except UnicodeDecodeError as e:
        return {
            "valid": False,
            "errors": [f"File encoding error: {str(e)}. Please use UTF-8 encoding"],
            "warnings": []
        }
    
    # Validate structure
    validation = validate_flashcard_yaml(data)
    
    return {
        "valid": validation["valid"],
        "errors": validation["errors"],
        "warnings": validation["warnings"],
        "stats": {
            "total_cards": len(data.get("flashcards", [])),
            "language": data.get("language"),
            "level": data.get("level"),
            "topics": data.get("topics", [])
        } if validation["valid"] else None
    }

# Include the API router with all endpoints
app.include_router(api_router)

# Keep the original root endpoint for backward compatibility
@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Welcome to Ommiquiz API", "api": "/api"}

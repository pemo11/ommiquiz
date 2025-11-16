from fastapi import FastAPI, HTTPException, UploadFile, File, APIRouter, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import yaml
import os
import re
import tempfile
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

# Import logging configuration
from .logging_config import setup_logging, get_logger, LoggingMiddleware, log_function_call
from .auth import AuthenticatedUser, get_optional_current_user
from .download_logger import initialize_download_log_store, log_flashcard_download

# Initialize logging before creating the app
setup_logging()

# Get application logger
logger = get_logger("ommiquiz.main")

app = FastAPI(title="Ommiquiz API", version="1.0.0")

# Add logging middleware first
app.add_middleware(LoggingMiddleware)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8080", 
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
        "*"  # Allow all for development
    ],
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

CATALOG_FILENAME = "flashcards_catalog.yaml"
CATALOG_PATH = FLASHCARDS_DIR / CATALOG_FILENAME

logger.info("Application starting", flashcards_dir=str(FLASHCARDS_DIR))

# Compile regex pattern once for performance
VALID_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')


@log_function_call("get_safe_flashcard_path")
def get_safe_flashcard_path(flashcard_id: str) -> Optional[Path]:
    """
    Safely construct and validate a flashcard file path.
    Returns None if the flashcard doesn't exist or validation fails.
    """
    # Validate ID format to prevent path traversal
    if not VALID_ID_PATTERN.match(flashcard_id):
        logger.warning("Invalid flashcard ID format", flashcard_id=flashcard_id)
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
        logger.info("Flashcard file not found", flashcard_id=flashcard_id)
        return None
    
    # Ensure resolved path is within FLASHCARDS_DIR
    try:
        resolved_path = candidate_path.resolve()
        resolved_base = FLASHCARDS_DIR.resolve()
        if not str(resolved_path).startswith(str(resolved_base)):
            logger.error("Path traversal attempt detected", flashcard_id=flashcard_id, resolved_path=str(resolved_path))
            return None
    except Exception as e:
        logger.error("Error resolving flashcard path", flashcard_id=flashcard_id, error=str(e))
        return None
    
    logger.debug("Flashcard path resolved", flashcard_id=flashcard_id, path=str(candidate_path))
    return resolved_path


@api_router.get("/")
async def api_root():
    """API root endpoint"""
    logger.info("API root endpoint accessed")
    return {"message": "Welcome to Ommiquiz API"}


def _extract_flashcard_metadata(file_path: Path) -> Dict[str, Any]:
    """Read a flashcard file and extract its metadata"""
    metadata = {
        "id": file_path.stem,
        "filename": file_path.name,
        "title": file_path.stem,
        "description": "",
        "language": "",
        "level": "",
        "author": "",
        "topics": [],
        "module": "",
        "cardcount": 0
    }

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}

        metadata.update({
            "title": data.get("title", metadata["title"]),
            "description": data.get("description", ""),
            "language": data.get("language", ""),
            "level": data.get("level", ""),
            "author": data.get("author", ""),
            "topics": data.get("topics", []),
            "module": data.get("module", "")
        })

        flashcards_content = data.get("flashcards", [])
        if isinstance(flashcards_content, list):
            metadata["cardcount"] = len(flashcards_content)
        logger.debug("Processed flashcard file", filename=file_path.name)
    except Exception as e:
        logger.warning("Failed to parse flashcard file", filename=file_path.name, error=str(e))

    return metadata


def collect_flashcard_metadata() -> List[Dict[str, Any]]:
    """Collect metadata for all flashcard YAML files"""
    if not FLASHCARDS_DIR.exists():
        logger.warning("Flashcards directory does not exist", flashcards_dir=str(FLASHCARDS_DIR))
        return []

    flashcard_files: List[Dict[str, Any]] = []
    for pattern in ("*.yaml", "*.yml"):
        for file_path in FLASHCARDS_DIR.glob(pattern):
            flashcard_files.append(_extract_flashcard_metadata(file_path))

    return flashcard_files


def generate_flashcard_catalog() -> Dict[str, Any]:
    """Create or refresh the YAML catalog file and return its data"""
    logger.info("Generating flashcard catalog", flashcards_dir=str(FLASHCARDS_DIR))

    flashcard_files = collect_flashcard_metadata()
    FLASHCARDS_DIR.mkdir(parents=True, exist_ok=True)

    catalog_data: Dict[str, Any] = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "total": len(flashcard_files),
        "flashcards": flashcard_files
    }

    with open(CATALOG_PATH, 'w', encoding='utf-8') as catalog_file:
        yaml.safe_dump(catalog_data, catalog_file, allow_unicode=True, sort_keys=False)

    logger.info("Flashcard catalog created", path=str(CATALOG_PATH), count=len(flashcard_files))
    return catalog_data


@api_router.get("/flashcards")
async def list_flashcards():
    """List all available flashcard files with metadata"""
    logger.info("Listing flashcards", flashcards_dir=str(FLASHCARDS_DIR))

    flashcard_files = collect_flashcard_metadata()

    logger.info("Flashcards listed successfully", count=len(flashcard_files))
    return {"flashcards": flashcard_files}


@api_router.get("/flashcards/catalog")
async def get_flashcard_catalog():
    """Generate a catalog file with metadata of all flashcards"""
    generate_flashcard_catalog()
    return FileResponse(
        path=CATALOG_PATH,
        media_type="application/x-yaml",
        filename=CATALOG_FILENAME
    )


@api_router.get("/flashcards/catalog/data")
async def get_flashcard_catalog_data():
    """Read the generated catalog file and return its contents as JSON"""
    if not CATALOG_PATH.exists():
        logger.info("Catalog file not found, regenerating", path=str(CATALOG_PATH))
        catalog_data = generate_flashcard_catalog()
    else:
        logger.info("Loading flashcard catalog from file", path=str(CATALOG_PATH))
        with open(CATALOG_PATH, 'r', encoding='utf-8') as catalog_file:
            catalog_data = yaml.safe_load(catalog_file) or {}

    catalog_data.setdefault("flashcards", [])
    catalog_data.setdefault("total", len(catalog_data["flashcards"]))

    return catalog_data


@api_router.get("/flashcards/{flashcard_id}")
async def get_flashcard(
    flashcard_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
) -> Dict[str, Any]:
    """Get a specific flashcard file by ID"""
    logger.info("Getting flashcard", flashcard_id=flashcard_id)
    
    # Get safe path using validation function
    file_path = get_safe_flashcard_path(flashcard_id)
    
    if file_path is None:
        logger.error("Flashcard not found", flashcard_id=flashcard_id)
        raise HTTPException(status_code=404, detail=f"Flashcard '{flashcard_id}' not found")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        
        logger.info("Flashcard retrieved successfully",
                   flashcard_id=flashcard_id,
                   cards_count=len(data.get("flashcards", [])),
                   user_sub=user.sub if user else None)

        if user:
            log_flashcard_download(user, flashcard_id, file_path.name)

        return data
    except yaml.YAMLError as e:
        logger.error("YAML parsing error", flashcard_id=flashcard_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error parsing YAML file: {str(e)}")
    except Exception as e:
        logger.error("File reading error", flashcard_id=flashcard_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.debug("Health check requested")
    return {"status": "healthy"}


@api_router.get("/version")
async def get_version():
    """Get API version and system information"""
    logger.debug("Version endpoint requested")
    return {
        "api_version": "1.0.0",
        "service_name": "Ommiquiz API",
        "status": "running"
    }


@log_function_call("validate_flashcard_yaml")
def validate_flashcard_yaml(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate flashcard YAML structure and content.
    Returns validation result with errors if any.
    """
    errors = []
    warnings = []
    
    logger.debug("Starting flashcard validation")
    
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
    
    is_valid = len(errors) == 0
    logger.debug("Flashcard validation completed", 
                valid=is_valid, 
                errors_count=len(errors), 
                warnings_count=len(warnings))
    
    return {
        "valid": is_valid,
        "errors": errors,
        "warnings": warnings
    }


class FlashcardUpdateRequest(BaseModel):
    content: str
    filename: str

@api_router.put("/flashcards/{flashcard_id}")
async def update_flashcard(flashcard_id: str, request: FlashcardUpdateRequest):
    """Update an existing flashcard file"""
    
    logger.info("Updating flashcard", flashcard_id=flashcard_id)
    
    # Validate ID format
    if not VALID_ID_PATTERN.match(flashcard_id):
        logger.warning("Invalid flashcard ID for update", flashcard_id=flashcard_id)
        raise HTTPException(
            status_code=400,
            detail="Invalid flashcard ID format. Use only letters, numbers, hyphens, and underscores"
        )
    
    # Get the existing file path
    file_path = get_safe_flashcard_path(flashcard_id)
    
    if file_path is None:
        logger.error("Flashcard not found for update", flashcard_id=flashcard_id)
        raise HTTPException(
            status_code=404,
            detail=f"Flashcard '{flashcard_id}' not found"
        )
    
    # Parse YAML content
    try:
        data = yaml.safe_load(request.content)
    except yaml.YAMLError as e:
        logger.error("Invalid YAML in update request", flashcard_id=flashcard_id, error=str(e))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid YAML format: {str(e)}"
        )
    
    # Validate flashcard structure
    validation = validate_flashcard_yaml(data)
    if not validation["valid"]:
        logger.warning("Flashcard validation failed during update", 
                      flashcard_id=flashcard_id, 
                      errors=validation["errors"])
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
        logger.error("ID mismatch in update request", 
                    flashcard_id=flashcard_id, 
                    content_id=data.get("id"))
        raise HTTPException(
            status_code=400,
            detail=f"ID mismatch: URL specifies '{flashcard_id}' but content has '{data.get('id')}'"
        )
    
    # Update the file
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        
        logger.info("Flashcard updated successfully", 
                   flashcard_id=flashcard_id, 
                   cards_count=len(data.get("flashcards", [])))
        
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
        logger.error("Failed to update flashcard file", 
                    flashcard_id=flashcard_id, 
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update file: {str(e)}"
        )

@api_router.post("/flashcards/upload")
async def upload_flashcard(file: UploadFile = File(...), overwrite: str = Form(default="false")):
    """Upload and validate a new flashcard YAML file"""
    
    logger.info("Uploading flashcard", filename=file.filename, overwrite=overwrite)
    
    # Validate file extension
    if not (file.filename.endswith('.yaml') or file.filename.endswith('.yml')):
        logger.warning("Invalid file extension in upload", filename=file.filename)
        raise HTTPException(
            status_code=400, 
            detail="File must have .yaml or .yml extension"
        )
    
    # Validate file size (max 1MB)
    content = await file.read()
    if len(content) > 1024 * 1024:  # 1MB limit
        logger.warning("File too large in upload", filename=file.filename, size=len(content))
        raise HTTPException(
            status_code=413,
            detail="File size too large. Maximum size is 1MB"
        )
    
    # Parse YAML content
    try:
        data = yaml.safe_load(content.decode('utf-8'))
    except yaml.YAMLError as e:
        logger.error("YAML parsing error in upload", filename=file.filename, error=str(e))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid YAML format: {str(e)}"
        )
    except UnicodeDecodeError as e:
        logger.error("Encoding error in upload", filename=file.filename, error=str(e))
        raise HTTPException(
            status_code=400,
            detail=f"File encoding error: {str(e)}. Please use UTF-8 encoding"
        )
    
    # Validate flashcard structure
    validation = validate_flashcard_yaml(data)
    if not validation["valid"]:
        logger.warning("Flashcard validation failed during upload", 
                      filename=file.filename, 
                      errors=validation["errors"])
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
        logger.warning("Flashcard already exists", 
                      flashcard_id=data.get('id', filename), 
                      filename=filename)
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
        
        logger.info("Flashcard upload completed", 
                   flashcard_id=data.get("id"), 
                   filename=filename, 
                   action=action,
                   cards_count=len(data.get("flashcards", [])))
        
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
        logger.error("Failed to save uploaded flashcard", 
                    filename=filename, 
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )


@api_router.delete("/flashcards/{flashcard_id}")
async def delete_flashcard(flashcard_id: str):
    """Delete a flashcard file"""
    
    logger.info("Deleting flashcard", flashcard_id=flashcard_id)
    
    # Get safe path using validation function
    file_path = get_safe_flashcard_path(flashcard_id)
    
    if file_path is None:
        logger.error("Flashcard not found for deletion", flashcard_id=flashcard_id)
        raise HTTPException(
            status_code=404,
            detail=f"Flashcard '{flashcard_id}' not found"
        )
    
    try:
        file_path.unlink()  # Delete the file
        logger.info("Flashcard deleted successfully", flashcard_id=flashcard_id)
        return {
            "success": True,
            "message": f"Flashcard '{flashcard_id}' deleted successfully"
        }
    except Exception as e:
        logger.error("Failed to delete flashcard", 
                    flashcard_id=flashcard_id, 
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )


@api_router.post("/flashcards/validate")
async def validate_flashcard_file(file: UploadFile = File(...)):
    """Validate a flashcard YAML file without saving it"""
    
    logger.info("Validating flashcard file", filename=file.filename)
    
    # Validate file extension
    if not (file.filename.endswith('.yaml') or file.filename.endswith('.yml')):
        logger.warning("Invalid file extension in validation", filename=file.filename)
        raise HTTPException(
            status_code=400,
            detail="File must have .yaml or .yml extension"
        )
    
    # Parse YAML content
    try:
        content = await file.read()
        data = yaml.safe_load(content.decode('utf-8'))
    except yaml.YAMLError as e:
        logger.warning("YAML parsing error in validation", filename=file.filename, error=str(e))
        return {
            "valid": False,
            "errors": [f"Invalid YAML format: {str(e)}"],
            "warnings": []
        }
    except UnicodeDecodeError as e:
        logger.warning("Encoding error in validation", filename=file.filename, error=str(e))
        return {
            "valid": False,
            "errors": [f"File encoding error: {str(e)}. Please use UTF-8 encoding"],
            "warnings": []
        }
    
    # Validate structure
    validation = validate_flashcard_yaml(data)
    
    logger.info("Flashcard validation completed", 
               filename=file.filename, 
               valid=validation["valid"], 
               errors_count=len(validation["errors"]))
    
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
    logger.info("Root endpoint accessed")
    return {"message": "Welcome to Ommiquiz API", "api": "/api"}

# Application startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    initialize_download_log_store()
    logger.info("Application startup completed")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    logger.info("Application shutdown initiated")

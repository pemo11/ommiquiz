from fastapi import FastAPI, HTTPException, UploadFile, File, APIRouter, Form, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from pydantic import BaseModel
import yaml
import re
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

# Import logging configuration
from .logging_config import setup_logging, get_logger, LoggingMiddleware, log_function_call
from .auth import AuthenticatedUser, get_optional_current_user, login_with_email_password
from .download_logger import initialize_download_log_store, log_flashcard_download
from .storage import FlashcardDocument, get_flashcard_storage
from .pdf_generator import generate_speed_quiz_pdf

# Initialize logging before creating the app
setup_logging()

# Get application logger
logger = get_logger("ommiquiz.main")

app = FastAPI(title="Ommiquiz API", version="1.0.8")

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


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: Optional[int] = None
    refresh_token: Optional[str] = None
    id_token: Optional[str] = None

# Support both Docker and local development paths
if Path("/app/flashcards").exists():
    FLASHCARDS_DIR = Path("/app/flashcards")
else:
    FLASHCARDS_DIR = Path(__file__).parent.parent / "flashcards"

CATALOG_FILENAME = "flashcards_catalog.yml"

storage = get_flashcard_storage(FLASHCARDS_DIR, CATALOG_FILENAME)

logger.info("Application starting", flashcards_dir=str(FLASHCARDS_DIR))

# Compile regex pattern once for performance
VALID_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')

def get_flashcard_document(flashcard_id: str) -> Optional[FlashcardDocument]:
    """Retrieve a flashcard document from the configured storage backend."""

    if not VALID_ID_PATTERN.match(flashcard_id):
        logger.warning("Invalid flashcard ID format", flashcard_id=flashcard_id)
        return None

    document = storage.get_flashcard(flashcard_id)
    if not document:
        logger.info("Flashcard document not found", flashcard_id=flashcard_id)
    return document


def find_flashcard_filename_by_id(flashcard_id: str) -> Optional[str]:
    """Find the actual filename for a flashcard by scanning all documents.

    This is needed because filenames may not match IDs (e.g.,
    DBTE_Kapitel9_Vektordatenbanken.yml contains id: dbte_kapitel9_quiz).
    """
    logger.info("Searching for flashcard filename", flashcard_id=flashcard_id)

    # Get all documents from storage
    all_documents = storage.list_flashcards()

    for document in all_documents:
        # Skip the catalog file
        if document.filename == CATALOG_FILENAME:
            continue

        # Parse the YAML to get the ID
        try:
            data = yaml.safe_load(document.content)
            if data and data.get("id") == flashcard_id:
                logger.info("Found flashcard by ID scan",
                           flashcard_id=flashcard_id,
                           actual_filename=document.filename)
                return document.filename
        except Exception as e:
            logger.warning("Failed to parse flashcard during ID search",
                          filename=document.filename,
                          error=str(e))
            continue

    logger.info("No flashcard found with ID", flashcard_id=flashcard_id)
    return None


@api_router.get("/")
async def api_root():
    """API root endpoint"""
    logger.info("API root endpoint accessed")
    return {"message": "Welcome to Ommiquiz API"}


@api_router.post("/auth/login", response_model=LoginResponse)
async def auth_login(payload: LoginRequest):
    """Authenticate a user with Auth0 using email and password credentials."""

    token_data = await login_with_email_password(payload.email, payload.password)
    return token_data


def _extract_flashcard_metadata(document: FlashcardDocument) -> Dict[str, Any]:
    """Read a flashcard document and extract its metadata"""
    metadata = {
        "id": document.id,
        "filename": document.filename,
        "title": document.id,
        "description": "",
        "language": "",
        "level": "",
        "author": "",
        "topics": [],
        "module": "",
        "cardcount": 0
    }

    try:
        data = yaml.safe_load(document.content) or {}

        # Use the actual ID from YAML content, not the filename stem
        actual_id = data.get("id", document.id)

        metadata.update({
            "id": actual_id,  # Use actual ID from YAML
            "title": data.get("title", actual_id),
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
        logger.debug("Processed flashcard document", filename=document.filename)
    except Exception as e:
        logger.warning("Failed to parse flashcard file", filename=document.filename, error=str(e))

    return metadata


def collect_flashcard_metadata() -> List[Dict[str, Any]]:
    """Collect metadata for all flashcard YAML files"""
    flashcard_files: List[Dict[str, Any]] = []
    
    logger.info("🔍 Starting flashcard metadata collection")
    
    all_documents = storage.list_flashcards()
    logger.info("📋 Storage returned documents", count=len(all_documents))
    
    for index, document in enumerate(all_documents):
        logger.info("🔍 Processing document", 
                   index=index + 1, 
                   filename=document.filename, 
                   id=document.id,
                   content_length=len(document.content) if document.content else 0)
        
        # Skip catalog file (check both .yml and .yaml extensions)
        if document.filename in (CATALOG_FILENAME, "flashcards_catalog.yaml", "flashcards_catalog.yml"):
            logger.debug("⏭️ Skipping catalog file during metadata collection", filename=document.filename)
            continue
            
        # Add detailed logging before processing each file
        logger.info("📄 About to extract metadata from", 
                   filename=document.filename,
                   has_content=bool(document.content))
        
        metadata = _extract_flashcard_metadata(document)
        
        # Log the extracted metadata with special attention to phantom modules
        logger.info("📊 Extracted metadata", 
                   filename=document.filename,
                   metadata=metadata,
                   is_empty_module=not metadata.get("module"),
                   is_query_optimierung=metadata.get("id") == "DBTE_QueryOptimierung")
        
        if metadata.get("id") == "DBTE_QueryOptimierung":
            logger.warning("🚨 PHANTOM MODULE DETECTED IN BACKEND", 
                          filename=document.filename,
                          full_metadata=metadata,
                          content_preview=document.content[:500] if document.content else "[NO_CONTENT]")
        
        flashcard_files.append(metadata)
    
    logger.info("✅ Flashcard metadata collection complete", total_count=len(flashcard_files))
    
    # Final analysis of collected metadata
    phantom_modules = [f for f in flashcard_files if not f.get("title") and not f.get("description")]
    if phantom_modules:
        logger.warning("🚨 Found phantom modules in collection", 
                      count=len(phantom_modules), 
                      phantom_modules=phantom_modules)

    return flashcard_files


def generate_flashcard_catalog() -> Tuple[Dict[str, Any], Path]:
    """Create or refresh the YAML catalog file and return its data and local path"""
    logger.info("Generating flashcard catalog")

    flashcard_files = collect_flashcard_metadata()

    catalog_data: Dict[str, Any] = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "total": len(flashcard_files),
        "flashcard-sets": flashcard_files
    }

    catalog_yaml = yaml.safe_dump(catalog_data, allow_unicode=True, sort_keys=False)
    catalog_path = storage.save_catalog(catalog_yaml, CATALOG_FILENAME)

    logger.info("Flashcard catalog created", path=str(catalog_path), count=len(flashcard_files))
    return catalog_data, catalog_path


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
    _, catalog_path = generate_flashcard_catalog()
    return FileResponse(
        path=catalog_path,
        media_type="application/x-yaml",
        filename=CATALOG_FILENAME
    )


@api_router.get("/flashcards/catalog/data")
async def get_flashcard_catalog_data():
    """Read the generated catalog file and return its contents as JSON"""
    catalog_data, _ = generate_flashcard_catalog()

    catalog_data.setdefault("flashcard-sets", [])
    catalog_data.setdefault("total", len(catalog_data["flashcard-sets"]))

    return catalog_data


@api_router.get("/flashcards/{flashcard_id}")
async def get_flashcard(
    flashcard_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
) -> Dict[str, Any]:
    """Get a specific flashcard file by ID"""
    logger.info("Getting flashcard", flashcard_id=flashcard_id)

    # First try the old way (for backwards compatibility)
    document = get_flashcard_document(flashcard_id)

    # If not found by ID-based filename, scan all documents to find actual filename
    if document is None:
        logger.info("Flashcard not found by ID-based filename, scanning all documents",
                   flashcard_id=flashcard_id)
        filename = find_flashcard_filename_by_id(flashcard_id)
        if filename:
            # Read the file directly by its actual filename
            all_documents = storage.list_flashcards()
            for doc in all_documents:
                if doc.filename == filename:
                    document = doc
                    logger.info("Found flashcard by scanning",
                               flashcard_id=flashcard_id,
                               actual_filename=filename)
                    break

    if document is None:
        logger.error("Flashcard not found", flashcard_id=flashcard_id)
        raise HTTPException(status_code=404, detail=f"Flashcard '{flashcard_id}' not found")

    try:
        data = yaml.safe_load(document.content)

        logger.info("Flashcard retrieved successfully",
                   flashcard_id=flashcard_id,
                   cards_count=len(data.get("flashcards", [])),
                   user_sub=user.sub if user else None)

        if user:
            log_flashcard_download(user, flashcard_id, document.filename)

        return data
    except yaml.YAMLError as e:
        logger.error("YAML parsing error", flashcard_id=flashcard_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error parsing YAML file: {str(e)}")
    except Exception as e:
        logger.error("File reading error", flashcard_id=flashcard_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


@api_router.get("/flashcards/{flashcard_id}/speed-quiz-pdf")
async def get_speed_quiz_pdf(
    flashcard_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
):
    """
    Generate a PDF worksheet with 12 random speed quiz questions.

    Single choice questions include a dotted line for writing answers.
    Multiple choice questions include checkboxes for each option.
    Answers are not included in the PDF.
    """
    logger.info("Generating speed quiz PDF", flashcard_id=flashcard_id)

    # Get flashcard document
    document = get_flashcard_document(flashcard_id)

    # If not found by ID-based filename, scan all documents to find actual filename
    if document is None:
        logger.info("Flashcard not found by ID-based filename, scanning all documents",
                   flashcard_id=flashcard_id)
        filename = find_flashcard_filename_by_id(flashcard_id)
        if filename:
            all_documents = storage.list_flashcards()
            for doc in all_documents:
                if doc.filename == filename:
                    document = doc
                    logger.info("Found flashcard by scanning",
                               flashcard_id=flashcard_id,
                               actual_filename=filename)
                    break

    if document is None:
        logger.error("Flashcard not found for PDF generation", flashcard_id=flashcard_id)
        raise HTTPException(status_code=404, detail=f"Flashcard '{flashcard_id}' not found")

    try:
        # Parse YAML content
        data = yaml.safe_load(document.content)

        # Generate PDF
        pdf_buffer = generate_speed_quiz_pdf(data)

        logger.info("Speed quiz PDF generated successfully",
                   flashcard_id=flashcard_id,
                   user_sub=user.sub if user else None)

        # Create safe filename
        title = data.get('title', 'speed-quiz')
        safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '-')
        filename = f"{safe_title}-speed-quiz.pdf"

        # Return PDF as streaming response
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    except yaml.YAMLError as e:
        logger.error("YAML parsing error for PDF generation",
                    flashcard_id=flashcard_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"Error parsing YAML file: {str(e)}")
    except Exception as e:
        logger.error("PDF generation error",
                    flashcard_id=flashcard_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.debug("Health check requested")
    return {
        "status": "healthy",
        "version": os.getenv("APP_VERSION", "1.0.13")
    }


@api_router.get("/version")
async def get_version():
    """Get API version and system information"""
    logger.debug("Version endpoint requested")
    return {
        "api_version": "1.10.0",
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
                      "language", "topics", "keywords", "flashcards"]

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

                # Optional bitmap validation
                if "bitmap" in card and not isinstance(card["bitmap"], str):
                    errors.append(f"Flashcard {i+1} field 'bitmap' must be a string containing image data")
    
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
    old_id: str | None = None  # For rename operations

@api_router.put("/flashcards/{flashcard_id}")
async def update_flashcard(flashcard_id: str, request: FlashcardUpdateRequest):
    """Create or update a flashcard file"""

    logger.info("Updating flashcard", flashcard_id=flashcard_id)

    # Validate ID format
    if not VALID_ID_PATTERN.match(flashcard_id):
        logger.warning("Invalid flashcard ID for update", flashcard_id=flashcard_id)
        raise HTTPException(
            status_code=400,
            detail="Invalid flashcard ID format. Use only letters, numbers, hyphens, and underscores"
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

    # Handle rename operation if old_id is provided
    if request.old_id and request.old_id != flashcard_id:
        logger.info("Processing flashcard rename",
                   old_id=request.old_id,
                   new_id=flashcard_id)
        # Find and delete the old file by scanning all documents
        old_filename = find_flashcard_filename_by_id(request.old_id)
        if old_filename:
            # Delete the old file using its actual filename
            try:
                storage.delete_flashcard_by_filename(old_filename)
                logger.info("Deleted old flashcard during rename",
                           old_id=request.old_id,
                           old_filename=old_filename)
            except Exception as e:
                logger.warning("Failed to delete old flashcard during rename",
                             old_id=request.old_id,
                             old_filename=old_filename,
                             error=str(e))
        # Treat as new document with new ID
        filename = None
        is_new_document = True
    else:
        # Normal update or create - find the actual filename by scanning all documents
        filename = find_flashcard_filename_by_id(flashcard_id)
        is_new_document = filename is None

    # Determine the filename to use
    if is_new_document:
        # New document - use the provided filename or default to ID.yml
        filename = (request.filename or "").strip() or f"{flashcard_id}.yml"
        logger.info("Flashcard not found, creating new file",
                    flashcard_id=flashcard_id,
                    filename=filename)
        overwrite = False
    else:
        # Existing document - keep the original filename
        logger.info("Updating existing flashcard with original filename",
                    flashcard_id=flashcard_id,
                    filename=filename)
        overwrite = True

    # Update or create the file
    try:
        updated_content = yaml.dump(
            data, default_flow_style=False, allow_unicode=True, sort_keys=False
        )
        logger.info("Calling storage.save_flashcard",
                   flashcard_id=flashcard_id,
                   filename=filename,
                   overwrite=overwrite,
                   content_length=len(updated_content),
                   storage_type=type(storage).__name__)
        saved_document = storage.save_flashcard(
            filename, updated_content, overwrite=overwrite
        )

        action = "created" if is_new_document else "updated"
        logger.info(f"Flashcard {action} successfully",
                   flashcard_id=flashcard_id,
                   filename=filename,
                   cards_count=len(data.get("flashcards", [])))

        return {
            "success": True,
            "message": f"Flashcard '{flashcard_id}' {action} successfully",
            "filename": saved_document.filename,
            "flashcard_id": flashcard_id,
            "warnings": validation["warnings"],
            "stats": {
                "total_cards": len(data.get("flashcards", [])),
                "language": data.get("language"),
                "level": data.get("level"),
                "topics": data.get("topics", [])
            }
        }

    except FileExistsError as e:
        logger.warning("Flashcard already exists and overwrite not allowed",
                      flashcard_id=flashcard_id,
                      filename=filename,
                      error=str(e))
        raise HTTPException(
            status_code=409,
            detail=str(e)
        )
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
    
    flashcard_id = data.get("id")
    # Preserve the original file extension (.yml or .yaml)
    original_extension = file.filename[file.filename.rfind('.'):]  # Gets .yml or .yaml
    filename = f"{flashcard_id}{original_extension}"
    allow_overwrite = overwrite.lower() == "true"

    existing_flashcard = storage.flashcard_exists(flashcard_id)

    if existing_flashcard and not allow_overwrite:
        logger.warning("Flashcard already exists",
                      flashcard_id=flashcard_id,
                      filename=filename)
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "message": f"Flashcard with ID '{flashcard_id}' already exists",
                "suggestion": "Use a different ID or enable overwrite option"
            }
        )

    # Save file
    try:
        serialized = yaml.dump(
            data, default_flow_style=False, allow_unicode=True, sort_keys=False
        )
        action = "overwritten" if existing_flashcard else "created"
        storage.save_flashcard(filename, serialized, overwrite=allow_overwrite)

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

    # First try to find by ID-based filename
    document = get_flashcard_document(flashcard_id)
    filename = None

    # If not found, scan all documents to find actual filename
    if document is None:
        logger.info("Flashcard not found by ID-based filename, scanning all documents for deletion",
                   flashcard_id=flashcard_id)
        filename = find_flashcard_filename_by_id(flashcard_id)
        if not filename:
            logger.error("Flashcard not found for deletion", flashcard_id=flashcard_id)
            raise HTTPException(
                status_code=404,
                detail=f"Flashcard '{flashcard_id}' not found"
            )
    else:
        filename = document.filename

    try:
        # Delete by actual filename if found by scanning, otherwise use ID-based deletion
        if filename and filename != f"{flashcard_id}.yaml" and filename != f"{flashcard_id}.yml":
            # Delete by actual filename
            success = storage.delete_flashcard_by_filename(filename)
            deleted_files = [filename] if success else []
        else:
            # Use ID-based deletion (tries both .yaml and .yml)
            deleted_files = storage.delete_flashcard(flashcard_id)

        if not deleted_files:
            logger.error("Failed to delete flashcard from storage", flashcard_id=flashcard_id)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete flashcard '{flashcard_id}'"
            )

        # Regenerate the catalog to keep it in sync with the storage backend
        generate_flashcard_catalog()

        logger.info(
            "Flashcard deleted successfully",
            flashcard_id=flashcard_id,
            deleted_files=deleted_files
        )
        return {
            "success": True,
            "message": f"Flashcard '{flashcard_id}' deleted successfully",
            "deleted_files": deleted_files
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

@api_router.get("/logs")
async def query_logs(
    start_time: Optional[datetime] = Query(None, description="Start time for log filtering (ISO format)"),
    end_time: Optional[datetime] = Query(None, description="End time for log filtering (ISO format)"), 
    level: Optional[str] = Query(None, description="Log level filter (DEBUG, INFO, WARNING, ERROR)"),
    message_contains: Optional[str] = Query(None, description="Filter logs containing this text"),
    limit: int = Query(100, description="Maximum number of log entries to return"),
    offset: int = Query(0, description="Number of log entries to skip")
):
    """Query and filter log entries from application logs"""
    logger.info("Querying logs", 
               start_time=start_time, 
               end_time=end_time, 
               level=level, 
               message_contains=message_contains,
               limit=limit,
               offset=offset)

    try:
        # Support both Docker and local development paths for logs
        if Path("/app/logs").exists():
            logs_dir = Path("/app/logs")
        else:
            logs_dir = Path(__file__).parent.parent / "logs"
            
        if not logs_dir.exists():
            logger.warning("Logs directory not found", logs_dir=str(logs_dir))
            raise HTTPException(status_code=404, detail="Logs directory not found")

        log_entries = []
        
        # Get all log files sorted by modification time (newest first)
        log_files = sorted(logs_dir.glob("*.log"), key=lambda x: x.stat().st_mtime, reverse=True)
        
        if not log_files:
            logger.warning("No log files found", logs_dir=str(logs_dir))
            return {"logs": [], "total": 0, "filtered": 0}

        # Process log files (limit to last 7 days to avoid performance issues)
        recent_files = log_files[:7]  # Last 7 log files
        
        for log_file in recent_files:
            try:
                with open(log_file, 'r', encoding='utf-8') as f:
                    for line_num, line in enumerate(f, 1):
                        line = line.strip()
                        if not line:
                            continue
                            
                        try:
                            # Try to parse as JSON (structured log)
                            log_data = json.loads(line)
                            
                            # Normalize timestamp field
                            timestamp_str = log_data.get("timestamp") or log_data.get("asctime") or log_data.get("dt")
                            if timestamp_str:
                                # Parse ISO format timestamp
                                try:
                                    if timestamp_str.endswith('Z'):
                                        timestamp_str = timestamp_str[:-1] + '+00:00'
                                    log_timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                                except:
                                    # Fallback parsing
                                    log_timestamp = datetime.now()
                            else:
                                log_timestamp = datetime.now()
                            
                            entry = {
                                "timestamp": log_timestamp.isoformat(),
                                "level": log_data.get("level") or log_data.get("levelname", "INFO"),
                                "message": log_data.get("message", ""),
                                "logger": log_data.get("logger") or log_data.get("name", ""),
                                "file": log_file.name,
                                "line_number": line_num,
                                "extra": {k: v for k, v in log_data.items() 
                                        if k not in ["timestamp", "level", "message", "logger", "name", "asctime", "dt"]}
                            }
                            
                        except json.JSONDecodeError:
                            # Handle plain text logs (fallback)
                            # Try to extract basic info from text format
                            parts = line.split(" - ", 3)
                            if len(parts) >= 4:
                                timestamp_part = parts[0]
                                level_part = parts[2] 
                                message_part = " - ".join(parts[3:])
                            else:
                                timestamp_part = datetime.now().isoformat()
                                level_part = "INFO"
                                message_part = line
                                
                            entry = {
                                "timestamp": timestamp_part,
                                "level": level_part,
                                "message": message_part,
                                "logger": "unknown",
                                "file": log_file.name,
                                "line_number": line_num,
                                "extra": {}
                            }
                        
                        log_entries.append(entry)
                        
            except Exception as e:
                logger.warning("Failed to read log file", file=log_file.name, error=str(e))
                continue
        
        # Sort by timestamp (newest first)
        log_entries.sort(key=lambda x: x["timestamp"], reverse=True)
        
        total_entries = len(log_entries)
        
        # Apply filters
        filtered_logs = []
        for entry in log_entries:
            # Time range filter
            if start_time:
                entry_time = datetime.fromisoformat(entry["timestamp"].replace('Z', '+00:00'))
                if entry_time < start_time:
                    continue
            if end_time:
                entry_time = datetime.fromisoformat(entry["timestamp"].replace('Z', '+00:00'))
                if entry_time > end_time:
                    continue
                    
            # Level filter
            if level and entry["level"].upper() != level.upper():
                continue
                
            # Message content filter
            if message_contains and message_contains.lower() not in entry["message"].lower():
                continue
                
            filtered_logs.append(entry)
        
        # Apply pagination
        paginated_logs = filtered_logs[offset:offset + limit]
        
        logger.info("Logs queried successfully", 
                   total=total_entries,
                   filtered=len(filtered_logs), 
                   returned=len(paginated_logs))
        
        return {
            "logs": paginated_logs,
            "total": total_entries,
            "filtered": len(filtered_logs),
            "returned": len(paginated_logs),
            "offset": offset,
            "limit": limit
        }
        
    except Exception as e:
        logger.error("Failed to query logs", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to query logs: {str(e)}")


@api_router.get("/logs/files")
async def list_log_files():
    """List available log files"""
    logger.info("Listing log files")
    
    try:
        # Support both Docker and local development paths for logs
        if Path("/app/logs").exists():
            logs_dir = Path("/app/logs")
        else:
            logs_dir = Path(__file__).parent.parent / "logs"
            
        if not logs_dir.exists():
            raise HTTPException(status_code=404, detail="Logs directory not found")

        log_files = []
        for log_file in sorted(logs_dir.glob("*.log"), key=lambda x: x.stat().st_mtime, reverse=True):
            stat = log_file.stat()
            log_files.append({
                "filename": log_file.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "size_mb": round(stat.st_size / 1024 / 1024, 2)
            })
        
        logger.info("Log files listed successfully", count=len(log_files))
        return {"log_files": log_files}
        
    except Exception as e:
        logger.error("Failed to list log files", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to list log files: {str(e)}")


@api_router.get("/logs/download/{filename}")
async def download_log_file(filename: str):
    """Download a specific log file"""
    logger.info("Downloading log file", filename=filename)
    
    # Validate filename to prevent path traversal
    if not re.match(r'^[a-zA-Z0-9_-]+\.log$', filename):
        raise HTTPException(status_code=400, detail="Invalid log filename")
    
    try:
        # Support both Docker and local development paths for logs
        if Path("/app/logs").exists():
            logs_dir = Path("/app/logs")
        else:
            logs_dir = Path(__file__).parent.parent / "logs"
            
        log_file_path = logs_dir / filename
        
        if not log_file_path.exists():
            raise HTTPException(status_code=404, detail="Log file not found")
        
        logger.info("Log file download initiated", filename=filename, size=log_file_path.stat().st_size)
        
        return FileResponse(
            path=log_file_path,
            media_type="text/plain",
            filename=filename,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error("Failed to download log file", filename=filename, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to download log file: {str(e)}")


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

    # Generate flashcard catalog on startup
    try:
        catalog_data, catalog_path = generate_flashcard_catalog()
        logger.info("Flashcard catalog generated on startup",
                   total_flashcards=catalog_data.get("total", 0),
                   catalog_path=str(catalog_path))
    except Exception as e:
        logger.error("Failed to generate flashcard catalog on startup",
                    error=str(e),
                    error_type=type(e).__name__)

    logger.info("Application startup completed")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    logger.info("Application shutdown initiated")

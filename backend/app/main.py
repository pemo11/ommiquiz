from fastapi import FastAPI, HTTPException, UploadFile, File, APIRouter, Form, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from pydantic import BaseModel
import yaml
import re
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

# Import logging configuration
from .logging_config import setup_logging, get_logger, LoggingMiddleware, log_function_call
from .auth import AuthenticatedUser, get_optional_current_user, get_current_user, get_current_admin
from .download_logger import initialize_download_log_store, log_flashcard_download
from .storage import FlashcardDocument, get_flashcard_storage
from .pdf_generator import generate_speed_quiz_pdf
from . import progress_storage

# Initialize logging before creating the app
setup_logging()

# Get application logger
logger = get_logger("ommiquiz.main")

app = FastAPI(title="Ommiquiz API", version="1.0.30")

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


class SignupRequest(BaseModel):
    email: str
    password: str
    username: str


class SessionResponse(BaseModel):
    user: Optional[Dict[str, Any]] = None
    session: Optional[Dict[str, Any]] = None


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


# Authentication endpoint removed - use Supabase client directly for authentication
# ===== Authentication Endpoints =====
# These endpoints proxy authentication requests to Supabase Auth API
# This keeps the frontend independent of Supabase

@api_router.post("/auth/signup")
async def auth_signup(payload: SignupRequest):
    """Sign up a new user via Supabase Auth API"""
    import httpx

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    site_url = os.getenv("SITE_URL", "https://ommiquiz.de")

    if not supabase_url or not supabase_anon_key:
        raise HTTPException(status_code=500, detail="Supabase configuration missing")

    logger.info("Processing signup request", email=payload.email)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{supabase_url}/auth/v1/signup",
                json={
                    "email": payload.email,
                    "password": payload.password,
                    "options": {
                        "email_redirect_to": site_url,
                        "data": {
                            "username": payload.username,
                            "display_name": payload.username
                        }
                    }
                },
                headers={
                    "apikey": supabase_anon_key,
                    "Content-Type": "application/json"
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                logger.error("Signup failed", status=response.status_code, error=error_data)
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get("msg", "Signup failed")
                )

            data = response.json()
            logger.info("Signup successful", email=payload.email)

            return {
                "user": data.get("user"),
                "session": data.get("session"),
                "message": "Signup successful. Please check your email for confirmation."
            }
    except httpx.HTTPError as e:
        logger.error("HTTP error during signup", error=str(e))
        raise HTTPException(status_code=500, detail="Network error during signup")


@api_router.post("/auth/login")
async def auth_login(payload: LoginRequest):
    """Authenticate a user via Supabase Auth API"""
    import httpx

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_anon_key:
        raise HTTPException(status_code=500, detail="Supabase configuration missing")

    logger.info("Processing login request", email=payload.email)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{supabase_url}/auth/v1/token?grant_type=password",
                json={
                    "email": payload.email,
                    "password": payload.password
                },
                headers={
                    "apikey": supabase_anon_key,
                    "Content-Type": "application/json"
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                logger.warning("Login failed", email=payload.email, status=response.status_code)
                raise HTTPException(
                    status_code=401,
                    detail=error_data.get("error_description", "Invalid email or password")
                )

            data = response.json()
            logger.info("Login successful", email=payload.email)

            return {
                "user": data.get("user"),
                "session": data.get("session"),
                "access_token": data.get("access_token"),
                "refresh_token": data.get("refresh_token"),
                "expires_in": data.get("expires_in")
            }
    except httpx.HTTPError as e:
        logger.error("HTTP error during login", error=str(e))
        raise HTTPException(status_code=500, detail="Network error during login")


@api_router.post("/auth/logout")
async def auth_logout(user: AuthenticatedUser = Depends(get_current_user)):
    """Sign out the current user"""
    import httpx

    supabase_url = os.getenv("SUPABASE_URL")
    access_token = user.access_token

    if not supabase_url:
        raise HTTPException(status_code=500, detail="Supabase configuration missing")

    logger.info("Processing logout request", user_id=user.user_id)

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{supabase_url}/auth/v1/logout",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                }
            )

        logger.info("Logout successful", user_id=user.user_id)
        return {"message": "Logged out successfully"}
    except httpx.HTTPError as e:
        logger.error("HTTP error during logout", error=str(e))
        # Don't fail logout on network errors
        return {"message": "Logged out locally"}


@api_router.get("/auth/session")
async def get_auth_session(user: AuthenticatedUser = Depends(get_current_user)):
    """Get current session information"""
    logger.info("Getting session", user_id=user.user_id)

    return {
        "user": {
            "id": user.user_id,
            "email": user.email,
            "sub": user.sub
        },
        "session": {
            "access_token": user.access_token,
            "user_id": user.user_id
        }
    }


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
        "cardcount": 0,
        "modified_time": document.modified_time.isoformat() if document.modified_time else None
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
async def list_flashcards(
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
):
    """List all available flashcard files with metadata (global catalog + user flashcards)"""
    logger.info("Listing flashcards", flashcards_dir=str(FLASHCARDS_DIR), user_id=user.user_id if user else None)

    # Get global catalog flashcards
    flashcard_files = collect_flashcard_metadata()

    # Merge user flashcards
    if user:
        try:
            from .database import get_db_pool

            pool = await get_db_pool()
            async with pool.acquire() as conn:
                # Get global user flashcards (visible to everyone)
                global_user_flashcards = await conn.fetch(
                    """SELECT flashcard_id, title, description, author, language,
                              module, topics, keywords, card_count, created_at, updated_at
                       FROM user_flashcards
                       WHERE visibility = 'global'"""
                )

                # Get current user's private flashcards
                private_user_flashcards = await conn.fetch(
                    """SELECT flashcard_id, title, description, author, language,
                              module, topics, keywords, card_count, created_at, updated_at
                       FROM user_flashcards
                       WHERE owner_id = $1 AND visibility = 'private'""",
                    user.user_id
                )

                # Convert to metadata format
                for row in list(global_user_flashcards) + list(private_user_flashcards):
                    flashcard_files.append({
                        "id": row["flashcard_id"],
                        "title": row["title"],
                        "description": row["description"],
                        "author": row["author"],
                        "language": row["language"],
                        "module": row["module"],
                        "topics": row["topics"] or [],
                        "keywords": row["keywords"] or [],
                        "cardCount": row["card_count"],
                        "source": "user",  # Marker for user-generated
                        "visibility": "global" if row in global_user_flashcards else "private"
                    })

        except Exception as e:
            logger.error("Failed to fetch user flashcards", error=str(e))
            # Continue with global catalog only if user flashcards fail
    else:
        # For unauthenticated users, include global user flashcards
        try:
            from .database import get_db_pool

            pool = await get_db_pool()
            async with pool.acquire() as conn:
                global_user_flashcards = await conn.fetch(
                    """SELECT flashcard_id, title, description, author, language,
                              module, topics, keywords, card_count, created_at, updated_at
                       FROM user_flashcards
                       WHERE visibility = 'global'"""
                )

                for row in global_user_flashcards:
                    flashcard_files.append({
                        "id": row["flashcard_id"],
                        "title": row["title"],
                        "description": row["description"],
                        "author": row["author"],
                        "language": row["language"],
                        "module": row["module"],
                        "topics": row["topics"] or [],
                        "keywords": row["keywords"] or [],
                        "cardCount": row["card_count"],
                        "source": "user",
                        "visibility": "global"
                    })

        except Exception as e:
            logger.error("Failed to fetch global user flashcards", error=str(e))

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
    logger.info("Getting flashcard", flashcard_id=flashcard_id, user_id=user.user_id if user else None)

    document = None

    # Check if this is a user flashcard first
    from .storage import is_user_flashcard
    if is_user_flashcard(flashcard_id):
        logger.info("Detected user flashcard", flashcard_id=flashcard_id)
        try:
            from .database import get_db_pool

            pool = await get_db_pool()
            async with pool.acquire() as conn:
                flashcard_row = await conn.fetchrow(
                    """SELECT owner_id, visibility FROM user_flashcards
                       WHERE flashcard_id = $1""",
                    flashcard_id
                )

                if flashcard_row:
                    # Check permissions
                    if flashcard_row["visibility"] == "global":
                        # Anyone can access global flashcards
                        pass
                    elif flashcard_row["visibility"] == "private":
                        # Only owner can access private flashcards
                        if not user or user.user_id != flashcard_row["owner_id"]:
                            raise HTTPException(
                                status_code=403,
                                detail="Not authorized to access this private flashcard"
                            )

                    # Load from user storage
                    document = storage.get_user_flashcard(flashcard_row["owner_id"], flashcard_id)
                    if not document:
                        logger.error("User flashcard not found in storage", flashcard_id=flashcard_id)
                        raise HTTPException(status_code=404, detail=f"Flashcard '{flashcard_id}' not found")
                else:
                    logger.warning("User flashcard not found in database", flashcard_id=flashcard_id)
                    raise HTTPException(status_code=404, detail=f"Flashcard '{flashcard_id}' not found")

        except HTTPException:
            raise
        except Exception as e:
            logger.error("Error retrieving user flashcard", flashcard_id=flashcard_id, error=str(e))
            raise HTTPException(status_code=500, detail=f"Error retrieving flashcard: {str(e)}")
    else:
        # Global catalog flashcard
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

    # Parse and return the flashcard data
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


@api_router.get("/flashcards/{flashcard_id}/progress")
async def get_user_progress(
    flashcard_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
):
    """
    Get user's learning progress for a specific flashcard set.

    Returns box assignments and session history.
    Requires authentication.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    logger.info("Loading user progress",
                user_id=user.user_id,
                flashcard_id=flashcard_id)

    progress = await progress_storage.load_user_progress(user.user_id, flashcard_id)

    return {
        "flashcard_id": flashcard_id,
        "progress": progress
    }


@api_router.put("/flashcards/{flashcard_id}/progress")
async def save_user_progress(
    flashcard_id: str,
    progress_data: Dict[str, Any],
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
):
    """
    Save user's learning progress for a specific flashcard set.

    Expected payload:
    {
        "cards": {
            "card_id": {"box": 1, "last_reviewed": "ISO_TIMESTAMP", "review_count": 1}
        },
        "session_summary": {
            "completed_at": "ISO_TIMESTAMP",
            "cards_reviewed": 15,
            "box_distribution": {"box1": 8, "box2": 4, "box3": 3}
        }
    }

    Requires authentication.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    logger.info("Saving user progress",
                user_id=user.user_id,
                flashcard_id=flashcard_id,
                cards_count=len(progress_data.get("cards", {})))

    # Validate box values
    if "cards" in progress_data:
        for card_id, card_data in progress_data["cards"].items():
            box_value = card_data.get("box")
            if box_value not in [1, 2, 3]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid box value for card {card_id}: {box_value}. Must be 1, 2, or 3."
                )

    success = await progress_storage.save_user_progress(user.user_id, flashcard_id, progress_data)

    if success:
        return {
            "success": True,
            "message": "Progress saved successfully"
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to save progress")


@api_router.delete("/flashcards/{flashcard_id}/progress")
async def delete_user_progress(
    flashcard_id: str,
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
):
    """
    Delete user's learning progress for a specific flashcard set.

    This resets all box assignments and session history.
    Requires authentication.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    logger.info("Deleting user progress",
                user_id=user.user_id,
                flashcard_id=flashcard_id)

    success = await progress_storage.delete_user_progress(user.user_id, flashcard_id)

    if success:
        return {
            "success": True,
            "message": "Progress deleted successfully"
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to delete progress")


@api_router.get("/users/me/learning-report")
async def get_learning_report(
    user: AuthenticatedUser = Depends(get_current_user),
    flashcard_id: Optional[str] = Query(None, description="Optional filter for specific flashcard set"),
    days: int = Query(30, description="Number of days to include in report (default 30)")
):
    """
    Generate learning report for the authenticated user.

    Returns aggregated statistics and session history for the specified time period.

    Query parameters:
    - flashcard_id: Optional - filter for a specific flashcard set
    - days: Number of days to include (default 30)

    Requires authentication.
    """
    from datetime import timedelta
    from .database import get_db_pool

    logger.info("Generating learning report",
                user_id=user.user_id,
                flashcard_id=flashcard_id,
                days=days)

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Calculate date range
            cutoff_date = datetime.now() - timedelta(days=days)

            # Build query with optional flashcard filter
            if flashcard_id:
                query = """
                    SELECT id, flashcard_id, flashcard_title, started_at, completed_at,
                           cards_reviewed, box1_count, box2_count, box3_count, duration_seconds,
                           average_time_to_flip_seconds
                    FROM quiz_sessions
                    WHERE user_id = $1 AND flashcard_id = $2 AND completed_at >= $3
                    ORDER BY completed_at DESC
                """
                sessions = await conn.fetch(query, user.user_id, flashcard_id, cutoff_date)
            else:
                query = """
                    SELECT id, flashcard_id, flashcard_title, started_at, completed_at,
                           cards_reviewed, box1_count, box2_count, box3_count, duration_seconds,
                           average_time_to_flip_seconds
                    FROM quiz_sessions
                    WHERE user_id = $1 AND completed_at >= $2
                    ORDER BY completed_at DESC
                """
                sessions = await conn.fetch(query, user.user_id, cutoff_date)

            # Calculate aggregate statistics
            total_sessions = len(sessions)
            total_cards_reviewed = sum(row['cards_reviewed'] for row in sessions)
            total_box1 = sum(row['box1_count'] for row in sessions)
            total_box2 = sum(row['box2_count'] for row in sessions)
            total_box3 = sum(row['box3_count'] for row in sessions)
            total_duration = sum(row['duration_seconds'] or 0 for row in sessions)

            # Calculate average time-to-flip across all sessions
            flip_times = [row['average_time_to_flip_seconds'] for row in sessions if row['average_time_to_flip_seconds'] is not None]
            average_time_to_flip = sum(flip_times) / len(flip_times) if flip_times else None

            # Format session details
            session_details = [
                {
                    "id": row['id'],
                    "flashcard_id": row['flashcard_id'],
                    "flashcard_title": row['flashcard_title'],
                    "started_at": row['started_at'].isoformat(),
                    "completed_at": row['completed_at'].isoformat(),
                    "cards_reviewed": row['cards_reviewed'],
                    "box1_count": row['box1_count'],
                    "box2_count": row['box2_count'],
                    "box3_count": row['box3_count'],
                    "duration_seconds": row['duration_seconds'],
                    "average_time_to_flip_seconds": row['average_time_to_flip_seconds']
                }
                for row in sessions
            ]

            logger.info("Learning report generated successfully",
                       user_id=user.user_id,
                       total_sessions=total_sessions,
                       total_cards_reviewed=total_cards_reviewed)

            return {
                "user_id": user.user_id,
                "report_period_days": days,
                "flashcard_filter": flashcard_id,
                "summary": {
                    "total_sessions": total_sessions,
                    "total_cards_reviewed": total_cards_reviewed,
                    "total_learned": total_box1,
                    "total_uncertain": total_box2,
                    "total_not_learned": total_box3,
                    "total_duration_seconds": total_duration,
                    "average_session_duration": total_duration / total_sessions if total_sessions > 0 else 0,
                    "average_time_to_flip_seconds": average_time_to_flip
                },
                "sessions": session_details
            }

    except Exception as e:
        logger.error("Error generating learning report",
                    user_id=user.user_id,
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate learning report: {str(e)}"
        )


@api_router.get("/users/me/quiz-history-pdf")
async def get_quiz_history_pdf(
    user: AuthenticatedUser = Depends(get_current_user),
    days: int = Query(30, description="Number of days to include in report (default 30)")
):
    """
    Generate and download a PDF report of quiz session history.

    Returns a PDF file with:
    - Summary statistics (total sessions, cards reviewed, box distribution)
    - Detailed session history table
    - Performance metrics

    Query parameters:
    - days: Number of days to include (default 30)

    Requires authentication.
    """
    from datetime import timedelta
    from .database import get_db_pool
    from .quiz_history_pdf_generator import generate_quiz_history_pdf

    logger.info("Generating quiz history PDF",
                user_id=user.user_id,
                days=days)

    pool = await get_db_pool()

    try:
        # Get user information from authentication token
        user_email = user.email or 'Unknown'
        # Check metadata for username
        user_name = None
        if user.metadata:
            user_name = user.metadata.get('username') or user.metadata.get('name')

        async with pool.acquire() as conn:
            # Calculate date range
            cutoff_date = datetime.now() - timedelta(days=days)

            # Get all sessions for user
            query = """
                SELECT id, flashcard_id, flashcard_title, started_at, completed_at,
                       cards_reviewed, box1_count, box2_count, box3_count, duration_seconds,
                       average_time_to_flip_seconds
                FROM quiz_sessions
                WHERE user_id = $1 AND completed_at >= $2
                ORDER BY completed_at DESC
            """
            sessions = await conn.fetch(query, user.user_id, cutoff_date)

            # Calculate aggregate statistics
            total_sessions = len(sessions)
            total_cards_reviewed = sum(row['cards_reviewed'] for row in sessions)
            total_box1 = sum(row['box1_count'] for row in sessions)
            total_box2 = sum(row['box2_count'] for row in sessions)
            total_box3 = sum(row['box3_count'] for row in sessions)
            total_duration = sum(row['duration_seconds'] or 0 for row in sessions)

            # Calculate average time-to-flip across all sessions
            flip_times = [row['average_time_to_flip_seconds'] for row in sessions if row['average_time_to_flip_seconds'] is not None]
            average_time_to_flip = sum(flip_times) / len(flip_times) if flip_times else None

            # Format session details
            session_details = [
                {
                    "id": row['id'],
                    "flashcard_id": row['flashcard_id'],
                    "flashcard_title": row['flashcard_title'],
                    "started_at": row['started_at'].isoformat() if row['started_at'] else None,
                    "completed_at": row['completed_at'].isoformat() if row['completed_at'] else None,
                    "cards_reviewed": row['cards_reviewed'],
                    "box1_count": row['box1_count'],
                    "box2_count": row['box2_count'],
                    "box3_count": row['box3_count'],
                    "duration_seconds": row['duration_seconds'],
                    "average_time_to_flip_seconds": row['average_time_to_flip_seconds']
                }
                for row in sessions
            ]

            # Build report data structure
            report_data = {
                "user_id": user.user_id,
                "user_email": user_email,
                "user_name": user_name,
                "days": days,
                "summary": {
                    "total_sessions": total_sessions,
                    "total_cards_reviewed": total_cards_reviewed,
                    "total_box1": total_box1,
                    "total_box2": total_box2,
                    "total_box3": total_box3,
                    "total_duration": total_duration,
                    "average_session_duration": total_duration / total_sessions if total_sessions > 0 else 0,
                    "average_time_to_flip_seconds": average_time_to_flip
                },
                "sessions": session_details
            }

            # Generate PDF
            pdf_buffer = generate_quiz_history_pdf(report_data, user_email)

            logger.info("Quiz history PDF generated successfully",
                       user_id=user.user_id,
                       total_sessions=total_sessions)

            # Create filename
            from datetime import date
            today = date.today().isoformat()
            filename = f"quiz-history-{today}.pdf"

            # Return PDF as downloadable file
            from fastapi.responses import StreamingResponse

            return StreamingResponse(
                pdf_buffer,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )

    except Exception as e:
        logger.error("Error generating quiz history PDF",
                    user_id=user.user_id,
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate PDF report: {str(e)}"
        )


# ============================================================================
# User Management Endpoints (Admin only)
# ============================================================================

@api_router.get("/admin/users")
async def list_users(
    admin: AuthenticatedUser = Depends(get_current_admin),
    limit: int = Query(100, description="Maximum number of users to return"),
    offset: int = Query(0, description="Number of users to skip")
):
    """List all users with their admin status (Admin only)."""
    logger.info("Admin listing users", admin_user=admin.email, limit=limit, offset=offset)

    from .database import get_db_pool
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Get total count
            total = await conn.fetchval("SELECT COUNT(*) FROM user_profiles")

            # Get paginated users - JOIN with auth.users to get actual creation dates
            users = await conn.fetch(
                """
                SELECT
                    up.id,
                    up.email,
                    up.display_name,
                    up.is_admin,
                    au.created_at,
                    au.last_sign_in_at,
                    au.updated_at
                FROM user_profiles up
                LEFT JOIN auth.users au ON up.id = au.id
                ORDER BY au.created_at DESC NULLS LAST
                LIMIT $1 OFFSET $2
                """,
                limit, offset
            )

            user_list = [
                {
                    "id": str(row['id']),
                    "email": row['email'],
                    "display_name": row['display_name'],
                    "is_admin": row['is_admin'],
                    "created_at": row['created_at'].isoformat() if row['created_at'] else None,
                    "last_sign_in_at": row['last_sign_in_at'].isoformat() if row['last_sign_in_at'] else None,
                    "updated_at": row['updated_at'].isoformat() if row['updated_at'] else None
                }
                for row in users
            ]

            logger.info(
                "Users listed successfully",
                admin_user=admin.email,
                total=total,
                returned=len(user_list)
            )

            return {
                "users": user_list,
                "total": total,
                "limit": limit,
                "offset": offset
            }

    except Exception as e:
        logger.error("Error listing users", admin_user=admin.email, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list users: {str(e)}"
        )


@api_router.put("/admin/users/{user_id}/admin-status")
async def update_admin_status(
    user_id: str,
    is_admin: bool = Query(..., description="Set admin status"),
    admin: AuthenticatedUser = Depends(get_current_admin)
):
    """Grant or revoke admin privileges for a user (Admin only)."""
    logger.info(
        "Admin updating admin status",
        admin_user=admin.email,
        target_user_id=user_id,
        new_status=is_admin
    )

    # Prevent self-revocation
    if user_id == admin.user_id and not is_admin:
        logger.warning("Admin attempted self-revocation", admin_user=admin.email)
        raise HTTPException(
            status_code=400,
            detail="Cannot revoke your own admin privileges"
        )

    from .database import get_db_pool
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Verify user exists
            user = await conn.fetchrow(
                "SELECT email FROM user_profiles WHERE id = $1",
                user_id
            )

            if not user:
                raise HTTPException(
                    status_code=404,
                    detail=f"User {user_id} not found"
                )

            # Update admin status
            await conn.execute(
                """
                UPDATE user_profiles
                SET is_admin = $1, updated_at = NOW()
                WHERE id = $2
                """,
                is_admin, user_id
            )

            action = "granted" if is_admin else "revoked"
            logger.info(
                f"Admin privileges {action}",
                admin_user=admin.email,
                target_user_email=user['email'],
                target_user_id=user_id
            )

            return {
                "success": True,
                "message": f"Admin privileges {action} for {user['email']}",
                "user_id": user_id,
                "is_admin": is_admin
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error updating admin status",
            admin_user=admin.email,
            target_user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update admin status: {str(e)}"
        )


@api_router.put("/admin/users/{user_id}/display-name")
async def update_user_display_name(
    user_id: str,
    display_name: str = Query(..., description="New display name", min_length=1, max_length=100),
    admin: AuthenticatedUser = Depends(get_current_admin)
):
    """Update a user's display name (Admin only)."""
    logger.info(
        "Admin updating user display name",
        admin_user=admin.email,
        target_user_id=user_id
    )

    try:
        async with get_db_connection() as conn:
            # Check if user exists
            user = await conn.fetchrow(
                "SELECT id, email, display_name FROM user_profiles WHERE id = $1",
                user_id
            )

            if not user:
                raise HTTPException(
                    status_code=404,
                    detail="User not found"
                )

            # Update display name
            await conn.execute(
                """
                UPDATE user_profiles
                SET display_name = $1, updated_at = NOW()
                WHERE id = $2
                """,
                display_name, user_id
            )

            logger.info(
                f"Display name updated",
                admin_user=admin.email,
                target_user_email=user['email'],
                target_user_id=user_id,
                new_display_name=display_name
            )

            return {
                "success": True,
                "message": f"Display name updated for {user['email']}",
                "user_id": user_id,
                "display_name": display_name
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error updating display name",
            admin_user=admin.email,
            target_user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update display name: {str(e)}"
        )


@api_router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: AuthenticatedUser = Depends(get_current_admin)
):
    """Delete a user and all associated data (Admin only)."""
    logger.info(
        "Admin deleting user",
        admin_user=admin.email,
        target_user_id=user_id
    )

    # Prevent self-deletion
    if user_id == admin.user_id:
        logger.warning("Admin attempted self-deletion", admin_user=admin.email)
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account"
        )

    from .database import get_db_pool
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Verify user exists and get email
            user = await conn.fetchrow(
                "SELECT email, is_admin FROM user_profiles WHERE id = $1",
                user_id
            )

            if not user:
                raise HTTPException(
                    status_code=404,
                    detail=f"User {user_id} not found"
                )

            # Prevent deletion of built-in admin user
            if user['email'] in ['ommiadmin@example.com', 'ommiadmin@ommiquiz.de']:
                logger.warning(
                    "Attempted to delete built-in admin",
                    admin_user=admin.email,
                    target_user=user['email']
                )
                raise HTTPException(
                    status_code=403,
                    detail="Cannot delete the built-in admin user"
                )

            # Delete user and all associated data in a transaction
            async with conn.transaction():
                # Delete quiz sessions
                await conn.execute(
                    "DELETE FROM quiz_sessions WHERE user_id = $1",
                    user_id
                )

                # Delete learning progress
                await conn.execute(
                    "DELETE FROM flashcard_progress WHERE user_id = $1",
                    user_id
                )

                # Delete user profile
                await conn.execute(
                    "DELETE FROM user_profiles WHERE id = $1",
                    user_id
                )

            logger.info(
                "User deleted successfully",
                admin_user=admin.email,
                deleted_user_email=user['email'],
                deleted_user_id=user_id
            )

            return {
                "success": True,
                "message": f"User {user['email']} deleted successfully",
                "user_id": user_id
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error deleting user",
            admin_user=admin.email,
            target_user_id=user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user: {str(e)}"
        )


@api_router.get("/admin/login-history")
async def get_login_history(
    admin: AuthenticatedUser = Depends(get_current_admin),
    days: int = Query(30, description="Number of days to include in report (default 30)"),
    limit: int = Query(100, description="Maximum number of entries to return (default 100)")
):
    """Get user login history from custom login_history table (Admin only)."""
    from datetime import timedelta
    from .database import get_db_pool

    logger.info("Admin fetching login history", admin_user=admin.email, days=days, limit=limit)

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

            # Query custom login_history table
            query = """
                SELECT
                    lh.id as log_id,
                    lh.user_id,
                    lh.email,
                    lh.login_time,
                    lh.success,
                    lh.ip_address,
                    lh.user_agent,
                    lh.error_message,
                    up.display_name,
                    up.is_admin
                FROM public.login_history lh
                LEFT JOIN public.user_profiles up ON lh.user_id = up.id
                WHERE lh.login_time >= $1
                ORDER BY lh.login_time DESC
                LIMIT $2
            """

            rows = await conn.fetch(query, cutoff_date, limit)

            history = []
            for row in rows:
                # Determine login type based on success status
                if row['success']:
                    login_type = "success"
                else:
                    login_type = "failed"

                history.append({
                    "log_id": str(row['log_id']),
                    "timestamp": row['login_time'].isoformat() if row['login_time'] else None,
                    "user_id": str(row['user_id']) if row['user_id'] else None,
                    "email": row['email'],
                    "display_name": row['display_name'],
                    "is_admin": row['is_admin'] if row['is_admin'] is not None else False,
                    "ip_address": row['ip_address'],
                    "action": "login",
                    "success": row['success'],
                    "login_type": login_type,
                    "error_message": row['error_message']
                })

            logger.info(
                "Login history retrieved",
                admin_user=admin.email,
                total_attempts=len(history),
                days=days
            )

            return {
                "period_days": days,
                "total_attempts": len(history),
                "history": history
            }

    except Exception as e:
        logger.error("Error fetching login history", error=str(e), admin_user=admin.email)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch login history: {str(e)}"
        )


@api_router.get("/admin/user-activity-stats")
async def get_user_activity_stats(
    admin: AuthenticatedUser = Depends(get_current_admin),
    days: int = Query(30, description="Number of days to include in report (default 30)")
):
    """Get daily active user statistics for charting (Admin only)."""
    from datetime import timedelta, date
    from .database import get_db_pool

    logger.info("Admin fetching user activity stats", admin_user=admin.email, days=days)

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            start_date = datetime.now() - timedelta(days=days - 1)

            # Get daily active users (users with at least one quiz session on that day)
            query = """
                WITH date_series AS (
                    SELECT generate_series(
                        DATE($1),
                        DATE($2),
                        interval '1 day'
                    )::date as day
                ),
                daily_users AS (
                    SELECT
                        DATE(qs.completed_at) as activity_date,
                        COUNT(DISTINCT qs.user_id) as active_users
                    FROM quiz_sessions qs
                    WHERE qs.completed_at >= $1
                        AND qs.completed_at <= $2
                    GROUP BY DATE(qs.completed_at)
                )
                SELECT
                    ds.day,
                    COALESCE(du.active_users, 0) as active_users
                FROM date_series ds
                LEFT JOIN daily_users du ON ds.day = du.activity_date
                ORDER BY ds.day ASC
            """

            end_date = datetime.now()
            rows = await conn.fetch(query, start_date, end_date)

            daily_stats = [
                {
                    "date": row["day"].isoformat(),
                    "active_users": row["active_users"]
                }
                for row in rows
            ]

            # Calculate summary statistics
            total_active_users = sum(day["active_users"] for day in daily_stats)
            avg_active_users = total_active_users / len(daily_stats) if daily_stats else 0
            max_active_users = max((day["active_users"] for day in daily_stats), default=0)
            days_with_activity = sum(1 for day in daily_stats if day["active_users"] > 0)

            return {
                "period_days": days,
                "daily_stats": daily_stats,
                "summary": {
                    "total_active_users": total_active_users,
                    "avg_active_users": round(avg_active_users, 2),
                    "max_active_users": max_active_users,
                    "days_with_activity": days_with_activity
                }
            }

    except Exception as e:
        logger.error("Error fetching user activity stats", error=str(e), admin_user=admin.email)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch user activity stats: {str(e)}"
        )


@api_router.post("/flashcards/{flashcard_id}/cards/{card_id}/rating")
async def submit_card_rating(
    flashcard_id: str,
    card_id: str,
    rating: int = Query(..., ge=1, le=5, description="Rating from 1 to 5 stars"),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Submit or update a rating for a specific card."""
    from .database import get_db_pool

    logger.info(
        "User submitting card rating",
        user_id=user.user_id,
        flashcard_id=flashcard_id,
        card_id=card_id,
        rating=rating
    )

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Insert or update rating using ON CONFLICT
            result = await conn.fetchrow(
                """
                INSERT INTO card_ratings (user_id, flashcard_id, card_id, rating)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, flashcard_id, card_id)
                DO UPDATE SET rating = $4, updated_at = NOW()
                RETURNING id, rating, created_at, updated_at
                """,
                user.user_id,
                flashcard_id,
                card_id,
                rating
            )

            return {
                "success": True,
                "rating": {
                    "id": result["id"],
                    "flashcard_id": flashcard_id,
                    "card_id": card_id,
                    "rating": result["rating"],
                    "created_at": result["created_at"].isoformat(),
                    "updated_at": result["updated_at"].isoformat()
                }
            }

    except Exception as e:
        logger.error(
            "Error submitting card rating",
            error=str(e),
            user_id=user.user_id,
            flashcard_id=flashcard_id,
            card_id=card_id
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit rating: {str(e)}"
        )


@api_router.get("/flashcards/{flashcard_id}/ratings")
async def get_flashcard_ratings(
    flashcard_id: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Get user's ratings for a specific flashcard set."""
    from .database import get_db_pool

    logger.info(
        "User fetching flashcard ratings",
        user_id=user.user_id,
        flashcard_id=flashcard_id
    )

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT card_id, rating, created_at, updated_at
                FROM card_ratings
                WHERE user_id = $1 AND flashcard_id = $2
                ORDER BY updated_at DESC
                """,
                user.user_id,
                flashcard_id
            )

            ratings = {
                row["card_id"]: {
                    "rating": row["rating"],
                    "created_at": row["created_at"].isoformat(),
                    "updated_at": row["updated_at"].isoformat()
                }
                for row in rows
            }

            return {
                "flashcard_id": flashcard_id,
                "ratings": ratings,
                "total_rated": len(ratings)
            }

    except Exception as e:
        logger.error(
            "Error fetching flashcard ratings",
            error=str(e),
            user_id=user.user_id,
            flashcard_id=flashcard_id
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch ratings: {str(e)}"
        )


@api_router.get("/admin/flashcard-ratings-stats")
async def get_flashcard_ratings_stats(
    admin: AuthenticatedUser = Depends(get_current_admin)
):
    """Get rating statistics for all flashcards (Admin only)."""
    from .database import get_db_pool

    logger.info("Admin fetching flashcard rating statistics", admin_user=admin.email)

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    flashcard_id,
                    COUNT(*) as total_ratings,
                    ROUND(AVG(rating)::numeric, 2) as average_rating,
                    MIN(rating) as min_rating,
                    MAX(rating) as max_rating,
                    COUNT(DISTINCT user_id) as unique_users
                FROM card_ratings
                GROUP BY flashcard_id
                ORDER BY average_rating DESC, total_ratings DESC
                """
            )

            stats = [
                {
                    "flashcard_id": row["flashcard_id"],
                    "total_ratings": row["total_ratings"],
                    "average_rating": float(row["average_rating"]) if row["average_rating"] else 0,
                    "min_rating": row["min_rating"],
                    "max_rating": row["max_rating"],
                    "unique_users": row["unique_users"]
                }
                for row in rows
            ]

            return {
                "total_flashcards_rated": len(stats),
                "statistics": stats
            }

    except Exception as e:
        logger.error("Error fetching flashcard rating stats", error=str(e), admin_user=admin.email)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch rating statistics: {str(e)}"
        )


@api_router.get("/users/me")
async def get_current_user_profile(
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Get current user's profile including admin status."""
    logger.info("User fetching own profile", user_id=user.user_id, email=user.email)

    from .database import get_db_pool
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            profile = await conn.fetchrow(
                """
                SELECT id, email, display_name, is_admin, created_at, updated_at
                FROM user_profiles
                WHERE id = $1
                """,
                user.user_id
            )

            if not profile:
                # Create profile if it doesn't exist (for legacy users)
                # Extract display_name from user metadata if available
                user_metadata = user.metadata.get('user_metadata', {}) if user.metadata else {}
                display_name = user_metadata.get('display_name') or user_metadata.get('username')

                logger.info(
                    "Creating profile for legacy user",
                    user_id=user.user_id,
                    email=user.email,
                    display_name=display_name
                )
                await conn.execute(
                    """
                    INSERT INTO user_profiles (id, email, display_name, is_admin, created_at, updated_at)
                    VALUES ($1, $2, $3, FALSE, NOW(), NOW())
                    ON CONFLICT (id) DO NOTHING
                    """,
                    user.user_id, user.email, display_name
                )

                # Fetch again
                profile = await conn.fetchrow(
                    """
                    SELECT id, email, display_name, is_admin, created_at, updated_at
                    FROM user_profiles
                    WHERE id = $1
                    """,
                    user.user_id
                )

            return {
                "id": str(profile['id']),
                "email": profile['email'],
                "display_name": profile['display_name'],
                "is_admin": profile['is_admin'],
                "created_at": profile['created_at'].isoformat() if profile['created_at'] else None,
                "updated_at": profile['updated_at'].isoformat() if profile['updated_at'] else None
            }

    except Exception as e:
        logger.error(
            "Error fetching user profile",
            user_id=user.user_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch user profile: {str(e)}"
        )


class LoginLogRequest(BaseModel):
    email: str
    success: bool
    error_message: Optional[str] = None


@api_router.post("/auth/log-login")
async def log_login_attempt(
    request: Request,
    payload: LoginLogRequest,
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
):
    """
    Log a login attempt to the login_history table.
    Called by frontend after authentication attempt (success or failure).
    """
    from .database import get_db_pool

    # Get client IP address
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # Get user_id if authenticated
    user_id = user.user_id if user and payload.success else None

    logger.info(
        "Logging login attempt",
        email=payload.email,
        success=payload.success,
        user_id=user_id,
        ip_address=ip_address
    )

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO public.login_history
                (user_id, email, login_time, success, ip_address, user_agent, error_message)
                VALUES ($1, $2, NOW(), $3, $4, $5, $6)
                """,
                user_id, payload.email, payload.success, ip_address, user_agent, payload.error_message
            )

        return {
            "success": True,
            "message": "Login attempt logged successfully"
        }

    except Exception as e:
        logger.error(
            "Error logging login attempt",
            email=payload.email,
            error=str(e)
        )
        # Don't fail the login if logging fails
        return {
            "success": False,
            "message": f"Failed to log login attempt: {str(e)}"
        }


# ============================================================================
# Favorites Endpoints
# ============================================================================

@api_router.get("/users/me/favorites")
async def get_user_favorites(
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Get list of user's favorite flashcard sets."""
    from .database import get_db_pool

    logger.info("Fetching user favorites", user_id=user.user_id)

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT flashcard_id, created_at FROM flashcard_favorites WHERE user_id = $1 ORDER BY created_at DESC",
                user.user_id
            )

        favorites = [{"flashcard_id": r["flashcard_id"], "created_at": r["created_at"].isoformat()} for r in rows]

        logger.info("Fetched user favorites", user_id=user.user_id, count=len(favorites))

        return {
            "favorites": favorites,
            "count": len(favorites)
        }
    except Exception as e:
        logger.error("Error fetching favorites", user_id=user.user_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch favorites: {str(e)}"
        )


class AddFavoriteRequest(BaseModel):
    flashcard_id: str


class CreateUserFlashcardRequest(BaseModel):
    """Request model for creating a user flashcard."""
    yaml_content: str
    visibility: str = "private"  # 'global' or 'private'


class UpdateUserFlashcardRequest(BaseModel):
    """Request model for updating a user flashcard."""
    yaml_content: str
    visibility: Optional[str] = None


class UpdateVisibilityRequest(BaseModel):
    """Request model for updating flashcard visibility."""
    visibility: str  # 'global' or 'private'


@api_router.post("/users/me/favorites")
async def add_favorite(
    request: AddFavoriteRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Add flashcard set to favorites."""
    from .database import get_db_pool

    logger.info("Adding favorite", user_id=user.user_id, flashcard_id=request.flashcard_id)

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchrow(
                """INSERT INTO flashcard_favorites (user_id, flashcard_id)
                   VALUES ($1, $2)
                   ON CONFLICT (user_id, flashcard_id) DO NOTHING
                   RETURNING id, flashcard_id, created_at""",
                user.user_id, request.flashcard_id
            )

            if result:
                logger.info("Favorite added", user_id=user.user_id, flashcard_id=request.flashcard_id)
                message = "Favorite added"
            else:
                logger.info("Favorite already exists", user_id=user.user_id, flashcard_id=request.flashcard_id)
                message = "Already favorited"

            return {
                "success": True,
                "message": message,
                "flashcard_id": request.flashcard_id
            }
    except Exception as e:
        logger.error("Error adding favorite", user_id=user.user_id, flashcard_id=request.flashcard_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add favorite: {str(e)}"
        )


@api_router.delete("/users/me/favorites/{flashcard_id}")
async def remove_favorite(
    flashcard_id: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Remove flashcard set from favorites."""
    from .database import get_db_pool

    logger.info("Removing favorite", user_id=user.user_id, flashcard_id=flashcard_id)

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM flashcard_favorites WHERE user_id = $1 AND flashcard_id = $2",
                user.user_id, flashcard_id
            )

        logger.info("Favorite removed", user_id=user.user_id, flashcard_id=flashcard_id)

        return {
            "success": True,
            "message": "Favorite removed"
        }
    except Exception as e:
        logger.error("Error removing favorite", user_id=user.user_id, flashcard_id=flashcard_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove favorite: {str(e)}"
        )


# ===== User Flashcards Endpoints =====

@api_router.post("/users/me/flashcards")
async def create_user_flashcard(
    request: CreateUserFlashcardRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Create a new user flashcard."""
    from .database import get_db_pool
    from .storage import generate_user_flashcard_id

    logger.info("Creating user flashcard", user_id=user.user_id, visibility=request.visibility)

    # Validate visibility
    if request.visibility not in ("global", "private"):
        raise HTTPException(status_code=400, detail="Visibility must be 'global' or 'private'")

    try:
        # Parse YAML to extract metadata
        flashcard_data = yaml.safe_load(request.yaml_content)
        if not flashcard_data or not isinstance(flashcard_data, dict):
            raise HTTPException(status_code=400, detail="Invalid YAML content")

        # Extract metadata
        title = flashcard_data.get("title", "Untitled")
        description = flashcard_data.get("description")
        author = flashcard_data.get("author", user.email or "Unknown")
        language = flashcard_data.get("language", "de")
        module = flashcard_data.get("module")
        topics = flashcard_data.get("topics", [])
        keywords = flashcard_data.get("keywords", [])
        cards = flashcard_data.get("flashcards", [])
        card_count = len(cards) if isinstance(cards, list) else 0

        # Generate flashcard ID from title or use provided ID
        if "id" in flashcard_data:
            slug = flashcard_data["id"]
        else:
            # Create slug from title
            slug = re.sub(r'[^a-z0-9_-]', '_', title.lower().replace(' ', '_'))
            slug = re.sub(r'_+', '_', slug).strip('_')

        flashcard_id = generate_user_flashcard_id(user.user_id, slug)
        filename = f"{flashcard_id}.yaml"

        # Check if flashcard already exists
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                "SELECT flashcard_id FROM user_flashcards WHERE flashcard_id = $1",
                flashcard_id
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Flashcard with ID '{flashcard_id}' already exists"
                )

        # Save to storage
        storage_type = os.getenv("FLASHCARDS_STORAGE", "local").lower()
        try:
            document = storage.save_user_flashcard(user.user_id, filename, request.yaml_content)
            storage_path = storage.get_user_flashcard_path(user.user_id, flashcard_id)
        except FileExistsError:
            raise HTTPException(status_code=409, detail="Flashcard file already exists")
        except Exception as e:
            logger.error("Failed to save user flashcard to storage", error=str(e))
            raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")

        # Save metadata to database
        async with pool.acquire() as conn:
            result = await conn.fetchrow(
                """INSERT INTO user_flashcards (
                    flashcard_id, owner_id, visibility, title, description, author,
                    language, module, topics, keywords, card_count,
                    storage_type, storage_path, filename
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id, flashcard_id, created_at""",
                flashcard_id, user.user_id, request.visibility, title, description, author,
                language, module, topics, keywords, card_count,
                storage_type, storage_path, filename
            )

        logger.info("User flashcard created", flashcard_id=flashcard_id, user_id=user.user_id)

        return {
            "success": True,
            "flashcard_id": flashcard_id,
            "message": "Flashcard created successfully",
            "created_at": result["created_at"].isoformat() if result["created_at"] else None
        }

    except HTTPException:
        raise
    except yaml.YAMLError as e:
        logger.error("Invalid YAML content", error=str(e))
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
    except Exception as e:
        logger.error("Failed to create user flashcard", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to create flashcard: {str(e)}")


@api_router.get("/users/me/flashcards")
async def list_user_flashcards(
    user: AuthenticatedUser = Depends(get_current_user)
):
    """List all flashcards owned by the current user."""
    from .database import get_db_pool

    logger.info("Listing user flashcards", user_id=user.user_id)

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT flashcard_id, title, description, visibility, card_count,
                          language, module, topics, keywords, created_at, updated_at
                   FROM user_flashcards
                   WHERE owner_id = $1
                   ORDER BY created_at DESC""",
                user.user_id
            )

        flashcards = [
            {
                "flashcard_id": row["flashcard_id"],
                "title": row["title"],
                "description": row["description"],
                "visibility": row["visibility"],
                "card_count": row["card_count"],
                "language": row["language"],
                "module": row["module"],
                "topics": row["topics"] or [],
                "keywords": row["keywords"] or [],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
            for row in rows
        ]

        logger.info("User flashcards listed", user_id=user.user_id, count=len(flashcards))

        return {
            "success": True,
            "flashcards": flashcards,
            "total": len(flashcards)
        }

    except Exception as e:
        logger.error("Failed to list user flashcards", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to list flashcards: {str(e)}")


@api_router.put("/users/me/flashcards/{flashcard_id}")
async def update_user_flashcard(
    flashcard_id: str,
    request: UpdateUserFlashcardRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Update a user flashcard."""
    from .database import get_db_pool
    from .storage import is_user_flashcard

    logger.info("Updating user flashcard", flashcard_id=flashcard_id, user_id=user.user_id)

    # Verify it's a user flashcard
    if not is_user_flashcard(flashcard_id):
        raise HTTPException(status_code=400, detail="Not a user-generated flashcard")

    try:
        # Check ownership
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            flashcard_row = await conn.fetchrow(
                "SELECT owner_id, filename FROM user_flashcards WHERE flashcard_id = $1",
                flashcard_id
            )

            if not flashcard_row:
                raise HTTPException(status_code=404, detail="Flashcard not found")

            if flashcard_row["owner_id"] != user.user_id and not user.is_admin:
                raise HTTPException(status_code=403, detail="Not authorized to update this flashcard")

        # Parse YAML to extract updated metadata
        flashcard_data = yaml.safe_load(request.yaml_content)
        if not flashcard_data or not isinstance(flashcard_data, dict):
            raise HTTPException(status_code=400, detail="Invalid YAML content")

        # Extract metadata
        title = flashcard_data.get("title", "Untitled")
        description = flashcard_data.get("description")
        author = flashcard_data.get("author")
        language = flashcard_data.get("language", "de")
        module = flashcard_data.get("module")
        topics = flashcard_data.get("topics", [])
        keywords = flashcard_data.get("keywords", [])
        cards = flashcard_data.get("flashcards", [])
        card_count = len(cards) if isinstance(cards, list) else 0

        # Update storage
        filename = flashcard_row["filename"]
        storage.save_user_flashcard(flashcard_row["owner_id"], filename, request.yaml_content, overwrite=True)

        # Update database metadata
        update_fields = {
            "title": title,
            "description": description,
            "author": author,
            "language": language,
            "module": module,
            "topics": topics,
            "keywords": keywords,
            "card_count": card_count,
        }

        if request.visibility:
            if request.visibility not in ("global", "private"):
                raise HTTPException(status_code=400, detail="Visibility must be 'global' or 'private'")
            update_fields["visibility"] = request.visibility

        # Build UPDATE query
        set_clause = ", ".join([f"{k} = ${i+2}" for i, k in enumerate(update_fields.keys())])
        query = f"UPDATE user_flashcards SET {set_clause} WHERE flashcard_id = $1"
        params = [flashcard_id] + list(update_fields.values())

        async with pool.acquire() as conn:
            await conn.execute(query, *params)

        logger.info("User flashcard updated", flashcard_id=flashcard_id, user_id=user.user_id)

        return {
            "success": True,
            "message": "Flashcard updated successfully"
        }

    except HTTPException:
        raise
    except yaml.YAMLError as e:
        logger.error("Invalid YAML content", error=str(e))
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
    except Exception as e:
        logger.error("Failed to update user flashcard", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to update flashcard: {str(e)}")


@api_router.delete("/users/me/flashcards/{flashcard_id}")
async def delete_user_flashcard(
    flashcard_id: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Delete a user flashcard."""
    from .database import get_db_pool
    from .storage import is_user_flashcard

    logger.info("Deleting user flashcard", flashcard_id=flashcard_id, user_id=user.user_id)

    # Verify it's a user flashcard
    if not is_user_flashcard(flashcard_id):
        raise HTTPException(status_code=400, detail="Not a user-generated flashcard")

    try:
        # Check ownership
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            flashcard_row = await conn.fetchrow(
                "SELECT owner_id FROM user_flashcards WHERE flashcard_id = $1",
                flashcard_id
            )

            if not flashcard_row:
                raise HTTPException(status_code=404, detail="Flashcard not found")

            if flashcard_row["owner_id"] != user.user_id and not user.is_admin:
                raise HTTPException(status_code=403, detail="Not authorized to delete this flashcard")

        # Delete from storage
        deleted_files = storage.delete_user_flashcard(flashcard_row["owner_id"], flashcard_id)

        # Delete from database
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM user_flashcards WHERE flashcard_id = $1",
                flashcard_id
            )

        logger.info("User flashcard deleted", flashcard_id=flashcard_id, user_id=user.user_id, deleted_files=deleted_files)

        return {
            "success": True,
            "message": "Flashcard deleted successfully",
            "deleted_files": deleted_files
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete user flashcard", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to delete flashcard: {str(e)}")


@api_router.patch("/users/me/flashcards/{flashcard_id}/visibility")
async def update_flashcard_visibility(
    flashcard_id: str,
    request: UpdateVisibilityRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Toggle flashcard visibility between global and private."""
    from .database import get_db_pool
    from .storage import is_user_flashcard

    logger.info("Updating flashcard visibility", flashcard_id=flashcard_id, visibility=request.visibility, user_id=user.user_id)

    # Verify it's a user flashcard
    if not is_user_flashcard(flashcard_id):
        raise HTTPException(status_code=400, detail="Not a user-generated flashcard")

    # Validate visibility
    if request.visibility not in ("global", "private"):
        raise HTTPException(status_code=400, detail="Visibility must be 'global' or 'private'")

    try:
        # Check ownership
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            flashcard_row = await conn.fetchrow(
                "SELECT owner_id FROM user_flashcards WHERE flashcard_id = $1",
                flashcard_id
            )

            if not flashcard_row:
                raise HTTPException(status_code=404, detail="Flashcard not found")

            if flashcard_row["owner_id"] != user.user_id and not user.is_admin:
                raise HTTPException(status_code=403, detail="Not authorized to update this flashcard")

        # Update visibility
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE user_flashcards SET visibility = $1 WHERE flashcard_id = $2",
                request.visibility, flashcard_id
            )

        logger.info("Flashcard visibility updated", flashcard_id=flashcard_id, visibility=request.visibility)

        return {
            "success": True,
            "message": f"Flashcard visibility updated to {request.visibility}",
            "visibility": request.visibility
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update flashcard visibility", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to update visibility: {str(e)}")


@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.debug("Health check requested")
    return {
        "status": "healthy",
        "version": os.getenv("APP_VERSION", "1.0.30")
    }


@api_router.get("/version")
async def get_version():
    """Get API version and system information"""
    logger.debug("Version endpoint requested")
    return {
        "api_version": "1.0.30",
        "service_name": "Ommiquiz API",
        "status": "running"
    }


def generate_card_id(cardset_id: str, card_index: int) -> str:
    """
    Generate a unique card ID from cardset ID and index.

    Format: First 3 letters of cardset_id + zero-padded 3-digit number
    Example: cardset_id="three-states-test", index=0 -> "thr001"

    Args:
        cardset_id: The flashcard set ID
        card_index: Zero-based index of the card (0, 1, 2, ...)

    Returns:
        Card ID in format: prefix + number (e.g., "thr001")
    """
    # Extract first 3 letters from cardset_id (skip non-alphanumeric)
    prefix = ''.join(c for c in cardset_id if c.isalnum())[:3].lower()

    # Pad with 'x' if less than 3 characters
    prefix = prefix.ljust(3, 'x')

    # Create number part (1-indexed for display, e.g., 001, 002, 003)
    number = str(card_index + 1).zfill(3)

    return f"{prefix}{number}"


def ensure_card_ids(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure all flashcards have unique IDs.
    Generates IDs for cards that don't have them.

    Args:
        data: Flashcard YAML data dictionary

    Returns:
        Modified data with card IDs
    """
    logger.info("ensure_card_ids called",
               has_flashcards="flashcards" in data,
               flashcards_type=type(data.get("flashcards")).__name__ if "flashcards" in data else "N/A")

    if "flashcards" not in data or not isinstance(data["flashcards"], list):
        logger.info("Skipping ensure_card_ids - no flashcards list")
        return data

    cardset_id = data.get("id", "unknown")
    logger.info("Processing flashcards for card IDs",
               cardset_id=cardset_id,
               card_count=len(data["flashcards"]))

    for i, card in enumerate(data["flashcards"]):
        logger.info("Checking card",
                   card_index=i,
                   is_dict=isinstance(card, dict),
                   has_id="id" in card if isinstance(card, dict) else False)

        if not isinstance(card, dict):
            continue

        # Generate ID if not present
        if "id" not in card or not card["id"]:
            card["id"] = generate_card_id(cardset_id, i)
            logger.info("Generated card ID",
                       card_index=i,
                       card_id=card["id"],
                       cardset_id=cardset_id)

    return data


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
                if "id" not in card:
                    warnings.append(f"Flashcard {i+1} missing 'id' field (will be auto-generated)")
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
                if "bitmap" in card:
                    if not isinstance(card["bitmap"], str):
                        errors.append(f"Flashcard {i+1} field 'bitmap' must be a string")
                    else:
                        bitmap_value = card["bitmap"].strip()
                        if bitmap_value:
                            # Check if it's a URL
                            if bitmap_value.startswith(('http://', 'https://')):
                                # Validate URL format
                                if not re.match(r'^https?://[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$', bitmap_value, re.IGNORECASE):
                                    errors.append(
                                        f"Flashcard {i+1} field 'bitmap' contains an invalid image URL. "
                                        f"Must be a valid HTTP(S) URL ending with .jpg, .png, .gif, .webp, or .svg"
                                    )
                                # Warn about HTTP (not HTTPS)
                                if bitmap_value.startswith('http://'):
                                    logger.warning(f"Flashcard {i+1} uses HTTP URL for bitmap. HTTPS recommended.")
                            # Validate data URI
                            elif bitmap_value.startswith('data:'):
                                if not re.match(r'^data:image/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+$', bitmap_value):
                                    errors.append(f"Flashcard {i+1} field 'bitmap' contains malformed data URI")
                            # Validate raw base64
                            else:
                                if not re.match(r'^[A-Za-z0-9+/=]+$', bitmap_value):
                                    errors.append(
                                        f"Flashcard {i+1} field 'bitmap' must be a URL (http://...), "
                                        f"data URI (data:image/...), or valid base64 data"
                                    )
    
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
async def update_flashcard(
    flashcard_id: str,
    request: FlashcardUpdateRequest,
    admin: AuthenticatedUser = Depends(get_current_admin)
):
    """Create or update a flashcard file (Admin only)"""

    logger.info(
        "Admin updating flashcard",
        flashcard_id=flashcard_id,
        admin_user=admin.email
    )

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

    # Ensure all cards have IDs
    data = ensure_card_ids(data)

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
async def upload_flashcard(
    file: UploadFile = File(...),
    overwrite: str = Form(default="false"),
    admin: AuthenticatedUser = Depends(get_current_admin)
):
    """Upload and validate a new flashcard YAML file (Admin only)"""

    logger.info(
        "Admin uploading flashcard",
        filename=file.filename,
        overwrite=overwrite,
        admin_user=admin.email
    )
    
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

    # Ensure all cards have IDs
    logger.info("About to call ensure_card_ids",
               flashcard_id=data.get("id"),
               card_count=len(data.get("flashcards", [])))
    data = ensure_card_ids(data)
    logger.info("After calling ensure_card_ids",
               flashcard_id=data.get("id"),
               card_count=len(data.get("flashcards", [])))

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
async def delete_flashcard(
    flashcard_id: str,
    admin: AuthenticatedUser = Depends(get_current_admin)
):
    """Delete a flashcard file (Admin only)"""

    logger.info(
        "Admin deleting flashcard",
        flashcard_id=flashcard_id,
        admin_user=admin.email
    )

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

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .logging_config import get_logger

logger = get_logger("ommiquiz.storage")


def generate_user_flashcard_id(user_id: str, slug: str) -> str:
    """Generate a namespaced flashcard ID for user-generated flashcards.

    Args:
        user_id: Full UUID or first 8 characters
        slug: URL-friendly identifier for the flashcard set

    Returns:
        Namespaced ID like 'user_abc12345_python_basics'
    """
    # Use first 8 chars of user_id for brevity
    user_prefix = user_id[:8] if len(user_id) > 8 else user_id
    return f"user_{user_prefix}_{slug}"


def is_user_flashcard(flashcard_id: str) -> bool:
    """Check if a flashcard ID belongs to a user-generated flashcard."""
    return flashcard_id.startswith("user_")


def extract_user_id_from_flashcard(flashcard_id: str) -> Optional[str]:
    """Extract user ID prefix from a user flashcard ID.

    Returns:
        8-character user ID prefix, or None if not a user flashcard
    """
    if not is_user_flashcard(flashcard_id):
        return None
    parts = flashcard_id.split("_")
    if len(parts) < 3:
        return None
    return parts[1]  # Return the 8-char user prefix


@dataclass
class FlashcardDocument:
    """In-memory representation of a flashcard YAML document."""

    id: str
    filename: str
    content: str
    modified_time: Optional[datetime] = None


class BaseFlashcardStorage:
    """Storage interface for managing flashcard YAML documents."""

    def list_flashcards(self) -> List[FlashcardDocument]:  # pragma: no cover - interface
        raise NotImplementedError

    def get_flashcard(self, flashcard_id: str) -> Optional[FlashcardDocument]:  # pragma: no cover - interface
        raise NotImplementedError

    def save_flashcard(self, filename: str, content: str, overwrite: bool = False) -> FlashcardDocument:  # pragma: no cover - interface
        raise NotImplementedError

    def delete_flashcard(self, flashcard_id: str) -> List[str]:  # pragma: no cover - interface
        raise NotImplementedError

    def delete_flashcard_by_filename(self, filename: str) -> bool:  # pragma: no cover - interface
        raise NotImplementedError

    def flashcard_exists(self, flashcard_id: str) -> bool:  # pragma: no cover - interface
        raise NotImplementedError

    def save_catalog(self, content: str, catalog_filename: str) -> Path:  # pragma: no cover - interface
        raise NotImplementedError

    # User flashcard methods
    def list_user_flashcards(self, user_id: str) -> List[FlashcardDocument]:  # pragma: no cover - interface
        """List all flashcards belonging to a specific user."""
        raise NotImplementedError

    def get_user_flashcard(self, user_id: str, flashcard_id: str) -> Optional[FlashcardDocument]:  # pragma: no cover - interface
        """Get a specific user flashcard by ID."""
        raise NotImplementedError

    def save_user_flashcard(
        self, user_id: str, filename: str, content: str, overwrite: bool = False
    ) -> FlashcardDocument:  # pragma: no cover - interface
        """Save a flashcard to a user's directory."""
        raise NotImplementedError

    def delete_user_flashcard(self, user_id: str, flashcard_id: str) -> List[str]:  # pragma: no cover - interface
        """Delete a user flashcard by ID."""
        raise NotImplementedError

    def get_user_flashcard_path(self, user_id: str, flashcard_id: str) -> Optional[str]:  # pragma: no cover - interface
        """Get the storage path for a user flashcard."""
        raise NotImplementedError


class LocalFlashcardStorage(BaseFlashcardStorage):
    """Filesystem-based storage for flashcards (default)."""

    def __init__(self, flashcards_dir: Path):
        self.flashcards_dir = flashcards_dir
        self.flashcards_dir.mkdir(parents=True, exist_ok=True)

    def _get_flashcard_path(self, flashcard_id: str) -> Optional[Path]:
        yaml_path = self.flashcards_dir / f"{flashcard_id}.yaml"
        yml_path = self.flashcards_dir / f"{flashcard_id}.yml"

        if yaml_path.exists():
            return yaml_path
        if yml_path.exists():
            return yml_path
        return None

    def list_flashcards(self) -> List[FlashcardDocument]:
        documents: List[FlashcardDocument] = []
        
        logger.info("🔍 LocalFlashcardStorage: Starting to list flashcards", 
                   flashcards_dir=str(self.flashcards_dir))
        
        for pattern in ("*.yaml", "*.yml"):
            logger.info("🔍 Searching for pattern", pattern=pattern)
            matching_files = list(self.flashcards_dir.glob(pattern))
            logger.info("📋 Found files for pattern", pattern=pattern, count=len(matching_files), files=[f.name for f in matching_files])
            
            for file_path in matching_files:
                logger.info("📄 Processing file", filename=file_path.name, path=str(file_path))
                
                if file_path.name == "DBTE_QueryOptimierung.yaml":
                    logger.warning("🚨 PHANTOM FILE FOUND IN FILESYSTEM", 
                                 filename=file_path.name, 
                                 path=str(file_path),
                                 exists=file_path.exists(),
                                 size=file_path.stat().st_size if file_path.exists() else "N/A")
                
                try:
                    content = file_path.read_text(encoding="utf-8")
                    modified_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                    logger.info("✅ Successfully read file content",
                              filename=file_path.name,
                              content_length=len(content),
                              content_preview=content[:200] + "..." if len(content) > 200 else content)

                    document = FlashcardDocument(
                        id=file_path.stem,
                        filename=file_path.name,
                        content=content,
                        modified_time=modified_time,
                    )
                    
                    if document.id == "DBTE_QueryOptimierung":
                        logger.warning("🚨 PHANTOM DOCUMENT CREATED", 
                                     document_id=document.id,
                                     filename=document.filename,
                                     content_preview=document.content[:500] if document.content else "[NO_CONTENT]")
                    
                    documents.append(document)
                    
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Failed to read flashcard file",
                        filename=file_path.name,
                        error=str(exc),
                    )
        
        logger.info("✅ LocalFlashcardStorage: Completed listing flashcards", 
                   total_documents=len(documents))
        
        return documents

    def get_flashcard(self, flashcard_id: str) -> Optional[FlashcardDocument]:
        file_path = self._get_flashcard_path(flashcard_id)
        if not file_path:
            return None
        try:
            modified_time = datetime.fromtimestamp(file_path.stat().st_mtime)
            return FlashcardDocument(
                id=flashcard_id,
                filename=file_path.name,
                content=file_path.read_text(encoding="utf-8"),
                modified_time=modified_time,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to read flashcard", flashcard_id=flashcard_id, error=str(exc)
            )
            return None

    def save_flashcard(self, filename: str, content: str, overwrite: bool = False) -> FlashcardDocument:
        target_path = self.flashcards_dir / filename
        if target_path.exists() and not overwrite:
            logger.error(
                "Flashcard already exists in local storage",
                filename=filename,
                path=str(target_path),
                overwrite=overwrite,
            )
            raise FileExistsError(f"Flashcard '{filename}' already exists")

        try:
            target_path.write_text(content, encoding="utf-8")
            logger.info(
                "Flashcard saved to local storage",
                filename=filename,
                path=str(target_path),
                overwrite=overwrite,
                content_length=len(content),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to save flashcard to local storage",
                filename=filename,
                path=str(target_path),
                overwrite=overwrite,
                error=str(exc),
            )
            raise

        return FlashcardDocument(id=Path(filename).stem, filename=filename, content=content)

    def delete_flashcard(self, flashcard_id: str) -> List[str]:
        deleted: List[str] = []
        for suffix in (".yaml", ".yml"):
            candidate = self.flashcards_dir / f"{flashcard_id}{suffix}"
            if candidate.exists():
                candidate.unlink()
                deleted.append(candidate.name)
        return deleted

    def delete_flashcard_by_filename(self, filename: str) -> bool:
        """Delete a flashcard by its exact filename."""
        file_path = self.flashcards_dir / filename
        try:
            if file_path.exists():
                file_path.unlink()
                logger.info("Deleted flashcard by filename", filename=filename)
                return True
            else:
                logger.warning("Flashcard file not found", filename=filename)
                return False
        except Exception as e:
            logger.error("Failed to delete flashcard by filename",
                        filename=filename,
                        error=str(e))
            return False

    def flashcard_exists(self, flashcard_id: str) -> bool:
        return self._get_flashcard_path(flashcard_id) is not None

    def save_catalog(self, content: str, catalog_filename: str) -> Path:
        catalog_path = self.flashcards_dir / catalog_filename
        catalog_path.write_text(content, encoding="utf-8")
        return catalog_path

    def _get_user_flashcards_dir(self, user_id: str) -> Path:
        """Get or create the flashcards directory for a specific user."""
        user_dir = self.flashcards_dir / "users" / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    def _get_user_flashcard_path(self, user_id: str, flashcard_id: str) -> Optional[Path]:
        """Find the full path to a user flashcard file."""
        user_dir = self._get_user_flashcards_dir(user_id)
        yaml_path = user_dir / f"{flashcard_id}.yaml"
        yml_path = user_dir / f"{flashcard_id}.yml"

        if yaml_path.exists():
            return yaml_path
        if yml_path.exists():
            return yml_path
        return None

    def list_user_flashcards(self, user_id: str) -> List[FlashcardDocument]:
        """List all flashcards belonging to a specific user."""
        documents: List[FlashcardDocument] = []
        user_dir = self._get_user_flashcards_dir(user_id)

        logger.info("🔍 Listing user flashcards", user_id=user_id, user_dir=str(user_dir))

        for pattern in ("*.yaml", "*.yml"):
            for file_path in user_dir.glob(pattern):
                try:
                    content = file_path.read_text(encoding="utf-8")
                    modified_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                    documents.append(
                        FlashcardDocument(
                            id=file_path.stem,
                            filename=file_path.name,
                            content=content,
                            modified_time=modified_time,
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Failed to read user flashcard file",
                        user_id=user_id,
                        filename=file_path.name,
                        error=str(exc),
                    )

        logger.info("✅ Listed user flashcards", user_id=user_id, count=len(documents))
        return documents

    def get_user_flashcard(self, user_id: str, flashcard_id: str) -> Optional[FlashcardDocument]:
        """Get a specific user flashcard by ID."""
        file_path = self._get_user_flashcard_path(user_id, flashcard_id)
        if not file_path:
            return None
        try:
            modified_time = datetime.fromtimestamp(file_path.stat().st_mtime)
            return FlashcardDocument(
                id=flashcard_id,
                filename=file_path.name,
                content=file_path.read_text(encoding="utf-8"),
                modified_time=modified_time,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to read user flashcard",
                user_id=user_id,
                flashcard_id=flashcard_id,
                error=str(exc),
            )
            return None

    def save_user_flashcard(
        self, user_id: str, filename: str, content: str, overwrite: bool = False
    ) -> FlashcardDocument:
        """Save a flashcard to a user's directory."""
        user_dir = self._get_user_flashcards_dir(user_id)
        target_path = user_dir / filename

        if target_path.exists() and not overwrite:
            logger.error(
                "User flashcard already exists",
                user_id=user_id,
                filename=filename,
                path=str(target_path),
            )
            raise FileExistsError(f"Flashcard '{filename}' already exists for user {user_id}")

        try:
            target_path.write_text(content, encoding="utf-8")
            logger.info(
                "User flashcard saved",
                user_id=user_id,
                filename=filename,
                path=str(target_path),
                overwrite=overwrite,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to save user flashcard",
                user_id=user_id,
                filename=filename,
                error=str(exc),
            )
            raise

        return FlashcardDocument(id=Path(filename).stem, filename=filename, content=content)

    def delete_user_flashcard(self, user_id: str, flashcard_id: str) -> List[str]:
        """Delete a user flashcard by ID."""
        deleted: List[str] = []
        user_dir = self._get_user_flashcards_dir(user_id)

        for suffix in (".yaml", ".yml"):
            candidate = user_dir / f"{flashcard_id}{suffix}"
            if candidate.exists():
                candidate.unlink()
                deleted.append(candidate.name)
                logger.info("Deleted user flashcard", user_id=user_id, filename=candidate.name)

        return deleted

    def get_user_flashcard_path(self, user_id: str, flashcard_id: str) -> Optional[str]:
        """Get the storage path for a user flashcard."""
        file_path = self._get_user_flashcard_path(user_id, flashcard_id)
        return str(file_path) if file_path else None


class S3FlashcardStorage(BaseFlashcardStorage):
    """S3-based storage compatible with Amazon S3 or S3-compatible services."""

    def __init__(
        self,
        bucket_name: str,
        catalog_filename: str,
        prefix: str | None = None,
        endpoint_url: str | None = None,
        region_name: str | None = None,
    ):
        if not bucket_name:
            raise ValueError("S3 bucket name must be provided when using S3 storage")

        self.bucket = bucket_name
        self.prefix = (prefix or "flashcards/").rstrip("/") + "/"
        self.catalog_filename = catalog_filename
        self.client = boto3.client(
            "s3", endpoint_url=endpoint_url, region_name=region_name
        )
        self._temp_dir = Path(tempfile.gettempdir())

    def _build_key(self, filename: str) -> str:
        return f"{self.prefix}{filename}"

    def _get_object_content(self, key: str) -> Optional[str]:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].read().decode("utf-8")
        except (ClientError, BotoCoreError) as exc:
            logger.warning("Failed to fetch S3 object", key=key, error=str(exc))
            return None

    def _find_existing_key(self, flashcard_id: str) -> Optional[str]:
        for suffix in (".yaml", ".yml"):
            key = self._build_key(f"{flashcard_id}{suffix}")
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
                return key
            except (ClientError, BotoCoreError):
                continue
        return None

    def list_flashcards(self) -> List[FlashcardDocument]:
        documents: List[FlashcardDocument] = []
        paginator = self.client.get_paginator("list_objects_v2")
        try:
            for page in paginator.paginate(Bucket=self.bucket, Prefix=self.prefix):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    if not key.endswith((".yaml", ".yml")):
                        continue
                    filename = Path(key).name
                    content = self._get_object_content(key)
                    if content is None:
                        continue
                    # Get LastModified from S3 object metadata
                    modified_time = obj.get("LastModified")
                    documents.append(
                        FlashcardDocument(
                            id=Path(filename).stem,
                            filename=filename,
                            content=content,
                            modified_time=modified_time,
                        )
                    )
        except (ClientError, BotoCoreError) as exc:
            logger.error("Failed to list S3 flashcards", error=str(exc))
        return documents

    def get_flashcard(self, flashcard_id: str) -> Optional[FlashcardDocument]:
        key = self._find_existing_key(flashcard_id)
        if not key:
            return None
        content = self._get_object_content(key)
        if content is None:
            return None
        # Get LastModified from S3 object metadata
        modified_time = None
        try:
            response = self.client.head_object(Bucket=self.bucket, Key=key)
            modified_time = response.get("LastModified")
        except (ClientError, BotoCoreError) as exc:
            logger.warning("Failed to get S3 object metadata", key=key, error=str(exc))
        return FlashcardDocument(
            id=flashcard_id, filename=Path(key).name, content=content, modified_time=modified_time
        )

    def save_flashcard(self, filename: str, content: str, overwrite: bool = False) -> FlashcardDocument:
        key = self._build_key(filename)
        if not overwrite:
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
                raise FileExistsError(
                    f"Flashcard '{filename}' already exists in bucket '{self.bucket}'"
                )
            except (ClientError, BotoCoreError):
                pass
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content.encode("utf-8"),
                ContentType="application/x-yaml",
            )
            logger.info(
                "Flashcard saved to S3",
                filename=filename,
                bucket=self.bucket,
                key=key,
                overwrite=overwrite,
                content_length=len(content),
            )
        except (ClientError, BotoCoreError) as exc:
            logger.error(
                "Failed to save flashcard to S3",
                filename=filename,
                bucket=self.bucket,
                key=key,
                overwrite=overwrite,
                error=str(exc),
            )
            raise
        return FlashcardDocument(id=Path(filename).stem, filename=filename, content=content)

    def delete_flashcard(self, flashcard_id: str) -> List[str]:
        deleted: List[str] = []
        for suffix in (".yaml", ".yml"):
            key = self._build_key(f"{flashcard_id}{suffix}")
            try:
                self.client.delete_object(Bucket=self.bucket, Key=key)
                deleted.append(Path(key).name)
            except (ClientError, BotoCoreError) as exc:
                logger.warning("Failed to delete S3 flashcard", key=key, error=str(exc))
        return deleted

    def delete_flashcard_by_filename(self, filename: str) -> bool:
        """Delete a flashcard by its exact filename."""
        key = self._build_key(filename)
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
            logger.info("Deleted flashcard by filename", filename=filename, key=key)
            return True
        except (ClientError, BotoCoreError) as exc:
            logger.error("Failed to delete flashcard by filename",
                        filename=filename,
                        key=key,
                        error=str(exc))
            return False

    def flashcard_exists(self, flashcard_id: str) -> bool:
        return self._find_existing_key(flashcard_id) is not None

    def save_catalog(self, content: str, catalog_filename: str) -> Path:
        local_path = self._temp_dir / catalog_filename
        local_path.write_text(content, encoding="utf-8")
        key = self._build_key(catalog_filename)
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content.encode("utf-8"),
                ContentType="application/x-yaml",
            )
        except (ClientError, BotoCoreError) as exc:
            logger.warning("Failed to upload catalog to S3", error=str(exc))
        return local_path

    def _build_user_key(self, user_id: str, filename: str) -> str:
        """Build S3 key for user flashcards: prefix/users/{user_id}/{filename}"""
        return f"{self.prefix}users/{user_id}/{filename}"

    def _find_user_flashcard_key(self, user_id: str, flashcard_id: str) -> Optional[str]:
        """Find existing S3 key for a user flashcard."""
        for suffix in (".yaml", ".yml"):
            key = self._build_user_key(user_id, f"{flashcard_id}{suffix}")
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
                return key
            except (ClientError, BotoCoreError):
                continue
        return None

    def list_user_flashcards(self, user_id: str) -> List[FlashcardDocument]:
        """List all flashcards belonging to a specific user."""
        documents: List[FlashcardDocument] = []
        user_prefix = f"{self.prefix}users/{user_id}/"
        paginator = self.client.get_paginator("list_objects_v2")

        logger.info("🔍 Listing user flashcards from S3", user_id=user_id, prefix=user_prefix)

        try:
            for page in paginator.paginate(Bucket=self.bucket, Prefix=user_prefix):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    if not key.endswith((".yaml", ".yml")):
                        continue
                    filename = Path(key).name
                    content = self._get_object_content(key)
                    if content is None:
                        continue
                    modified_time = obj.get("LastModified")
                    documents.append(
                        FlashcardDocument(
                            id=Path(filename).stem,
                            filename=filename,
                            content=content,
                            modified_time=modified_time,
                        )
                    )
        except (ClientError, BotoCoreError) as exc:
            logger.error("Failed to list user flashcards from S3", user_id=user_id, error=str(exc))

        logger.info("✅ Listed user flashcards from S3", user_id=user_id, count=len(documents))
        return documents

    def get_user_flashcard(self, user_id: str, flashcard_id: str) -> Optional[FlashcardDocument]:
        """Get a specific user flashcard by ID."""
        key = self._find_user_flashcard_key(user_id, flashcard_id)
        if not key:
            return None
        content = self._get_object_content(key)
        if content is None:
            return None
        # Get LastModified from S3 object metadata
        modified_time = None
        try:
            response = self.client.head_object(Bucket=self.bucket, Key=key)
            modified_time = response.get("LastModified")
        except (ClientError, BotoCoreError) as exc:
            logger.warning("Failed to get S3 object metadata", key=key, error=str(exc))
        return FlashcardDocument(
            id=flashcard_id, filename=Path(key).name, content=content, modified_time=modified_time
        )

    def save_user_flashcard(
        self, user_id: str, filename: str, content: str, overwrite: bool = False
    ) -> FlashcardDocument:
        """Save a flashcard to a user's S3 directory."""
        key = self._build_user_key(user_id, filename)

        if not overwrite:
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
                raise FileExistsError(
                    f"Flashcard '{filename}' already exists for user {user_id} in bucket '{self.bucket}'"
                )
            except (ClientError, BotoCoreError):
                pass

        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content.encode("utf-8"),
                ContentType="application/x-yaml",
            )
            logger.info(
                "User flashcard saved to S3",
                user_id=user_id,
                filename=filename,
                bucket=self.bucket,
                key=key,
                overwrite=overwrite,
            )
        except (ClientError, BotoCoreError) as exc:
            logger.error(
                "Failed to save user flashcard to S3",
                user_id=user_id,
                filename=filename,
                error=str(exc),
            )
            raise

        return FlashcardDocument(id=Path(filename).stem, filename=filename, content=content)

    def delete_user_flashcard(self, user_id: str, flashcard_id: str) -> List[str]:
        """Delete a user flashcard by ID."""
        deleted: List[str] = []
        for suffix in (".yaml", ".yml"):
            key = self._build_user_key(user_id, f"{flashcard_id}{suffix}")
            try:
                self.client.delete_object(Bucket=self.bucket, Key=key)
                deleted.append(Path(key).name)
                logger.info("Deleted user flashcard from S3", user_id=user_id, key=key)
            except (ClientError, BotoCoreError) as exc:
                logger.warning("Failed to delete user flashcard from S3", key=key, error=str(exc))
        return deleted

    def get_user_flashcard_path(self, user_id: str, flashcard_id: str) -> Optional[str]:
        """Get the S3 key for a user flashcard."""
        key = self._find_user_flashcard_key(user_id, flashcard_id)
        return key if key else None


def get_flashcard_storage(flashcards_dir: Path, catalog_filename: str) -> BaseFlashcardStorage:
    storage_backend = os.getenv("FLASHCARDS_STORAGE", "local").lower()
    if storage_backend == "s3":
        return S3FlashcardStorage(
            bucket_name=os.getenv("S3_BUCKET", ""),
            catalog_filename=catalog_filename,
            prefix=os.getenv("S3_PREFIX"),
            endpoint_url=os.getenv("S3_ENDPOINT_URL"),
            region_name=os.getenv("AWS_REGION"),
        )

    return LocalFlashcardStorage(flashcards_dir)

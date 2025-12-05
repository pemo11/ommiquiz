from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .logging_config import get_logger

logger = get_logger("ommiquiz.storage")


@dataclass
class FlashcardDocument:
    """In-memory representation of a flashcard YAML document."""

    id: str
    filename: str
    content: str


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

    def flashcard_exists(self, flashcard_id: str) -> bool:  # pragma: no cover - interface
        raise NotImplementedError

    def save_catalog(self, content: str, catalog_filename: str) -> Path:  # pragma: no cover - interface
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
        for pattern in ("*.yaml", "*.yml"):
            for file_path in self.flashcards_dir.glob(pattern):
                try:
                    content = file_path.read_text(encoding="utf-8")
                    documents.append(
                        FlashcardDocument(
                            id=file_path.stem,
                            filename=file_path.name,
                            content=content,
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Failed to read flashcard file",
                        filename=file_path.name,
                        error=str(exc),
                    )
        return documents

    def get_flashcard(self, flashcard_id: str) -> Optional[FlashcardDocument]:
        file_path = self._get_flashcard_path(flashcard_id)
        if not file_path:
            return None
        try:
            return FlashcardDocument(
                id=flashcard_id,
                filename=file_path.name,
                content=file_path.read_text(encoding="utf-8"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to read flashcard", flashcard_id=flashcard_id, error=str(exc)
            )
            return None

    def save_flashcard(self, filename: str, content: str, overwrite: bool = False) -> FlashcardDocument:
        target_path = self.flashcards_dir / filename
        if target_path.exists() and not overwrite:
            raise FileExistsError(f"Flashcard '{filename}' already exists")

        target_path.write_text(content, encoding="utf-8")
        return FlashcardDocument(id=Path(filename).stem, filename=filename, content=content)

    def delete_flashcard(self, flashcard_id: str) -> List[str]:
        deleted: List[str] = []
        for suffix in (".yaml", ".yml"):
            candidate = self.flashcards_dir / f"{flashcard_id}{suffix}"
            if candidate.exists():
                candidate.unlink()
                deleted.append(candidate.name)
        return deleted

    def flashcard_exists(self, flashcard_id: str) -> bool:
        return self._get_flashcard_path(flashcard_id) is not None

    def save_catalog(self, content: str, catalog_filename: str) -> Path:
        catalog_path = self.flashcards_dir / catalog_filename
        catalog_path.write_text(content, encoding="utf-8")
        return catalog_path


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
                    documents.append(
                        FlashcardDocument(
                            id=Path(filename).stem,
                            filename=filename,
                            content=content,
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
        return FlashcardDocument(
            id=flashcard_id, filename=Path(key).name, content=content
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

        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=content.encode("utf-8"),
            ContentType="application/x-yaml",
        )
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

"""Utility helpers to store download activity for authenticated users."""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from .logging_config import get_logger

if TYPE_CHECKING:  # pragma: no cover - only used for typing
    from .auth import AuthenticatedUser

logger = get_logger("ommiquiz.download_logger")

_DB_PATH = Path(os.getenv("DOWNLOAD_LOG_DB_PATH", str(Path(__file__).parent / "download_logs.db")))
_DB_LOCK = threading.Lock()
_INITIALIZED = False


def _ensure_initialized() -> None:
    global _INITIALIZED
    if _INITIALIZED:
        return

    with _DB_LOCK:
        if _INITIALIZED:
            return
        try:
            _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(_DB_PATH) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS download_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_sub TEXT NOT NULL,
                        user_email TEXT,
                        flashcard_id TEXT NOT NULL,
                        filename TEXT NOT NULL,
                        downloaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                conn.commit()
            logger.info("Download log data store ready", path=str(_DB_PATH))
            _INITIALIZED = True
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.error("Failed to initialize download log store", error=str(exc), path=str(_DB_PATH))
            raise


def initialize_download_log_store() -> None:
    """Public helper invoked during application startup."""

    _ensure_initialized()


def log_flashcard_download(user: "AuthenticatedUser", flashcard_id: str, filename: str) -> None:
    """Persist a download event for the provided user."""

    _ensure_initialized()

    with _DB_LOCK:
        try:
            with sqlite3.connect(_DB_PATH) as conn:
                conn.execute(
                    """
                    INSERT INTO download_logs (user_sub, user_email, flashcard_id, filename)
                    VALUES (?, ?, ?, ?)
                    """,
                    (user.sub, getattr(user, "email", None), flashcard_id, filename),
                )
                conn.commit()
            logger.info(
                "Recorded flashcard download",
                flashcard_id=flashcard_id,
                filename=filename,
                user_sub=user.sub,
                user_email=getattr(user, "email", None),
            )
        except Exception as exc:  # pragma: no cover - avoid disrupting download on failure
            logger.error(
                "Failed to record flashcard download",
                error=str(exc),
                flashcard_id=flashcard_id,
                user_sub=user.sub,
            )


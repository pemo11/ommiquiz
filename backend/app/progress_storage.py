"""
User progress storage module for Ommiquiz.

Handles persistence of card box assignments and learning progress.
"""

import json
import os
from pathlib import Path
from typing import Dict, Optional
from datetime import datetime


# Directory for storing user progress files
PROGRESS_DIR = Path(__file__).parent.parent / "user_progress"


def _ensure_progress_directory() -> None:
    """Create the user_progress directory if it doesn't exist."""
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)


def _get_progress_file_path(user_id: str, flashcard_id: str) -> Path:
    """
    Get the file path for a user's progress file.

    Args:
        user_id: The user's ID
        flashcard_id: The flashcard set ID

    Returns:
        Path object for the progress file
    """
    # Sanitize filenames to prevent path traversal
    safe_user_id = "".join(c for c in user_id if c.isalnum() or c in ('_', '-'))
    safe_flashcard_id = "".join(c for c in flashcard_id if c.isalnum() or c in ('_', '-'))

    filename = f"{safe_user_id}_{safe_flashcard_id}_progress.json"
    return PROGRESS_DIR / filename


def load_user_progress(user_id: str, flashcard_id: str) -> Dict:
    """
    Load a user's progress for a specific flashcard set.

    Args:
        user_id: The user's ID
        flashcard_id: The flashcard set ID

    Returns:
        Dictionary containing progress data, or empty dict if not found

    Example return value:
    {
        "user_id": "user123",
        "flashcard_id": "dbte_kapitel9_quiz",
        "last_updated": "2026-01-10T22:30:00Z",
        "cards": {
            "card001": {
                "box": 1,
                "last_reviewed": "2026-01-10T22:25:00Z",
                "review_count": 3
            }
        },
        "session_history": [...]
    }
    """
    _ensure_progress_directory()

    file_path = _get_progress_file_path(user_id, flashcard_id)

    if not file_path.exists():
        return {}

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading progress file {file_path}: {e}")
        return {}


def save_user_progress(user_id: str, flashcard_id: str, progress: Dict) -> bool:
    """
    Save a user's progress for a specific flashcard set.

    Args:
        user_id: The user's ID
        flashcard_id: The flashcard set ID
        progress: Progress data to save

    Returns:
        True if saved successfully, False otherwise

    Expected progress structure:
    {
        "cards": {
            "card001": {"box": 1, "last_reviewed": "ISO_TIMESTAMP", "review_count": 1}
        },
        "session_summary": {
            "completed_at": "ISO_TIMESTAMP",
            "cards_reviewed": 15,
            "box_distribution": {"box1": 8, "box2": 4, "box3": 3}
        }
    }
    """
    _ensure_progress_directory()

    file_path = _get_progress_file_path(user_id, flashcard_id)

    # Load existing progress to merge with new data
    existing_progress = load_user_progress(user_id, flashcard_id)

    # Initialize structure if empty
    if not existing_progress:
        existing_progress = {
            "user_id": user_id,
            "flashcard_id": flashcard_id,
            "cards": {},
            "session_history": []
        }

    # Merge card progress
    if "cards" in progress:
        for card_id, card_data in progress["cards"].items():
            if card_id not in existing_progress["cards"]:
                existing_progress["cards"][card_id] = card_data
            else:
                # Merge existing data with new data
                existing_card = existing_progress["cards"][card_id]
                existing_card["box"] = card_data.get("box", existing_card.get("box", 1))
                existing_card["last_reviewed"] = card_data.get("last_reviewed", existing_card.get("last_reviewed"))
                existing_card["review_count"] = existing_card.get("review_count", 0) + 1

    # Add session summary to history
    if "session_summary" in progress:
        session = progress["session_summary"].copy()
        session["session_id"] = f"sess_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        session["started_at"] = existing_progress.get("last_updated", session.get("completed_at"))
        existing_progress.setdefault("session_history", []).append(session)

        # Keep only last 20 sessions to prevent file bloat
        if len(existing_progress["session_history"]) > 20:
            existing_progress["session_history"] = existing_progress["session_history"][-20:]

    # Update timestamp
    existing_progress["last_updated"] = datetime.now().isoformat() + "Z"

    # Save to file
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(existing_progress, f, indent=2, ensure_ascii=False)
        return True
    except IOError as e:
        print(f"Error saving progress file {file_path}: {e}")
        return False


def delete_user_progress(user_id: str, flashcard_id: str) -> bool:
    """
    Delete a user's progress for a specific flashcard set.

    Args:
        user_id: The user's ID
        flashcard_id: The flashcard set ID

    Returns:
        True if deleted successfully or file didn't exist, False on error
    """
    _ensure_progress_directory()

    file_path = _get_progress_file_path(user_id, flashcard_id)

    if not file_path.exists():
        return True  # Nothing to delete

    try:
        file_path.unlink()
        return True
    except IOError as e:
        print(f"Error deleting progress file {file_path}: {e}")
        return False


def get_all_user_progress(user_id: str) -> Dict[str, Dict]:
    """
    Get all progress data for a specific user across all flashcard sets.

    Args:
        user_id: The user's ID

    Returns:
        Dictionary mapping flashcard_id to progress data
    """
    _ensure_progress_directory()

    safe_user_id = "".join(c for c in user_id if c.isalnum() or c in ('_', '-'))
    pattern = f"{safe_user_id}_*_progress.json"

    all_progress = {}

    for file_path in PROGRESS_DIR.glob(pattern):
        # Extract flashcard_id from filename
        filename = file_path.stem  # Remove .json extension
        parts = filename.split('_progress')[0].split('_', 1)
        if len(parts) == 2:
            flashcard_id = parts[1]
            progress = load_user_progress(user_id, flashcard_id)
            if progress:
                all_progress[flashcard_id] = progress

    return all_progress

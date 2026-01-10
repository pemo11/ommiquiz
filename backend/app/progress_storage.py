"""
User progress storage module for Ommiquiz.

Handles persistence of card box assignments and learning progress using PostgreSQL.
"""

from datetime import datetime
from typing import Dict, Optional

from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert

from .database import AsyncSessionLocal
from .models import FlashcardProgress, QuizSession
from .logging_config import get_logger

logger = get_logger("ommiquiz.progress")


async def load_user_progress(user_id: str, flashcard_id: str) -> Dict:
    """
    Load a user's progress for a specific flashcard set from PostgreSQL.

    Args:
        user_id: The user's ID (UUID)
        flashcard_id: The flashcard set ID

    Returns:
        Dictionary containing progress data, or empty dict if not found

    Example return value:
    {
        "user_id": "uuid-string",
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
    async with AsyncSessionLocal() as session:
        try:
            # Query all cards for this user+flashcard
            result = await session.execute(
                select(FlashcardProgress).where(
                    FlashcardProgress.user_id == user_id,
                    FlashcardProgress.flashcard_id == flashcard_id
                )
            )
            progress_rows = result.scalars().all()

            # Build cards dictionary
            cards = {}
            last_updated = None
            for row in progress_rows:
                cards[row.card_id] = {
                    "box": row.box,
                    "last_reviewed": row.last_reviewed.isoformat() + "Z",
                    "review_count": row.review_count
                }
                if last_updated is None or row.updated_at and row.updated_at > last_updated:
                    last_updated = row.updated_at or row.created_at

            # Get session history (last 20 sessions)
            sessions_result = await session.execute(
                select(QuizSession)
                .where(
                    QuizSession.user_id == user_id,
                    QuizSession.flashcard_id == flashcard_id
                )
                .order_by(QuizSession.completed_at.desc())
                .limit(20)
            )
            sessions = sessions_result.scalars().all()

            session_history = [
                {
                    "session_id": f"sess_{s.id}",
                    "started_at": s.started_at.isoformat() + "Z",
                    "completed_at": s.completed_at.isoformat() + "Z",
                    "cards_reviewed": s.cards_reviewed,
                    "box_distribution": {
                        "box1": s.box1_count,
                        "box2": s.box2_count,
                        "box3": s.box3_count
                    },
                    "duration_seconds": s.duration_seconds
                }
                for s in sessions
            ]

            if not cards and not session_history:
                return {}

            return {
                "user_id": user_id,
                "flashcard_id": flashcard_id,
                "last_updated": last_updated.isoformat() + "Z" if last_updated else datetime.now().isoformat() + "Z",
                "cards": cards,
                "session_history": session_history
            }

        except Exception as e:
            logger.error("Error loading progress", user_id=user_id, flashcard_id=flashcard_id, error=str(e))
            return {}


async def save_user_progress(user_id: str, flashcard_id: str, progress: Dict) -> bool:
    """
    Save a user's progress for a specific flashcard set to PostgreSQL.

    Args:
        user_id: The user's ID (UUID)
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
            "box_distribution": {"box1": 8, "box2": 4, "box3": 3},
            "duration_seconds": 300
        },
        "flashcard_title": "Optional Title"
    }
    """
    async with AsyncSessionLocal() as session:
        try:
            # Save card-level progress
            if "cards" in progress:
                for card_id, card_data in progress["cards"].items():
                    # Validate box number
                    box_number = card_data.get("box")
                    if box_number not in (1, 2, 3):
                        logger.warning(
                            "Invalid box number",
                            user_id=user_id,
                            flashcard_id=flashcard_id,
                            card_id=card_id,
                            box=box_number
                        )
                        continue

                    # Parse timestamp
                    last_reviewed_str = card_data.get("last_reviewed")
                    if last_reviewed_str:
                        # Remove trailing 'Z' if present and parse
                        last_reviewed_str = last_reviewed_str.rstrip('Z')
                        last_reviewed = datetime.fromisoformat(last_reviewed_str)
                    else:
                        last_reviewed = datetime.now()

                    # Upsert card progress
                    stmt = insert(FlashcardProgress).values(
                        user_id=user_id,
                        flashcard_id=flashcard_id,
                        card_id=card_id,
                        box=box_number,
                        last_reviewed=last_reviewed,
                        review_count=card_data.get("review_count", 1),
                        updated_at=datetime.now()
                    )

                    # On conflict, update the card
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["user_id", "flashcard_id", "card_id"],
                        set_={
                            "box": box_number,
                            "last_reviewed": last_reviewed,
                            "review_count": FlashcardProgress.review_count + 1,
                            "updated_at": datetime.now()
                        }
                    )

                    await session.execute(stmt)

            # Save session history
            if "session_summary" in progress:
                summary = progress["session_summary"]

                # Parse timestamps
                completed_at_str = summary.get("completed_at", "")
                completed_at_str = completed_at_str.rstrip('Z')
                completed_at = datetime.fromisoformat(completed_at_str) if completed_at_str else datetime.now()

                started_at_str = summary.get("started_at", "")
                if started_at_str:
                    started_at_str = started_at_str.rstrip('Z')
                    started_at = datetime.fromisoformat(started_at_str)
                else:
                    # Calculate started_at from completed_at and duration if available
                    duration_seconds = summary.get("duration_seconds", 0)
                    if duration_seconds:
                        from datetime import timedelta
                        started_at = completed_at - timedelta(seconds=duration_seconds)
                    else:
                        started_at = completed_at

                box_dist = summary.get("box_distribution", {})

                new_session = QuizSession(
                    user_id=user_id,
                    flashcard_id=flashcard_id,
                    flashcard_title=progress.get("flashcard_title"),
                    started_at=started_at,
                    completed_at=completed_at,
                    cards_reviewed=summary.get("cards_reviewed", 0),
                    box1_count=box_dist.get("box1", 0),
                    box2_count=box_dist.get("box2", 0),
                    box3_count=box_dist.get("box3", 0),
                    duration_seconds=summary.get("duration_seconds")
                )

                session.add(new_session)

            await session.commit()
            logger.info(
                "Progress saved successfully",
                user_id=user_id,
                flashcard_id=flashcard_id,
                cards_count=len(progress.get("cards", {}))
            )
            return True

        except Exception as e:
            await session.rollback()
            logger.error("Error saving progress", user_id=user_id, flashcard_id=flashcard_id, error=str(e))
            return False


async def delete_user_progress(user_id: str, flashcard_id: str) -> bool:
    """
    Delete a user's progress for a specific flashcard set.

    Args:
        user_id: The user's ID (UUID)
        flashcard_id: The flashcard set ID

    Returns:
        True if deleted successfully or nothing to delete, False on error
    """
    async with AsyncSessionLocal() as session:
        try:
            # Delete card progress
            await session.execute(
                delete(FlashcardProgress).where(
                    FlashcardProgress.user_id == user_id,
                    FlashcardProgress.flashcard_id == flashcard_id
                )
            )

            # Note: We don't delete quiz_sessions as they are historical records
            # If you want to delete sessions too, uncomment below:
            # await session.execute(
            #     delete(QuizSession).where(
            #         QuizSession.user_id == user_id,
            #         QuizSession.flashcard_id == flashcard_id
            #     )
            # )

            await session.commit()
            logger.info("Progress deleted successfully", user_id=user_id, flashcard_id=flashcard_id)
            return True

        except Exception as e:
            await session.rollback()
            logger.error("Error deleting progress", user_id=user_id, flashcard_id=flashcard_id, error=str(e))
            return False


async def get_all_user_progress(user_id: str) -> Dict[str, Dict]:
    """
    Get all progress data for a specific user across all flashcard sets.

    Args:
        user_id: The user's ID (UUID)

    Returns:
        Dictionary mapping flashcard_id to progress data
    """
    async with AsyncSessionLocal() as session:
        try:
            # Get all unique flashcard IDs for this user
            result = await session.execute(
                select(FlashcardProgress.flashcard_id)
                .where(FlashcardProgress.user_id == user_id)
                .distinct()
            )
            flashcard_ids = [row[0] for row in result.fetchall()]

            # Load progress for each flashcard
            all_progress = {}
            for flashcard_id in flashcard_ids:
                progress = await load_user_progress(user_id, flashcard_id)
                if progress:
                    all_progress[flashcard_id] = progress

            return all_progress

        except Exception as e:
            logger.error("Error loading all user progress", user_id=user_id, error=str(e))
            return {}

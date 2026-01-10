"""
User progress storage module for Ommiquiz.

Handles persistence of card box assignments and learning progress using PostgreSQL
with plain SQL queries via asyncpg.
"""

from datetime import datetime, timedelta
from typing import Dict

from .database import get_db_pool
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
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Query all cards for this user+flashcard
            cards_query = """
                SELECT card_id, box, last_reviewed, review_count, updated_at, created_at
                FROM flashcard_progress
                WHERE user_id = $1 AND flashcard_id = $2
            """
            card_rows = await conn.fetch(cards_query, user_id, flashcard_id)

            # Build cards dictionary
            cards = {}
            last_updated = None
            for row in card_rows:
                cards[row['card_id']] = {
                    "box": row['box'],
                    "last_reviewed": row['last_reviewed'].isoformat() + "Z",
                    "review_count": row['review_count']
                }
                updated_at = row['updated_at'] or row['created_at']
                if last_updated is None or (updated_at and updated_at > last_updated):
                    last_updated = updated_at

            # Get session history (last 20 sessions)
            sessions_query = """
                SELECT id, started_at, completed_at, cards_reviewed,
                       box1_count, box2_count, box3_count, duration_seconds
                FROM quiz_sessions
                WHERE user_id = $1 AND flashcard_id = $2
                ORDER BY completed_at DESC
                LIMIT 20
            """
            session_rows = await conn.fetch(sessions_query, user_id, flashcard_id)

            session_history = [
                {
                    "session_id": f"sess_{row['id']}",
                    "started_at": row['started_at'].isoformat() + "Z",
                    "completed_at": row['completed_at'].isoformat() + "Z",
                    "cards_reviewed": row['cards_reviewed'],
                    "box_distribution": {
                        "box1": row['box1_count'],
                        "box2": row['box2_count'],
                        "box3": row['box3_count']
                    },
                    "duration_seconds": row['duration_seconds']
                }
                for row in session_rows
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
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Start a transaction
            async with conn.transaction():
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
                            last_reviewed_str = last_reviewed_str.rstrip('Z')
                            last_reviewed = datetime.fromisoformat(last_reviewed_str)
                        else:
                            last_reviewed = datetime.now()

                        # Upsert card progress using INSERT ... ON CONFLICT
                        upsert_query = """
                            INSERT INTO flashcard_progress
                                (user_id, flashcard_id, card_id, box, last_reviewed, review_count, updated_at)
                            VALUES ($1, $2, $3, $4, $5, $6, NOW())
                            ON CONFLICT (user_id, flashcard_id, card_id)
                            DO UPDATE SET
                                box = EXCLUDED.box,
                                last_reviewed = EXCLUDED.last_reviewed,
                                review_count = flashcard_progress.review_count + 1,
                                updated_at = NOW()
                        """
                        await conn.execute(
                            upsert_query,
                            user_id,
                            flashcard_id,
                            card_id,
                            box_number,
                            last_reviewed,
                            card_data.get("review_count", 1)
                        )

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
                            started_at = completed_at - timedelta(seconds=duration_seconds)
                        else:
                            started_at = completed_at

                    box_dist = summary.get("box_distribution", {})

                    insert_session_query = """
                        INSERT INTO quiz_sessions
                            (user_id, flashcard_id, flashcard_title, started_at, completed_at,
                             cards_reviewed, box1_count, box2_count, box3_count, duration_seconds)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    """
                    await conn.execute(
                        insert_session_query,
                        user_id,
                        flashcard_id,
                        progress.get("flashcard_title"),
                        started_at,
                        completed_at,
                        summary.get("cards_reviewed", 0),
                        box_dist.get("box1", 0),
                        box_dist.get("box2", 0),
                        box_dist.get("box3", 0),
                        summary.get("duration_seconds")
                    )

        logger.info(
            "Progress saved successfully",
            user_id=user_id,
            flashcard_id=flashcard_id,
            cards_count=len(progress.get("cards", {}))
        )
        return True

    except Exception as e:
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
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Delete card progress
            delete_query = """
                DELETE FROM flashcard_progress
                WHERE user_id = $1 AND flashcard_id = $2
            """
            await conn.execute(delete_query, user_id, flashcard_id)

            # Note: We don't delete quiz_sessions as they are historical records
            # If you want to delete sessions too, uncomment below:
            # delete_sessions_query = """
            #     DELETE FROM quiz_sessions
            #     WHERE user_id = $1 AND flashcard_id = $2
            # """
            # await conn.execute(delete_sessions_query, user_id, flashcard_id)

        logger.info("Progress deleted successfully", user_id=user_id, flashcard_id=flashcard_id)
        return True

    except Exception as e:
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
    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Get all unique flashcard IDs for this user
            flashcard_query = """
                SELECT DISTINCT flashcard_id
                FROM flashcard_progress
                WHERE user_id = $1
            """
            rows = await conn.fetch(flashcard_query, user_id)
            flashcard_ids = [row['flashcard_id'] for row in rows]

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

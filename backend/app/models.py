"""
Database models for Ommiquiz.

Defines SQLAlchemy models for user profiles, flashcard progress, and quiz sessions.
"""

from sqlalchemy import Column, Integer, String, DateTime, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from .database import Base


class UserProfile(Base):
    """
    User profile information.

    Links to Supabase auth.users table via foreign key.
    Stores additional user metadata not in the auth system.
    """
    __tablename__ = "user_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    email = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    def __repr__(self):
        return f"<UserProfile(id={self.id}, email={self.email})>"


class FlashcardProgress(Base):
    """
    Tracks user progress for individual flashcards.

    Stores which box each card is in (1=learned, 2=uncertain, 3=not learned)
    and review statistics.
    """
    __tablename__ = "flashcard_progress"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    flashcard_id = Column(String, nullable=False)
    card_id = Column(String, nullable=False)
    box = Column(Integer, CheckConstraint('box IN (1, 2, 3)'), nullable=False)
    last_reviewed = Column(DateTime(timezone=True), nullable=False)
    review_count = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Define unique constraint
    __table_args__ = (
        Index('idx_flashcard_progress_user_flashcard', 'user_id', 'flashcard_id'),
        Index('idx_flashcard_progress_unique', 'user_id', 'flashcard_id', 'card_id', unique=True),
    )

    def __repr__(self):
        return f"<FlashcardProgress(user_id={self.user_id}, flashcard_id={self.flashcard_id}, card_id={self.card_id}, box={self.box})>"


class QuizSession(Base):
    """
    Records completed quiz sessions.

    Tracks when a user completes a quiz, how many cards they reviewed,
    and the distribution of cards across the three boxes.
    Used for generating learning reports and tracking progress over time.
    """
    __tablename__ = "quiz_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    flashcard_id = Column(String, nullable=False)
    flashcard_title = Column(String, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=False)
    cards_reviewed = Column(Integer, nullable=False)
    box1_count = Column(Integer, default=0, nullable=False)
    box2_count = Column(Integer, default=0, nullable=False)
    box3_count = Column(Integer, default=0, nullable=False)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_quiz_sessions_user', 'user_id'),
        Index('idx_quiz_sessions_user_flashcard', 'user_id', 'flashcard_id'),
        Index('idx_quiz_sessions_completed_at', 'completed_at'),
    )

    def __repr__(self):
        return f"<QuizSession(id={self.id}, user_id={self.user_id}, flashcard_id={self.flashcard_id}, completed_at={self.completed_at})>"

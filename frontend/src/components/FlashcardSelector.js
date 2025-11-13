import React from 'react';
import './FlashcardSelector.css';

function FlashcardSelector({ flashcards, onSelect }) {
  if (flashcards.length === 0) {
    return (
      <div className="selector-container">
        <div className="no-flashcards">
          <p>No flashcards available.</p>
          <p>Please add YAML files to the flashcards directory.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="selector-container">
      <h2>Select a Flashcard Set</h2>
      <div className="flashcard-list">
        {flashcards.map((flashcard) => (
          <button
            key={flashcard.id}
            className="flashcard-item"
            onClick={() => onSelect(flashcard.id)}
            title={flashcard.description || flashcard.title}
          >
            <div className="flashcard-content">
              <span className="flashcard-icon">📚</span>
              <div className="flashcard-info">
                <span className="flashcard-title">{flashcard.title || flashcard.id}</span>
                {flashcard.description && (
                  <span className="flashcard-description">{flashcard.description}</span>
                )}
                <div className="flashcard-meta">
                  {flashcard.level && <span className="level-badge">{flashcard.level}</span>}
                  {flashcard.language && <span className="language-badge">{flashcard.language}</span>}
                  {flashcard.author && <span className="author-info">by {flashcard.author}</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default FlashcardSelector;

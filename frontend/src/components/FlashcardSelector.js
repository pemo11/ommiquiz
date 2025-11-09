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
          >
            <span className="flashcard-icon">📚</span>
            <span className="flashcard-name">{flashcard.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default FlashcardSelector;

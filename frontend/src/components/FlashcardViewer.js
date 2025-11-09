import React, { useState, useEffect } from 'react';
import './FlashcardViewer.css';

function FlashcardViewer({ flashcard, onBack }) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  const cards = flashcard.cards || [];
  const currentCard = cards[currentCardIndex];

  // Timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCardClick = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    if (currentCardIndex < cards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
    }
  };

  const handlePrevious = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
    }
  };

  if (!currentCard) {
    return (
      <div className="viewer-container">
        <p>No cards available in this flashcard set.</p>
        <button onClick={onBack} className="back-button">Back to Selection</button>
      </div>
    );
  }

  return (
    <div className="viewer-container">
      <div className="viewer-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <div className="metadata">
          <div className="metadata-item">
            <strong>Author:</strong> {flashcard.author}
          </div>
          <div className="metadata-item">
            <strong>Level:</strong> {flashcard.level}
          </div>
          <div className="metadata-item">
            <strong>Language:</strong> {flashcard.language}
          </div>
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-label">Card:</span>
          <span className="stat-value">{currentCardIndex + 1} / {cards.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Time:</span>
          <span className="stat-value">{formatTime(elapsedTime)}</span>
        </div>
      </div>

      <div className="card-container" onClick={handleCardClick}>
        <div className={`flashcard ${isFlipped ? 'flipped' : ''}`}>
          <div className="flashcard-face flashcard-front">
            <div className="card-header">Question</div>
            <div className="card-content">
              <p>{currentCard.question}</p>
            </div>
            <div className="card-hint">Click to flip</div>
          </div>
          <div className="flashcard-face flashcard-back">
            <div className="card-header">Answer</div>
            <div className="card-content">
              {currentCard.type === 'single' ? (
                <p>{currentCard.answer}</p>
              ) : (
                <ul>
                  {currentCard.answers && currentCard.answers.map((ans, idx) => (
                    <li key={idx}>{ans}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card-hint">Click to flip back</div>
          </div>
        </div>
      </div>

      <div className="navigation-buttons">
        <button
          onClick={handlePrevious}
          disabled={currentCardIndex === 0}
          className="nav-button"
        >
          ← Previous
        </button>
        <button
          onClick={handleNext}
          disabled={currentCardIndex === cards.length - 1}
          className="nav-button"
        >
          Next →
        </button>
      </div>

      {flashcard.topics && flashcard.topics.length > 0 && (
        <div className="topics">
          <strong>Topics:</strong> {flashcard.topics.join(', ')}
        </div>
      )}
    </div>
  );
}

export default FlashcardViewer;

import React, { useState, useEffect } from 'react';
import './FlashcardViewer.css';

function FlashcardViewer({ flashcard, onBack }) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  console.log('FlashcardViewer received flashcard:', flashcard);
  
  const cards = flashcard.cards || [];
  console.log('Cards array:', cards);
  console.log('Cards length:', cards.length);
  
  const currentCard = cards[currentCardIndex];

  // Reset selections when card changes
  useEffect(() => {
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
  }, [currentCardIndex]);

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
    if (currentCard.type === 'single') {
      setIsFlipped(!isFlipped);
    }
  };

  const handleAnswerSelect = (answerIndex) => {
    if (currentCard.type === 'multiple') {
      setSelectedAnswers(prev => {
        if (prev.includes(answerIndex)) {
          return prev.filter(idx => idx !== answerIndex);
        } else {
          return [...prev, answerIndex];
        }
      });
    }
  };

  const handleShowAnswers = () => {
    if (currentCard.type === 'multiple') {
      setShowCorrectAnswers(true);
    }
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

      {currentCard.type === 'single' ? (
        // Single answer card (flip-style)
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
                <p>{currentCard.answer}</p>
              </div>
              <div className="card-hint">Click to flip back</div>
            </div>
          </div>
        </div>
      ) : (
        // Multiple choice card (interactive)
        <div className="quiz-container">
          <div className="question-section">
            <div className="card-header">Question</div>
            <div className="card-content">
              <p>{currentCard.question}</p>
            </div>
          </div>
          
          <div className="answers-section">
            <div className="card-header">Select all correct answers:</div>
            <div className="answers-list">
              {currentCard.answers && currentCard.answers.map((answer, idx) => {
                const isCorrectAnswer = currentCard.correctAnswers && currentCard.correctAnswers[idx];
                const isSelectedAnswer = selectedAnswers.includes(idx);
                
                return (
                  <label key={idx} className={`answer-option ${isSelectedAnswer ? 'selected' : ''} ${showCorrectAnswers ? (isCorrectAnswer ? 'correct' : 'incorrect') : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelectedAnswer}
                      onChange={() => handleAnswerSelect(idx)}
                      disabled={showCorrectAnswers}
                    />
                    <span className="answer-text">{answer}</span>
                    {showCorrectAnswers && isCorrectAnswer && (
                      <span className="answer-indicator correct">✓</span>
                    )}
                    {showCorrectAnswers && !isCorrectAnswer && (
                      <span className="answer-indicator incorrect">✗</span>
                    )}
                  </label>
                );
              })}
            </div>
            
            {!showCorrectAnswers && (
              <button 
                onClick={handleShowAnswers}
                className="show-answers-button"
                disabled={selectedAnswers.length === 0}
              >
                Show Correct Answers
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Removed topics display - no longer shown during quiz */}
    </div>
  );
}

export default FlashcardViewer;

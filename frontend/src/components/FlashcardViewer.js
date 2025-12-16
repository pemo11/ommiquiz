import React, { useState, useEffect, useRef } from 'react';
import './FlashcardViewer.css';

function FlashcardViewer({ flashcard, onBack }) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [startTime] = useState(Date.now());  const [elapsedTime, setElapsedTime] = useState(0);

  // New state for quiz tracking
  const [cardResults, setCardResults] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [currentCardAnswered, setCurrentCardAnswered] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [postponedQueue, setPostponedQueue] = useState([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const touchStartRef = useRef(null);
  const gestureHandledRef = useRef(false);

  console.log('FlashcardViewer received flashcard:', flashcard);
  
  const cards = flashcard.cards || [];
  console.log('Cards array:', cards);
  console.log('Cards length:', cards.length);

  const currentCard = cards[currentCardIndex];

  const getBitmapSrc = (bitmap) => {
    if (!bitmap) return null;
    return bitmap.startsWith('data:') ? bitmap : `data:image/png;base64,${bitmap}`;
  };

  const renderQuestionContent = () => {
    const imageSrc = getBitmapSrc(currentCard?.bitmap);

    return (
      <div className="question-content">
        <p>{currentCard?.question}</p>
        {imageSrc && (
          <img
            src={imageSrc}
            alt="Question illustration"
            className="question-image"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    );
  };

  // Reset selections when card changes
  useEffect(() => {
    const cardResult = cardResults[currentCardIndex];

    if (cardResult) {
      if (cardResult.correct === false) {
        setSelectedAnswers([]);
        setShowCorrectAnswers(false);
        setCurrentCardAnswered(false);
        return;
      }
      // Card was previously answered - restore the state
      if (cardResult.type === 'multiple' && cardResult.selectedAnswers) {
        setSelectedAnswers(cardResult.selectedAnswers);
      } else {
        setSelectedAnswers([]);
      }
      // Only set as answered if the answers were actually revealed (not just selected)
      setShowCorrectAnswers(cardResult.type === 'multiple' && cardResult.selectedAnswers !== undefined);
      setCurrentCardAnswered(cardResult.type === 'multiple' && cardResult.selectedAnswers !== undefined);
    } else {
      // New card - reset everything
      setSelectedAnswers([]);
      setShowCorrectAnswers(false);
      setCurrentCardAnswered(false);
    }
  }, [currentCardIndex, cardResults]);

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

  const proceedToNextCard = () => {
    const isLastMainCard = currentCardIndex >= cards.length - 1;

    if (!isLastMainCard) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
      setSwipeDirection(null);
      return;
    }

    setPostponedQueue(prevQueue => {
      if (prevQueue.length === 0) {
        setShowCelebration(true);
        setShowSummary(true);
        return prevQueue;
      }

      const [nextIndex, ...rest] = prevQueue;
      setCurrentCardIndex(nextIndex);
      setIsFlipped(false);
      setSwipeDirection(null);
      return rest;
    });
  };

  const handleCardClick = () => {
    if (gestureHandledRef.current) {
      gestureHandledRef.current = false;
      return;
    }

    if (currentCard.type === 'single' && !currentCardAnswered) {
      setIsFlipped(!isFlipped);
    }
  };

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY
    };
    gestureHandledRef.current = false;
  };

  const handleTouchEnd = (event) => {
    if (!touchStartRef.current || currentCard.type !== 'single' || currentCardAnswered) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const swipeThreshold = 50;
    const verticalLimit = 40;

    if (Math.abs(deltaX) > swipeThreshold && Math.abs(deltaY) < verticalLimit) {
      gestureHandledRef.current = true;

      if (deltaX > 0) {
        setSwipeDirection('right');
        handleSingleAnswerEvaluation(true);
      } else {
        setSwipeDirection('left');
        handleSingleAnswerEvaluation(false);
      }
    }

    touchStartRef.current = null;
  };

  const handleAnswerSelect = (answerIndex) => {
    if (currentCard.type === 'multiple' && !currentCardAnswered) {
      setSelectedAnswers(prev => {
        if (prev.includes(answerIndex)) {
          return prev.filter(idx => idx !== answerIndex);
        } else {
          return [...prev, answerIndex];
        }
      });
    }
  };

  // New function to handle single-answer card evaluation
  const handleSingleAnswerEvaluation = (isCorrect) => {
    if (swipeDirection === null && currentCard.type === 'single' && !currentCardAnswered) {
      setSwipeDirection(isCorrect ? 'right' : 'left');
    }

    if (!isCorrect) {
      setPostponedQueue(prev => prev.includes(currentCardIndex) ? prev : [...prev, currentCardIndex]);
    } else {
      setPostponedQueue(prev => prev.filter(idx => idx !== currentCardIndex));
    }

    setCardResults(prev => ({
      ...prev,
      [currentCardIndex]: {
        type: 'single',
        correct: isCorrect,
        question: currentCard.question,
        answer: currentCard.answer,
        userAnswer: isCorrect ? 'Correct' : 'Incorrect'
      }
    }));
    setCurrentCardAnswered(true);

    // Automatically proceed to next card after a short delay
    setTimeout(() => {
      proceedToNextCard();
    }, 500);

    setTimeout(() => setSwipeDirection(null), 600);
  };

  // New function to handle skip action
  const handleSkip = () => {
    setCardResults(prev => ({
      ...prev,
      [currentCardIndex]: {
        type: currentCard.type,
        correct: null, // null indicates skipped
        question: currentCard.question,
        answer: currentCard.type === 'single' ? currentCard.answer : currentCard.answers.filter((_, idx) => currentCard.correctAnswers[idx]).join(', '),
        userAnswer: 'Skipped'
      }
    }));

    // Immediately proceed to next card without showing intermediate state
    proceedToNextCard();
  };

  // Enhanced function to handle multiple choice evaluation
  const handleShowAnswers = () => {
    if (currentCard.type === 'multiple' && !currentCardAnswered) {
      setShowCorrectAnswers(true);
      
      // Calculate if the answer is correct
      const correctAnswers = currentCard.correctAnswers || [];
      const userCorrectCount = selectedAnswers.filter(idx => correctAnswers[idx]).length;
      const userIncorrectCount = selectedAnswers.filter(idx => !correctAnswers[idx]).length;
      const totalCorrectAnswers = correctAnswers.filter(Boolean).length;
      
      // Debug logging
      console.log('Multiple Choice Evaluation:');
      console.log('Selected answers:', selectedAnswers);
      console.log('Correct answers array:', correctAnswers);
      console.log('User correct count:', userCorrectCount);
      console.log('User incorrect count:', userIncorrectCount);
      console.log('Total correct answers:', totalCorrectAnswers);
      
      // Determine correctness
      let isCorrect;
      let userAnswer;
      
      if (selectedAnswers.length === 0) {
        // No answers selected - treat as "just viewing"
        isCorrect = null; // null indicates "just viewing/learning"
        userAnswer = 'No answer selected (viewing only)';
      } else {
        // Answer is correct ONLY if user selected ALL correct answers and NO incorrect ones
        if (userIncorrectCount === 0 && userCorrectCount === totalCorrectAnswers) {
          // Perfect match: selected all correct answers and no incorrect ones
          isCorrect = true;
        } else {
          // Either selected some wrong answers OR missed some correct answers
          isCorrect = false;
        }
        userAnswer = selectedAnswers.map(idx => currentCard.answers[idx]).join(', ');
      }
      
      console.log('Final evaluation:', isCorrect);

      if (isCorrect === false) {
        setPostponedQueue(prev => prev.includes(currentCardIndex) ? prev : [...prev, currentCardIndex]);
      } else if (isCorrect === true) {
        setPostponedQueue(prev => prev.filter(idx => idx !== currentCardIndex));
      }

      setCardResults(prev => ({
        ...prev,
        [currentCardIndex]: {
          type: 'multiple',
          correct: isCorrect,
          question: currentCard.question,
          answer: currentCard.answers.filter((_, idx) => correctAnswers[idx]).join(', '),
          userAnswer: userAnswer,
          selectedAnswers,
          correctAnswers
        }
      }));
      setCurrentCardAnswered(true);
      
      // Remove automatic navigation - let user decide when to proceed
    }
  };

  // New function to allow retrying a question
  const handleTryAgain = () => {
    // Remove this card from results and reset its state
    setCardResults(prev => {
      const newResults = { ...prev };
      delete newResults[currentCardIndex];
      return newResults;
    });
    
    // Reset the card state to allow new attempt
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setCurrentCardAnswered(false);
  };

  const handleNext = () => {
    proceedToNextCard();
  };

  const handlePrevious = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
      setSwipeDirection(null);
    }
  };

  // Calculate statistics
  const calculateStats = () => {
    const results = Object.values(cardResults);
    const correct = results.filter(r => r.correct).length;
    const total = results.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    
    return { correct, total, percentage, results };
  };

  // Reset quiz function
  const handleRestartQuiz = () => {
    setCardResults({});
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setShowSummary(false);
    setCurrentCardAnswered(false);
    setSwipeDirection(null);
    setPostponedQueue([]);
    setShowCelebration(false);
  };

  if (showSummary) {
    const stats = calculateStats();
    
    return (
      <div className="viewer-container">
        <div className="quiz-summary">
          <div className="summary-header">
            <h2>🎉 Quiz Complete!</h2>
            {showCelebration && (
              <div className="celebration">
                <div className="firework firework-1" />
                <div className="firework firework-2" />
                <div className="firework firework-3" />
                <p className="celebration-message">You cleared every postponed card!</p>
              </div>
            )}
            <div className="summary-stats">
              <div className="stat-card">
                <div className="stat-number">{stats.correct}/{stats.total}</div>
                <div className="stat-label">Correct Answers</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.percentage}%</div>
                <div className="stat-label">Score</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{formatTime(elapsedTime)}</div>
                <div className="stat-label">Time Taken</div>
              </div>
            </div>
          </div>

          <div className="detailed-results">
            <h3>Detailed Results</h3>
            {stats.results.map((result, index) => (
              <div key={index} className={`result-item ${result.correct === null ? 'skipped-result' : result.correct ? 'correct-result' : 'incorrect-result'}`}>
                <div className="result-header">
                  <span className="result-indicator">
                    {result.correct === null ? '⏭️' : result.correct ? '✅' : '❌'}
                  </span>
                  <span className="result-question">Q{index + 1}: {result.question}</span>
                </div>
                <div className="result-details">
                  <div className="result-row">
                    <strong>Correct Answer:</strong> {result.answer}
                  </div>
                  <div className="result-row">
                    <strong>Your Answer:</strong> {result.userAnswer}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="summary-actions">
            <button onClick={handleRestartQuiz} className="restart-button">
              🔄 Restart Quiz
            </button>
            <button onClick={onBack} className="back-button">
              ← Back to Selection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="viewer-container">
        <p>No cards available in this flashcard set.</p>
        <button onClick={onBack} className="back-button">Back to Selection</button>
      </div>
    );
  }

  const progress = Object.keys(cardResults).length;

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
          <span className="stat-label">Progress:</span>
          <span className="stat-value">{progress} / {cards.length} answered</span>
        </div>
        <div className="stat">
          <span className="stat-label">Time:</span>
          <span className="stat-value">{formatTime(elapsedTime)}</span>
        </div>
      </div>

      {postponedQueue.length > 0 && (
        <div className="postponed-banner">
          <span className="postponed-icon">🔁</span>
          <div>
            <div className="postponed-title">Postponed cards in queue</div>
            <div className="postponed-subtitle">{postponedQueue.length} left to retry</div>
          </div>
        </div>
      )}

      {currentCard.type === 'single' ? (
        // Single answer card (flip-style)
        <div className="card-container">
          <div
            className={`flashcard ${isFlipped ? 'flipped' : ''} ${swipeDirection ? `swipe-${swipeDirection}` : ''}`}
            onClick={handleCardClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flashcard-face flashcard-front">
              <div className="card-header">Question</div>
              <div className="card-content">
                {renderQuestionContent()}
              </div>
              {!currentCardAnswered && (
                <div className="card-hint">
                  Click to flip
                  <div className="swipe-hint">Swipe ⬅️ to postpone • Swipe ➡️ to mark done</div>
                </div>
              )}
            </div>
            <div className="flashcard-face flashcard-back">
              <div className="card-header">Answer</div>
              <div className="card-content">
                <p>{currentCard.answer}</p>
              </div>
              {!currentCardAnswered && (
                <div className="evaluation-buttons">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSingleAnswerEvaluation(false); }}
                    className="eval-button incorrect-button"
                  >
                    📤 Postpone
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSkip(); }}
                    className="eval-button skip-button"
                  >
                    ⏭️ Skip
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSingleAnswerEvaluation(true); }}
                    className="eval-button correct-button"
                  >
                    ✅ Done
                  </button>
                </div>
              )}
              {currentCardAnswered && (
                <div className="answered-indicator">
                  {cardResults[currentCardIndex]?.correct === null ? (
                    <span className="skip-indicator">⏭️ Skipped</span>
                  ) : cardResults[currentCardIndex]?.correct ? (
                    <span className="correct-indicator">✅ Marked as Done</span>
                  ) : (
                    <span className="incorrect-indicator">📤 Postponed</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Multiple choice card (interactive)
        <div className="quiz-container">
          <div className="question-section">
            <div className="card-header">Question</div>
            <div className="card-content">
              {renderQuestionContent()}
            </div>
          </div>
          
          <div className="answers-section">
            <div className="card-header">Select all correct answers:</div>
            <div className="answers-list">
              {currentCard.answers && currentCard.answers.map((answer, idx) => {
                const isCorrectAnswer = currentCard.correctAnswers && currentCard.correctAnswers[idx];
                const isSelectedAnswer = selectedAnswers.includes(idx);
                
                // Build CSS classes based on state
                let answerClasses = `answer-option`;
                if (isSelectedAnswer && !showCorrectAnswers) {
                  answerClasses += ' selected';
                }
                if (showCorrectAnswers) {
                  answerClasses += ' revealed';
                  if (isCorrectAnswer) {
                    answerClasses += ' correct';
                  } else {
                    answerClasses += ' incorrect';
                  }
                  // Add selected state for revealed answers
                  if (isSelectedAnswer) {
                    answerClasses += ' was-selected';
                  }
                }
                
                return (
                  <label key={idx} className={answerClasses}>
                    <input
                      type="checkbox"
                      checked={isSelectedAnswer}
                      onChange={() => handleAnswerSelect(idx)}
                      disabled={showCorrectAnswers}
                    />
                    <span className="answer-text">{answer}</span>
                    {showCorrectAnswers && (
                      <span className={`answer-indicator ${isCorrectAnswer ? 'correct' : 'incorrect'}`}>
                        {isCorrectAnswer ? '✓' : '✗'}
                      </span>
                    )}
                    {showCorrectAnswers && isSelectedAnswer && (
                      <span className="selection-indicator">
                        {isCorrectAnswer ? '👍' : '👎'}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            
            {!showCorrectAnswers && !currentCardAnswered && (
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                <button 
                  onClick={handleShowAnswers}
                  className="show-answers-button"
                  style={{ margin: 0, maxWidth: 'none', flex: 1 }}
                >
                  Show Correct Answers
                </button>
                <button 
                  onClick={handleSkip}
                  className="eval-button skip-button"
                  style={{ padding: '1rem 2rem', fontSize: '1rem', borderRadius: '10px' }}
                >
                  ⏭️ Skip
                </button>
              </div>
            )}
            
            {showCorrectAnswers && (
              <div className="evaluation-result">
                {cardResults[currentCardIndex]?.correct === null ? (
                  <div className="answered-indicator">
                    <span className="skip-indicator">💡 Viewing answers for learning</span>
                  </div>
                ) : cardResults[currentCardIndex]?.correct ? (
                  <div className="correct-evaluation">✅ Correct! You got it right!</div>
                ) : cardResults[currentCardIndex]?.correct === false ? (
                  <div className="incorrect-evaluation">
                    ❌ Incorrect. Review the correct answers above.
                    <button onClick={handleTryAgain} className="try-again-button">🔄 Try Again</button>
                  </div>
                ) : (
                  <div className="answered-indicator">
                    <span className="skip-indicator">💡 Viewing answers for learning</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="navigation-buttons">
        <button
          onClick={handleNext}
          disabled={false}
          className="nav-button"
        >
          {currentCardIndex === cards.length - 1 ? 'Show Results' : 'Next →'}
        </button>
        <button
          onClick={handlePrevious}
          disabled={currentCardIndex === 0}
          className="nav-button"
        >
          ← Previous
        </button>
      </div>

      {/* Progress indicator */}
      <div className="progress-indicator">
        <div className="progress-text">
          {progress > 0 && `${Math.round((progress / cards.length) * 100)}% Complete`}
        </div>
      </div>
    </div>
  );
}

export default FlashcardViewer;

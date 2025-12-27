import React, { useEffect, useMemo, useRef, useState } from 'react';
import './FlashcardViewer.css';

const normalizeLevel = (level) => {
  const normalized = (level || '').toString().trim().toUpperCase();
  return ['A', 'B', 'C'].includes(normalized) ? normalized : 'A';
};

const countCardLevels = (cards = []) => {
  return cards.reduce(
    (acc, card) => {
      const level = normalizeLevel(card.level);
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    },
    { A: 0, B: 0, C: 0 }
  );
};

const formatMixDescription = (mix) => {
  const parts = [];
  ['A', 'B', 'C'].forEach((level) => {
    if (mix[level]) {
      const value = mix[level];
      const formatted = Number.isInteger(value) ? value : Number(value).toFixed(1).replace(/\.0$/, '');
      parts.push(`${level}${formatted}%`);
    }
  });
  return parts.join(' / ') || 'All levels';
};

const parseLevelMixInput = (rawInput) => {
  if (!rawInput || !rawInput.trim()) {
    return { mix: null };
  }

  const mix = { A: 0, B: 0, C: 0 };
  const cleaned = rawInput.replace(/\s+/g, '');
  const parts = cleaned.split(',').filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^([ABCabc])(\d+)?$/);
    if (!match) {
      return { error: 'Use formats like "A", "B", "C" or "A60,B30,C10".' };
    }

    const level = match[1].toUpperCase();
    const value = match[2] ? parseInt(match[2], 10) : null;

    if (value === null) {
      if (parts.length > 1) {
        return { error: 'Please provide percentages for every level when mixing (e.g., A60,B30,C10).' };
      }
      mix[level] = 100;
    } else {
      mix[level] += value;
    }
  }

  const total = mix.A + mix.B + mix.C;
  if (total === 0) {
    return { error: 'Please provide at least one level percentage.' };
  }

  return { mix };
};

const calculateTargets = (totalCards, mix) => {
  if (!mix) {
    return {
      targets: { A: totalCards, B: 0, C: 0 },
      requestedMix: { A: 0, B: 0, C: 0 }
    };
  }

  const totalWeight = mix.A + mix.B + mix.C;
  const requestedMix = {
    A: (mix.A / totalWeight) * 100,
    B: (mix.B / totalWeight) * 100,
    C: (mix.C / totalWeight) * 100
  };

  const rawTargets = {
    A: (requestedMix.A / 100) * totalCards,
    B: (requestedMix.B / 100) * totalCards,
    C: (requestedMix.C / 100) * totalCards
  };

  const baseTargets = {
    A: Math.floor(rawTargets.A),
    B: Math.floor(rawTargets.B),
    C: Math.floor(rawTargets.C)
  };

  let remainder = totalCards - (baseTargets.A + baseTargets.B + baseTargets.C);
  const fractions = [
    { level: 'A', fraction: rawTargets.A - baseTargets.A },
    { level: 'B', fraction: rawTargets.B - baseTargets.B },
    { level: 'C', fraction: rawTargets.C - baseTargets.C }
  ].sort((a, b) => b.fraction - a.fraction);

  let index = 0;
  while (remainder > 0) {
    baseTargets[fractions[index].level] += 1;
    remainder -= 1;
    index = (index + 1) % fractions.length;
  }

  return { targets: baseTargets, requestedMix };
};

const selectCardsWithFallback = (cards, targets) => {
  const availableCounts = countCardLevels(cards);
  const adjustedTargets = { ...targets };
  const warnings = [];

  const redistributeDeficit = (fromLevel, toLevels) => {
    const deficit = Math.max(0, adjustedTargets[fromLevel] - availableCounts[fromLevel]);
    if (deficit === 0) {
      return { deficit: 0, transfers: [] };
    }

    adjustedTargets[fromLevel] -= deficit;
    let remaining = deficit;
    const transfers = [];

    toLevels.forEach((level) => {
      if (remaining <= 0) return;
      const spare = availableCounts[level] - adjustedTargets[level];
      if (spare > 0) {
        const transfer = Math.min(remaining, spare);
        adjustedTargets[level] += transfer;
        remaining -= transfer;
        transfers.push({ level, count: transfer });
      }
    });

    return { deficit, transfers, remaining };
  };

  const cAdjustment = redistributeDeficit('C', ['B', 'A']);
  if (cAdjustment.deficit > 0) {
    const fromB = cAdjustment.transfers.find((t) => t.level === 'B')?.count || 0;
    const fromA = cAdjustment.transfers.find((t) => t.level === 'A')?.count || 0;
    warnings.push(
      `Requested ${targets.C} level C cards, but only ${availableCounts.C} exist. Filled ${fromB} from level B and ${fromA} from level A.`
    );
  }

  const bAdjustment = redistributeDeficit('B', ['A']);
  if (bAdjustment.deficit > 0) {
    const fromA = bAdjustment.transfers.find((t) => t.level === 'A')?.count || 0;
    warnings.push(
      `Requested ${targets.B} level B cards, but only ${availableCounts.B} exist. Filled ${fromA} from level A.`
    );
  }

  const aAdjustment = redistributeDeficit('A', ['B', 'C']);
  if (aAdjustment.deficit > 0) {
    const fromB = aAdjustment.transfers.find((t) => t.level === 'B')?.count || 0;
    const fromC = aAdjustment.transfers.find((t) => t.level === 'C')?.count || 0;
    warnings.push(
      `Requested ${targets.A} level A cards, but only ${availableCounts.A} exist. Filled ${fromB} from level B and ${fromC} from level C.`
    );
  }

  const totalAvailable = cards.length;
  let totalTargeted = adjustedTargets.A + adjustedTargets.B + adjustedTargets.C;
  if (totalTargeted < totalAvailable) {
    let remaining = totalAvailable - totalTargeted;
    ['A', 'B', 'C'].forEach((level) => {
      if (remaining <= 0) return;
      const spare = availableCounts[level] - adjustedTargets[level];
      if (spare > 0) {
        const addition = Math.min(spare, remaining);
        adjustedTargets[level] += addition;
        remaining -= addition;
      }
    });
  }

  const desiredTotal = adjustedTargets.A + adjustedTargets.B + adjustedTargets.C;
  const remainingTargets = { ...adjustedTargets };
  const selectedIndexes = new Set();

  cards.forEach((card, index) => {
    const level = normalizeLevel(card.level);
    if (remainingTargets[level] > 0) {
      selectedIndexes.add(index);
      remainingTargets[level] -= 1;
    }
  });

  if (selectedIndexes.size < desiredTotal) {
    cards.forEach((_, index) => {
      if (selectedIndexes.size >= desiredTotal) {
        return;
      }
      if (!selectedIndexes.has(index)) {
        selectedIndexes.add(index);
      }
    });
  }

  const orderedIndexes = Array.from(selectedIndexes).sort((a, b) => a - b);
  const selectedCards = orderedIndexes.map((index) => cards[index]);
  const appliedCounts = countCardLevels(selectedCards);

  return {
    cards: selectedCards,
    warnings,
    appliedCounts
  };
};

function FlashcardViewer({ flashcard, onBack }) {
  const [cards, setCards] = useState(flashcard.cards || []);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [cardOrder, setCardOrder] = useState([]);
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionType, setSessionType] = useState('full');

  // New state for quiz tracking
  const [cardResults, setCardResults] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [currentCardAnswered, setCurrentCardAnswered] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [postponedQueue, setPostponedQueue] = useState([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [levelMixInput, setLevelMixInput] = useState('');
  const [levelMixError, setLevelMixError] = useState('');
  const [levelMixWarnings, setLevelMixWarnings] = useState([]);
  const [appliedMixSummary, setAppliedMixSummary] = useState('All cards (no level mix applied)');
  const touchStartRef = useRef(null);
  const gestureHandledRef = useRef(false);

  console.log('FlashcardViewer received flashcard:', flashcard);
  
  console.log('Cards array:', cards);
  console.log('Cards length:', cards.length);

  const currentCard = cards[currentCardIndex];
  const rawCardType = currentCard?.type || (Array.isArray(currentCard?.correctAnswers) ? 'multiple' : 'single');
  const cardType = (typeof rawCardType === 'string' ? rawCardType.toLowerCase() : rawCardType) || 'single';

  const availableLevelCounts = useMemo(() => countCardLevels(flashcard.cards || []), [flashcard.cards]);
  const appliedLevelCounts = useMemo(() => countCardLevels(cards), [cards]);

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

  const resetQuizState = () => {
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
    setElapsedTime(0);
    setStartTime(Date.now());
  };

  useEffect(() => {
    setCards(flashcard.cards || []);
    setLevelMixInput('');
    setLevelMixError('');
    setLevelMixWarnings([]);
    setAppliedMixSummary('All cards (no level mix applied)');
    resetQuizState();
  }, [flashcard]);

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

  // Re-initialize when flashcard changes
  useEffect(() => {
    const initialOrder = cards.map((_, idx) => idx);
    setCardOrder(initialOrder);
    setCurrentOrderIndex(0);
    setCurrentCardIndex(initialOrder[0] ?? 0);
    setIsFlipped(false);
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setCurrentCardAnswered(false);
    setSwipeDirection(null);
    setPostponedQueue([]);
    setShowCelebration(false);
    setShowSummary(false);
    setCardResults({});
    setElapsedTime(0);
    setStartTime(Date.now());
    setSessionType('full');
  }, [flashcard]);

  const proceedToNextCard = () => {
    const isLastCardInSession = currentOrderIndex >= cardOrder.length - 1;

    if (!isLastCardInSession) {
      const nextOrderIndex = currentOrderIndex + 1;
      const nextCardIndex = cardOrder[nextOrderIndex];
      setCurrentOrderIndex(nextOrderIndex);
      setCurrentCardIndex(nextCardIndex);
      setIsFlipped(false);
      setSwipeDirection(null);
      return;
    }

    setShowCelebration(postponedQueue.length === 0);
    setShowSummary(true);
  };

  const handleCardClick = () => {
    if (gestureHandledRef.current) {
      gestureHandledRef.current = false;
      return;
    }

    if (cardType === 'single' && !currentCardAnswered) {
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
    if (!touchStartRef.current || cardType !== 'single' || currentCardAnswered) {
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
    if (cardType === 'multiple' && !currentCardAnswered) {
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
    if (swipeDirection === null && cardType === 'single' && !currentCardAnswered) {
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
        userAnswer: isCorrect ? 'Correct' : 'Incorrect',
        level: currentCard.level
      }
    }));
    setCurrentCardAnswered(true);

    // Automatically proceed to next card after a short delay
    setTimeout(() => {
      proceedToNextCard();
    }, 500);

    setTimeout(() => setSwipeDirection(null), 600);
  };

  // Enhanced function to handle multiple choice evaluation
  const handleShowAnswers = () => {
    if (cardType === 'multiple' && !currentCardAnswered) {
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
        // No answers selected - treat as postponed
        isCorrect = false;
        userAnswer = 'No answer selected (postponed)';
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
          correctAnswers,
          level: currentCard.level
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
    setPostponedQueue(prev => prev.filter(idx => idx !== currentCardIndex));
    
    // Reset the card state to allow new attempt
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setCurrentCardAnswered(false);
  };

  const handleNext = () => {
    if (!cardResults[currentCardIndex]) {
      const correctAnswers = currentCard?.correctAnswers || [];
      setCardResults(prev => ({
        ...prev,
        [currentCardIndex]: {
          type: cardType,
          correct: false,
          question: currentCard?.question,
          answer: cardType === 'multiple'
            ? currentCard?.answers?.filter((_, idx) => correctAnswers[idx]).join(', ')
            : currentCard?.answer,
          userAnswer: 'Postponed (not evaluated)',
          selectedAnswers: cardType === 'multiple' ? [] : undefined,
          correctAnswers,
          level: currentCard?.level
        }
      }));
      setPostponedQueue(prev => prev.includes(currentCardIndex) ? prev : [...prev, currentCardIndex]);
    }

    proceedToNextCard();
  };

  const handlePrevious = () => {
    if (currentOrderIndex > 0) {
      const previousOrderIndex = currentOrderIndex - 1;
      const previousCardIndex = cardOrder[previousOrderIndex];
      setCurrentOrderIndex(previousOrderIndex);
      setCurrentCardIndex(previousCardIndex);
      setIsFlipped(false);
      setSwipeDirection(null);
    }
  };

  // Calculate statistics
  const calculateStats = () => {
    const orderedResults = cardOrder
      .map(idx => cardResults[idx] ? { ...cardResults[idx], cardIndex: idx, level: cardResults[idx].level || cards[idx]?.level } : null)
      .filter(Boolean);

    const correct = orderedResults.filter(r => r.correct).length;
    const total = cardOrder.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const postponedCount = Math.max(total - correct, 0);
    const levels = orderedResults.reduce((acc, result) => {
      const levelKey = result.level || 'Unspecified';
      if (!acc[levelKey]) {
        acc[levelKey] = { done: 0, postponed: 0 };
      }
      if (result.correct) {
        acc[levelKey].done += 1;
      } else {
        acc[levelKey].postponed += 1;
      }
      return acc;
    }, {});
    
    return { correct, total, percentage, results: orderedResults, postponedCount, levels };
  };

  const buildLearningEvaluation = (stats) => {
    const total = stats.total || cardOrder.length;
    const postponedCount = stats.postponedCount ?? Math.max(total - stats.correct, 0);
    const progress = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
    const cardsPerMinute = elapsedTime > 0 ? (stats.correct / (elapsedTime / 60)) : null;
    const etaMinutes = cardsPerMinute && postponedCount > 0 ? Math.ceil(postponedCount / cardsPerMinute) : null;

    let headline = 'Keep going!';
    if (progress === 100) {
      headline = 'Outstanding, you mastered every card!';
    } else if (progress >= 75) {
      headline = 'Great work, you are close to mastery!';
    } else if (progress >= 50) {
      headline = 'You are halfway there!';
    }

    const levelInsights = Object.entries(stats.levels || {}).map(([level, breakdown]) => {
      return `${level}: ${breakdown.done} done${breakdown.postponed ? `, ${breakdown.postponed} postponed` : ''}`;
    });

    const etaMessage = etaMinutes !== null
      ? `At your current pace you can clear the remaining cards in about ${etaMinutes} minute${etaMinutes === 1 ? '' : 's'}.`
      : 'Complete a few cards to estimate how long the remaining set will take.';

    return {
      headline,
      progressLine: `You finished ${stats.correct} of ${total} cards (${progress}%). ${postponedCount === 0 ? 'Everything is marked as done.' : `${postponedCount} card${postponedCount === 1 ? '' : 's'} are postponed.`}`,
      levelLine: levelInsights.length > 0 ? levelInsights.join(' • ') : 'No level data available for these cards.',
      etaMessage
    };
  };

  // Reset quiz function
  const handleRestartQuiz = () => {
    const fullOrder = cards.map((_, idx) => idx);
    setCardOrder(fullOrder);
    setCurrentOrderIndex(0);
    setCardResults({});
    setCurrentCardIndex(fullOrder[0] ?? 0);
    setIsFlipped(false);
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setShowSummary(false);
    setCurrentCardAnswered(false);
    setSwipeDirection(null);
    setPostponedQueue([]);
    setShowCelebration(false);
    setElapsedTime(0);
    setStartTime(Date.now());
    setSessionType('full');
  };

  const isPostponedResult = (result) => {
    if (!result) return false;

    // Prefer an explicit postponed flag if present
    if (result.postponed === true) {
      return true;
    }

    const userAnswer = result.userAnswer;

    if (typeof userAnswer === 'string') {
      return userAnswer.includes('Postponed');
    }

    if (Array.isArray(userAnswer)) {
      return userAnswer.some(
        (ans) => typeof ans === 'string' && ans.includes('Postponed')
      );
    }

    return false;
  };

  const handleRepeatPostponed = () => {
    const postponedOnly = Object.entries(cardResults)
      .filter(([, result]) => isPostponedResult(result))
      .map(([idx]) => Number(idx));

    const nextOrder = postponedOnly.length > 0 ? postponedOnly : cards.map((_, idx) => idx);

    setCardOrder(nextOrder);
    setCurrentOrderIndex(0);
    setCurrentCardIndex(nextOrder[0] ?? 0);
    setCardResults({});
    setIsFlipped(false);
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setShowSummary(false);
    setCurrentCardAnswered(false);
    setSwipeDirection(null);
    setPostponedQueue([]);
    setShowCelebration(false);
    setElapsedTime(0);
    setStartTime(Date.now());
    setSessionType(postponedOnly.length > 0 ? 'postponed' : 'full');
  };

  // Automatically show the summary when all cards have been processed
  useEffect(() => {
    const allCardsProcessed = cardOrder.length > 0 && Object.keys(cardResults).length >= cardOrder.length;
    const isAtEndOfOrder = currentOrderIndex >= cardOrder.length - 1;

    if (!showSummary && allCardsProcessed && isAtEndOfOrder) {
      setShowCelebration(postponedQueue.length === 0);
      setShowSummary(true);
    }
  }, [cardResults, cardOrder.length, currentOrderIndex, showSummary, postponedQueue.length]);

  if (showSummary) {
    const stats = calculateStats();
    const evaluation = buildLearningEvaluation(stats);
    
    return (
      <div className="viewer-container">
        <div className="quiz-summary">
          <div className="summary-header">
            <h2>🎉 Quiz Complete!</h2>
            <div className="session-label">Session: {sessionType === 'postponed' ? 'Postponed review' : 'Full quiz'}</div>
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
              <div className="stat-card">
                <div className="stat-number">{stats.postponedCount}</div>
                <div className="stat-label">Postponed</div>
              </div>
            </div>
          </div>

          <div className="learning-evaluation">
            <h3>{evaluation.headline}</h3>
            <p className="evaluation-line">{evaluation.progressLine}</p>
            <p className="evaluation-line">{evaluation.levelLine}</p>
            <p className="evaluation-line subtle">{evaluation.etaMessage}</p>
          </div>

          {Object.keys(stats.levels || {}).length > 0 && (
            <div className="level-breakdown">
              {Object.entries(stats.levels).map(([level, breakdown]) => (
                <div key={level} className="level-chip">
                  <span className="level-title">Level {level}</span>
                  <span className="level-counts">{breakdown.done} done</span>
                  {breakdown.postponed > 0 && (
                    <span className="level-counts postponed">{breakdown.postponed} postponed</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="detailed-results">
            <h3>Detailed Results</h3>
            {stats.results.map((result, index) => (
              <div key={index} className={`result-item ${result.correct ? 'correct-result' : 'incorrect-result'}`}>
                <div className="result-header">
                  <span className="result-indicator">
                    {result.correct ? '✅' : '❌'}
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
            <button onClick={handleRepeatPostponed} className="restart-button" disabled={stats.postponedCount === 0}>
              🔁 Repeat Postponed Cards
            </button>
            <button onClick={handleRestartQuiz} className="restart-button secondary-button">
              🔄 Restart Full Quiz
            </button>
            <button onClick={onBack} className="back-button">
              Exit to Selection
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
  const totalCards = cardOrder.length || cards.length;
  const safeTotalCards = totalCards || 1;
  const currentCardPosition = totalCards > 0 ? currentOrderIndex + 1 : 0;

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

      <div className="level-mix-panel">
        <div className="level-mix-header">
          <div>
            <h3>Choose card difficulty mix</h3>
            <p className="level-mix-subtitle">
              Enter A, B, or C for a single level or a mix like A60,B30,C10. Missing level C cards are replaced by B, missing B cards by A.
            </p>
          </div>
          <div className="level-availability">
            <span>Available — A: {availableLevelCounts.A}</span>
            <span>B: {availableLevelCounts.B}</span>
            <span>C: {availableLevelCounts.C}</span>
          </div>
        </div>

        <div className="level-mix-controls">
          <input
            className="level-mix-input"
            type="text"
            value={levelMixInput}
            onChange={(e) => setLevelMixInput(e.target.value)}
            placeholder="e.g., A, B, C or A60,B30,C10"
          />
          <button className="level-mix-apply" onClick={handleApplyLevelMix}>
            Apply mix
          </button>
          <button className="level-mix-reset" onClick={handleResetLevelMix}>
            Reset
          </button>
        </div>

        {levelMixError && <div className="level-mix-error">{levelMixError}</div>}
        {levelMixWarnings.length > 0 && (
          <ul className="level-mix-warnings">
            {levelMixWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}

        <div className="level-mix-summary">
          <div>Applied mix: {appliedMixSummary}</div>
          <div>
            Showing — A: {appliedLevelCounts.A} • B: {appliedLevelCounts.B} • C: {appliedLevelCounts.C} (Total: {cards.length})
          </div>
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-label">Card:</span>
          <span className="stat-value">{currentCardPosition} / {totalCards}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Progress:</span>
          <span className="stat-value">{Math.min(progress, totalCards)} / {totalCards} answered</span>
        </div>
        <div className="stat">
          <span className="stat-label">Time:</span>
          <span className="stat-value">{formatTime(elapsedTime)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Session:</span>
          <span className="stat-value">{sessionType === 'postponed' ? 'Postponed review' : 'Full quiz'}</span>
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

      {cardType === 'single' ? (
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
                    onClick={(e) => { e.stopPropagation(); handleSingleAnswerEvaluation(true); }}
                    className="eval-button correct-button"
                  >
                    ✅ Done
                  </button>
                </div>
              )}
              {currentCardAnswered && (
                <div className="answered-indicator">
                  {cardResults[currentCardIndex]?.correct ? (
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
              </div>
            )}
            
            {showCorrectAnswers && (
              <div className="evaluation-result">
                {cardResults[currentCardIndex]?.correct ? (
                  <div className="correct-evaluation">✅ Correct! You got it right!</div>
                ) : (
                  <div className="incorrect-evaluation">
                    ❌ Incorrect. Review the correct answers above.
                    <button onClick={handleTryAgain} className="try-again-button">🔄 Try Again</button>
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
          disabled={cardOrder.length === 0}
          className="nav-button"
        >
          {currentOrderIndex === cardOrder.length - 1 ? 'Show Results' : 'Next →'}
        </button>
        <button
          onClick={handlePrevious}
          disabled={currentOrderIndex === 0}
          className="nav-button"
        >
          ← Previous
        </button>
      </div>

      {/* Progress indicator */}
      <div className="progress-indicator">
        <div className="progress-text">
          {progress > 0 && `${Math.round((Math.min(progress, totalCards) / safeTotalCards) * 100)}% Complete`}
        </div>
      </div>
    </div>
  );
}

export default FlashcardViewer;

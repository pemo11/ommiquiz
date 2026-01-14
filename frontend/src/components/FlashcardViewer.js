import React, { useEffect, useMemo, useRef, useState } from 'react';
import './FlashcardViewer.css';
import { useTranslation } from '../context/TranslationContext';

// API URL configuration
const getApiUrl = () => {
  if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  const hostname = window.location.hostname;
  const baseUrl = hostname === 'localhost' ? 'localhost' : hostname;
  const protocol = hostname === 'localhost' ? 'http' : window.location.protocol.replace(':', '');
  const port = hostname === 'localhost' ? ':8080' : '';
  return `${protocol}://${baseUrl}${port}/api`;
};

const API_URL = getApiUrl();

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

const selectRandomCards = (cardsArray, count) => {
  if (cardsArray.length <= count) {
    return [...cardsArray]; // Return all if fewer than requested
  }

  const shuffled = [...cardsArray];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
};

function FlashcardViewer({ flashcard, onBack }) {
  const { t } = useTranslation(); 
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
  const [currentSessionBoxes, setCurrentSessionBoxes] = useState({}); // { cardId: 1-3 }
  const [historicalBoxData, setHistoricalBoxData] = useState(null); // Previous session data
  const [showCelebration, setShowCelebration] = useState(false);
  const [levelMixInput, setLevelMixInput] = useState('');
  const [levelMixError, setLevelMixError] = useState('');
  const [levelMixWarnings, setLevelMixWarnings] = useState([]);
  const [appliedMixSummary, setAppliedMixSummary] = useState('levelMix.defaultSummary');
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [selectedMode, setSelectedMode] = useState(null); // 'regular', 'postponed', 'speed'
  const [quizCompletedAt, setQuizCompletedAt] = useState(null); // Timestamp when quiz was completed
  const touchStartRef = useRef(null);
  const gestureHandledRef = useRef(false);

  // Audio mode state
  const [audioMode, setAudioMode] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioDelay, setAudioDelay] = useState(5); // Seconds between question and answer
  const audioTimeoutRef = useRef(null);

  // Auto-play mode state
  const [autoPlayMode, setAutoPlayMode] = useState(false);
  const [autoPlayDelay, setAutoPlayDelay] = useState(5); // Seconds to show answer before advancing
  const autoPlayTimeoutRef = useRef(null);

  // Time-to-flip tracking
  const [cardDisplayTime, setCardDisplayTime] = useState(null); // Timestamp when current card was displayed
  const [flipTimes, setFlipTimes] = useState([]); // Array of flip durations in seconds for all cards

  console.log('FlashcardViewer received flashcard:', flashcard);
  
  console.log('Cards array:', cards);
  console.log('Cards length:', cards.length);

  const currentCard = cards[currentCardIndex];
  // Determine card type: explicit type, or infer from structure
  // Cards with 'answers' array (plural) or 'correctAnswers' are multiple choice
  // Cards with 'answer' (singular) are single answer
  const rawCardType = currentCard?.type ||
                      (Array.isArray(currentCard?.correctAnswers) || Array.isArray(currentCard?.answers) ? 'multiple' : 'single');
  const cardType = (typeof rawCardType === 'string' ? rawCardType.toLowerCase() : rawCardType) || 'single';

  const availableLevelCounts = useMemo(() => countCardLevels(flashcard.cards || []), [flashcard.cards]);
  const appliedLevelCounts = useMemo(() => countCardLevels(cards), [cards]);

  // Audio mode functions
  const stopAudio = () => {
    window.speechSynthesis.cancel();
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    setIsAudioPlaying(false);
  };

  const speakText = (text, lang = 'de-DE') => {
    if (!text) return;

    // Strip HTML tags for cleaner speech
    const cleanText = text.replace(/<[^>]*>/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 1.0;

    return new Promise((resolve) => {
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  };

  const playAudioForCard = React.useCallback(async () => {
    if (!currentCard) return;

    stopAudio();
    setIsAudioPlaying(true);

    try {
      // Determine language - check card language first, then flashcard language
      let lang = 'de-DE';
      if (currentCard.language === 'en' || flashcard.language === 'en') {
        lang = 'en-US';
      } else if (currentCard.language === 'de' || flashcard.language === 'de') {
        lang = 'de-DE';
      }

      console.log('Audio mode: Using language', lang, 'for card');

      // Speak question
      await speakText(currentCard.question, lang);

      // Wait for configured delay
      await new Promise(resolve => {
        audioTimeoutRef.current = setTimeout(resolve, audioDelay * 1000);
      });

      // Use a ref check instead of state to avoid stale closure
      if (!audioMode) {
        console.log('Audio mode was disabled during delay');
        return;
      }

      // Reveal answer
      setIsFlipped(true);
      setShowCorrectAnswers(true);

      // Small delay to let UI update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Speak answer
      let answerText = '';
      const rawCardType = currentCard?.type ||
                          (Array.isArray(currentCard?.correctAnswers) || Array.isArray(currentCard?.answers) ? 'multiple' : 'single');
      const cardType = (typeof rawCardType === 'string' ? rawCardType.toLowerCase() : rawCardType) || 'single';

      if (cardType === 'multiple' && currentCard.correctAnswers) {
        // For multiple choice, read the correct answers
        const correctAnswers = currentCard.answers.filter((_, idx) =>
          currentCard.correctAnswers.includes(idx)
        );
        answerText = 'Korrekte Antworten: ' + correctAnswers.join(', ');
      } else if (currentCard.answer) {
        answerText = currentCard.answer;
      }

      await speakText(answerText, lang);

      setIsAudioPlaying(false);
      console.log('Audio playback completed for card');
    } catch (error) {
      console.error('Audio playback error:', error);
      setIsAudioPlaying(false);
    }
  }, [currentCard, flashcard.language, audioDelay, audioMode]);

  const toggleAudioMode = () => {
    const newMode = !audioMode;
    setAudioMode(newMode);

    if (!newMode) {
      stopAudio();
    } else {
      // Start audio when enabled
      playAudioForCard();
    }
  };

  // Auto-play audio when card changes in audio mode
  useEffect(() => {
    if (audioMode && !showSummary && currentCard) {
      console.log('Audio mode: Card changed, resetting and playing audio');
      // Reset card state
      setIsFlipped(false);
      setShowCorrectAnswers(false);
      setSelectedAnswers([]);

      // Play audio after a short delay to allow UI to update
      const playTimeout = setTimeout(() => {
        if (audioMode) {
          console.log('Audio mode: Starting playback for new card');
          playAudioForCard();
        }
      }, 500);

      return () => {
        clearTimeout(playTimeout);
        if (audioTimeoutRef.current) {
          clearTimeout(audioTimeoutRef.current);
        }
      };
    }
  }, [currentCardIndex, audioMode, showSummary, currentCard, playAudioForCard]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  // Auto-play mode functions
  const stopAutoPlay = () => {
    if (autoPlayTimeoutRef.current) {
      clearTimeout(autoPlayTimeoutRef.current);
      autoPlayTimeoutRef.current = null;
    }
  };

  const toggleAutoPlayMode = () => {
    const newMode = !autoPlayMode;
    setAutoPlayMode(newMode);

    if (!newMode) {
      stopAutoPlay();
    }
  };

  // Auto-play logic: flip card and advance automatically
  useEffect(() => {
    if (autoPlayMode && !showSummary && currentCard && !audioMode) {
      console.log('Auto-play: Starting for card', currentOrderIndex + 1);

      // If card is already flipped, just wait and advance
      if (isFlipped || showCorrectAnswers) {
        console.log('Auto-play: Card already flipped, waiting to advance');
        autoPlayTimeoutRef.current = setTimeout(() => {
          if (autoPlayMode && currentOrderIndex < cardOrder.length - 1) {
            console.log('Auto-play: Advancing to next card');
            handleNext();
          } else if (currentOrderIndex === cardOrder.length - 1) {
            console.log('Auto-play: Reached last card, stopping');
            setAutoPlayMode(false);
          }
        }, autoPlayDelay * 1000);
      } else {
        // Card is not flipped, wait then flip
        console.log('Auto-play: Waiting to flip card');
        autoPlayTimeoutRef.current = setTimeout(() => {
          if (autoPlayMode) {
            console.log('Auto-play: Flipping card');
            setIsFlipped(true);
            setShowCorrectAnswers(true);

            // After showing answer, wait again then advance
            autoPlayTimeoutRef.current = setTimeout(() => {
              if (autoPlayMode && currentOrderIndex < cardOrder.length - 1) {
                console.log('Auto-play: Advancing to next card');
                handleNext();
              } else if (currentOrderIndex === cardOrder.length - 1) {
                console.log('Auto-play: Reached last card, stopping');
                setAutoPlayMode(false);
              }
            }, autoPlayDelay * 1000);
          }
        }, autoPlayDelay * 1000);
      }

      return () => {
        stopAutoPlay();
      };
    }
  }, [autoPlayMode, currentCardIndex, currentOrderIndex, isFlipped, showCorrectAnswers, showSummary, audioMode, autoPlayDelay, cardOrder.length, handleNext]);

  // Cleanup auto-play on unmount
  useEffect(() => {
    return () => {
      stopAutoPlay();
    };
  }, []);

  const handleApplyLevelMix = () => {
    try {
      setLevelMixError('');
      setLevelMixWarnings([]);
      
      if (!levelMixInput.trim()) {
        setLevelMixError('Please enter a level mix (e.g., A, B, C or A60,B30,C10)');
        return;
      }

      // Parse the level mix input
      const mix = parseLevelMixInput(levelMixInput);
      
      if (!mix || mix.length === 0) {
        setLevelMixError('Invalid level mix format. Use A, B, C or A60,B30,C10 format.');
        return;
      }

      // Calculate targets based on available cards
      const targets = calculateTargets(flashcard.cards.length, mix);
      
      // Select cards based on the targets
      const { cards: selectedCards, warnings, appliedCounts } = selectCardsWithFallback(flashcard.cards, targets);
      
      // Update state with selected cards
      setCards(selectedCards);
      setLevelMixWarnings(warnings);
      
      // Generate a summary of the applied mix
      const summary = formatMixDescription(mix);
      setAppliedMixSummary(`Applied mix: ${summary}`);
      
      // Reset the quiz state with the new cards
      resetQuizState();
      
    } catch (error) {
      console.error('Error applying level mix:', error);
      setLevelMixError(error.message || 'Failed to apply level mix. Please check the format and try again.');
    }
  };

  const handleResetLevelMix = () => {
    // Reset to show all cards
    setCards(flashcard.cards || []);
    setLevelMixInput('');
    setLevelMixError('');
    setLevelMixWarnings([]);
    setAppliedMixSummary('All cards (no level mix applied)');
    resetQuizState();
  };

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
    setCurrentSessionBoxes({});
    setShowCelebration(false);
    setElapsedTime(0);
    setStartTime(Date.now());
    setFlipTimes([]);
    setCardDisplayTime(null);
  };

  useEffect(() => {
    setCards(flashcard.cards || []);
    setLevelMixInput('');
    setLevelMixError('');
    setLevelMixWarnings([]);
    setAppliedMixSummary('All cards (no level mix applied)');
    resetQuizState();
  }, [flashcard]);

  // Debug effect to track state changes
  useEffect(() => {
    console.log('--- STATE UPDATE ---');
    console.log('showCorrectAnswers:', showCorrectAnswers);
    console.log('currentCardAnswered:', currentCardAnswered);
    console.log('currentCardIndex:', currentCardIndex);
    console.log('cardResults for current card:', cardResults[currentCardIndex]);
    console.log('-------------------');
  }, [showCorrectAnswers, currentCardAnswered, currentCardIndex, cardResults]);

  // Track card display time for time-to-flip metric
  useEffect(() => {
    // When a new card is displayed (not flipped), record the timestamp
    if (!isFlipped && !audioMode && !autoPlayMode) {
      setCardDisplayTime(Date.now());
      console.log('Card displayed at:', new Date(Date.now()).toISOString());
    }
  }, [currentCardIndex, isFlipped, audioMode, autoPlayMode]);

  // Record time-to-flip when card is flipped
  useEffect(() => {
    // When card is flipped and we have a display time, calculate duration
    if (isFlipped && cardDisplayTime && !audioMode && !autoPlayMode) {
      const flipTime = Date.now();
      const durationMs = flipTime - cardDisplayTime;
      const durationSeconds = durationMs / 1000;

      // Only record reasonable flip times (between 0.5 and 300 seconds)
      // This filters out audio/auto-play flips and unrealistic values
      if (durationSeconds >= 0.5 && durationSeconds <= 300) {
        setFlipTimes(prev => [...prev, durationSeconds]);
        console.log(`Card flipped after ${durationSeconds.toFixed(2)} seconds`);
      }

      // Reset display time after recording
      setCardDisplayTime(null);
    }
  }, [isFlipped, cardDisplayTime, audioMode, autoPlayMode]);

  // Reset selections when card changes
  useEffect(() => {
    const cardResult = cardResults[currentCardIndex];

    if (cardResult) {
      // If the card has evaluationResult set, it means the user just checked their answers
      // Don't reset in this case - let the user see the results
      if (cardResult.correct === false && cardResult.evaluationResult === undefined) {
        // This card was answered incorrectly in a previous attempt, reset it
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

    // When we reach the last card, show the summary
    // Use a timeout to ensure state updates are processed before showing summary
    setTimeout(() => {
      setQuizCompletedAt(new Date());
      setShowSummary(true);
    }, 0);
  };

  const handleCardClick = () => {
    if (gestureHandledRef.current) {
      gestureHandledRef.current = false;
      return;
    }

    // For multiple choice cards
    if (cardType === 'multiple') {
      if (!currentCardAnswered) {
        if (!isFlipped) {
          // Flipping to back - trigger evaluation
          handleShowAnswers();
        } else {
          // Flipping back to front - reset showCorrectAnswers to allow changes
          setShowCorrectAnswers(false);
        }
      }
      // Always allow flipping for multiple choice (to review question/answers)
      setIsFlipped(!isFlipped);
    } else {
      // For single answer cards, flip if not answered
      if (!currentCardAnswered) {
        setIsFlipped(!isFlipped);
      }
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
    // Don't allow changing answers after showing correct ones or if already answered
    if (showCorrectAnswers || currentCardAnswered) return;

    setSelectedAnswers(prev => {
      const newSelection = prev.includes(answerIndex)
        ? prev.filter(idx => idx !== answerIndex)
        : [...prev, answerIndex];

      console.log('Selected answers updated:', newSelection);
      return newSelection;
    });
  };

  // New function to handle box assignment (1=green/learned, 2=yellow/uncertain, 3=red/not learned)
  const handleBoxAssignment = (boxNumber) => {
    const cardId = currentCard.id;

    // Update box assignment for this card
    setCurrentSessionBoxes(prev => ({ ...prev, [cardId]: boxNumber }));

    // Update card results with box information
    setCardResults(prev => ({
      ...prev,
      [currentCardIndex]: {
        ...(prev[currentCardIndex] || {}),
        box: boxNumber,
        correct: boxNumber === 1, // Only Box 1 counts as "correct"
        userAnswer: `Box ${boxNumber}`,
        type: cardType,
        question: currentCard.question,
        answer: cardType === 'multiple'
          ? currentCard.answers?.filter((_, idx) => currentCard.correctAnswers?.[idx]).join(', ')
          : currentCard.answer,
        level: currentCard.level,
        selectedAnswers: cardType === 'multiple' ? selectedAnswers : undefined,
        correctAnswers: cardType === 'multiple' ? currentCard.correctAnswers : undefined
      }
    }));

    setCurrentCardAnswered(true);

    // Automatically proceed to next card after a short delay
    setTimeout(() => {
      proceedToNextCard();
    }, 500);
  };

  // Old function - kept for swipe gestures, but will be deprecated in favor of handleBoxAssignment
  const handleSingleAnswerEvaluation = (isCorrect) => {
    // For backwards compatibility with swipe gestures
    // Map to box assignment: isCorrect -> Box 1, !isCorrect -> Box 3
    handleBoxAssignment(isCorrect ? 1 : 3);

    if (swipeDirection === null && cardType === 'single' && !currentCardAnswered) {
      setSwipeDirection(isCorrect ? 'right' : 'left');
    }

    setTimeout(() => setSwipeDirection(null), 600);
  };

  // Enhanced function to handle multiple choice evaluation
  const handleShowAnswers = () => {
    if (cardType === 'multiple' && !currentCardAnswered) {
      console.log('Showing answers for multiple choice question');
      
      // Calculate if the answer is correct
      const correctAnswers = currentCard.correctAnswers || [];
      const userCorrectCount = selectedAnswers.filter(idx => correctAnswers[idx]).length;
      const userIncorrectCount = selectedAnswers.filter(idx => !correctAnswers[idx]).length;
      const totalCorrectAnswers = correctAnswers.filter(Boolean).length;
      
      // Determine correctness
      const isCorrect = selectedAnswers.length > 0 && 
                       userIncorrectCount === 0 && 
                       userCorrectCount === totalCorrectAnswers;
      
      const userAnswer = selectedAnswers.length > 0 
        ? selectedAnswers.map(idx => currentCard.answers[idx]).join(', ')
        : 'No answer selected';
      
      console.log('Multiple choice evaluation:', { isCorrect, userAnswer });
      
      // First, update the card results with the evaluation
      setCardResults(prev => {
        const newResults = {
          ...prev,
          [currentCardIndex]: {
            ...(prev[currentCardIndex] || {}), // Keep existing data
            type: 'multiple',
            correct: isCorrect,
            question: currentCard.question,
            answer: currentCard.answers.filter((_, idx) => correctAnswers[idx]).join(', '),
            userAnswer: userAnswer,
            selectedAnswers: [...selectedAnswers], // Preserve selected answers
            correctAnswers: [...correctAnswers],
            level: currentCard.level,
            evaluationResult: isCorrect
          }
        };
        console.log('Updated card results:', newResults);
        return newResults;
      });
      
      // Then show the correct answers and evaluation
      console.log('Setting showCorrectAnswers to true');
      setShowCorrectAnswers(true);
    }
  };

  // Old function - deprecated in favor of handleBoxAssignment
  // Kept for backwards compatibility
  const handleMultipleChoiceEvaluation = (markAsCorrect) => {
    // Map to box assignment: markAsCorrect -> Box 1, !markAsCorrect -> Box 3
    handleBoxAssignment(markAsCorrect ? 1 : 3);
  };

  const handleNext = () => {
    // If answers are shown but card not yet answered (Done/Postpone not clicked),
    // clear the evaluation so user can try again when they return
    if (showCorrectAnswers && !currentCardAnswered) {
      setCardResults(prev => {
        const newResults = { ...prev };
        delete newResults[currentCardIndex];
        return newResults;
      });
    } else if (!cardResults[currentCardIndex]) {
      // Card was skipped without any interaction
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
      // Note: With the new box system, skipped cards are not automatically assigned a box
      // They will remain unassigned until the user explicitly assigns them to a box
    }

    proceedToNextCard();
  };

  const handlePrevious = () => {
    if (currentOrderIndex > 0) {
      // If answers are shown but card not yet answered (Done/Postpone not clicked),
      // clear the evaluation so user can try again when they return
      if (showCorrectAnswers && !currentCardAnswered) {
        setCardResults(prev => {
          const newResults = { ...prev };
          delete newResults[currentCardIndex];
          return newResults;
        });
      }

      const previousOrderIndex = currentOrderIndex - 1;
      const previousCardIndex = cardOrder[previousOrderIndex];
      setCurrentOrderIndex(previousOrderIndex);
      setCurrentCardIndex(previousCardIndex);
      setIsFlipped(false);
      setSwipeDirection(null);
    }
  };

  // Calculate statistics with box distribution
  const calculateStats = () => {
    const orderedResults = cardOrder
      .map(idx => cardResults[idx] ? { ...cardResults[idx], cardIndex: idx, level: cardResults[idx].level || cards[idx]?.level } : null)
      .filter(Boolean);

    // Count cards in each box
    const boxCounts = { box1: 0, box2: 0, box3: 0 };
    orderedResults.forEach(result => {
      if (result.box === 1) boxCounts.box1++;
      else if (result.box === 2) boxCounts.box2++;
      else if (result.box === 3) boxCounts.box3++;
    });

    const correct = boxCounts.box1; // Only Box 1 counts as "correct"
    const total = cardOrder.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Level breakdown by box
    const levels = orderedResults.reduce((acc, result) => {
      const levelKey = result.level || 'Unspecified';
      if (!acc[levelKey]) {
        acc[levelKey] = { box1: 0, box2: 0, box3: 0 };
      }
      if (result.box === 1) {
        acc[levelKey].box1 += 1;
      } else if (result.box === 2) {
        acc[levelKey].box2 += 1;
      } else if (result.box === 3) {
        acc[levelKey].box3 += 1;
      }
      return acc;
    }, {});

    return {
      correct,
      total,
      percentage,
      results: orderedResults,
      box1Count: boxCounts.box1,
      box2Count: boxCounts.box2,
      box3Count: boxCounts.box3,
      levels
    };
  };

  const buildLearningEvaluation = (stats) => {
    const total = stats.total || cardOrder.length;
    const box1Count = stats.box1Count || 0;
    const box2Count = stats.box2Count || 0;
    const box3Count = stats.box3Count || 0;
    const progress = total > 0 ? Math.round((box1Count / total) * 100) : 0;
    const cardsPerMinute = elapsedTime > 0 ? (box1Count / (elapsedTime / 60)) : null;
    const remainingCards = box2Count + box3Count;
    const etaMinutes = cardsPerMinute && remainingCards > 0 ? Math.ceil(remainingCards / cardsPerMinute) : null;

    let headline = 'Keep going!';
    if (progress === 100 && box2Count === 0 && box3Count === 0) {
      headline = 'Outstanding, you mastered every card!';
    } else if (progress >= 75) {
      headline = 'Great work, you are close to mastery!';
    } else if (progress >= 50) {
      headline = 'You are halfway there!';
    }

    const levelInsights = Object.entries(stats.levels || {}).map(([level, breakdown]) => {
      const parts = [];
      if (breakdown.box1) parts.push(`${breakdown.box1} learned`);
      if (breakdown.box2) parts.push(`${breakdown.box2} uncertain`);
      if (breakdown.box3) parts.push(`${breakdown.box3} not learned`);
      return `${level}: ${parts.join(', ') || '0 cards'}`;
    });

    const etaMessage = etaMinutes !== null && remainingCards > 0
      ? `At your current pace you can review the remaining cards in about ${etaMinutes} minute${etaMinutes === 1 ? '' : 's'}.`
      : 'Complete a few cards to estimate how long the remaining set will take.';

    return {
      headline,
      progressLine: `Box 1 (Learned): ${box1Count}, Box 2 (Uncertain): ${box2Count}, Box 3 (Not Learned): ${box3Count}`,
      levelLine: levelInsights.length > 0 ? levelInsights.join(' • ') : 'No level data available for these cards.',
      etaMessage
    };
  };

  // Reset quiz function - now returns to start screen
  const handleRestartQuiz = () => {
    setShowStartScreen(true);
    setSelectedMode(null);
    setCardResults({});
    setIsFlipped(false);
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setShowSummary(false);
    setCurrentCardAnswered(false);
    setSwipeDirection(null);
    setCurrentSessionBoxes({});
    setShowCelebration(false);
    setElapsedTime(0);
    setStartTime(Date.now());
  };

  const handleStartQuiz = () => {
    // Always use the original flashcard.cards for filtering, not the current cards state
    let filteredCards = [...cards];
    let newSessionType = 'full';

    switch(selectedMode) {
      case 'regular':
        newSessionType = 'full';
        break;

      case 'speed':
        filteredCards = selectRandomCards(cards, 12);
        newSessionType = 'speed';
        break;

      // Box modes will be handled by handleContinueWithBox function
      default:
        break;
    }

    setCards(filteredCards);
    const initialOrder = filteredCards.map((_, idx) => idx);
    setCardOrder(initialOrder);
    setCurrentOrderIndex(0);
    setCurrentCardIndex(0);
    setSessionType(newSessionType);
    setShowStartScreen(false);

    // Reset quiz state
    setCardResults({});
    setIsFlipped(false);
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setCurrentCardAnswered(false);
    setSwipeDirection(null);
    setElapsedTime(0);
    setStartTime(Date.now());
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

  // New function to continue with cards from a specific box
  const handleContinueWithBox = (boxNumber) => {
    const boxCards = Object.entries(currentSessionBoxes)
      .filter(([_, box]) => box === boxNumber)
      .map(([cardId]) => cards.find(c => c.id === cardId))
      .filter(Boolean);

    if (boxCards.length === 0) {
      alert(`No cards in Box ${boxNumber}`);
      return;
    }

    setCards(boxCards);
    const initialOrder = boxCards.map((_, idx) => idx);
    setCardOrder(initialOrder);
    setCurrentOrderIndex(0);
    setCurrentCardIndex(0);
    setCardResults({});
    setCurrentSessionBoxes({});
    setShowSummary(false);
    setIsFlipped(false);
    setSelectedAnswers([]);
    setShowCorrectAnswers(false);
    setCurrentCardAnswered(false);
    setSwipeDirection(null);
    setShowCelebration(false);
    setElapsedTime(0);
    setStartTime(Date.now());
    setSessionType(`box${boxNumber}`);
  };

  // Save progress function
  const handleSaveProgress = async () => {
    // Check if user is authenticated (token in localStorage)
    const token = localStorage.getItem('authToken');

    if (!token) {
      alert('Please login to save your progress');
      return;
    }

    const stats = calculateStats();

    // Calculate average time-to-flip
    const averageTimeToFlip = flipTimes.length > 0
      ? flipTimes.reduce((sum, time) => sum + time, 0) / flipTimes.length
      : null;

    const progressData = {
      cards: Object.entries(currentSessionBoxes).reduce((acc, [cardId, box]) => {
        acc[cardId] = {
          box,
          last_reviewed: new Date().toISOString(),
          review_count: 1
        };
        return acc;
      }, {}),
      session_summary: {
        completed_at: new Date().toISOString(),
        cards_reviewed: Object.keys(currentSessionBoxes).length,
        box_distribution: {
          box1: stats.box1Count,
          box2: stats.box2Count,
          box3: stats.box3Count
        },
        duration_seconds: elapsedTime,
        average_time_to_flip_seconds: averageTimeToFlip
      },
      flashcard_title: flashcard.title || flashcard.id
    };

    try {
      const response = await fetch(
        `${API_URL}/flashcards/${flashcard.id}/progress`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(progressData)
        }
      );

      if (response.ok) {
        alert('Progress saved successfully!');
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to save progress' }));
        alert(`Failed to save progress: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Save progress error:', error);
      alert('Network error - please check your connection and try again');
    }
  };

  // Load progress on mount
  useEffect(() => {
    const loadProgress = async () => {
      const token = localStorage.getItem('authToken');

      if (!token || !flashcard.id) {
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/flashcards/${flashcard.id}/progress`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.progress && data.progress.cards) {
            setHistoricalBoxData(data.progress);
            console.log('Loaded historical progress:', data.progress);
          }
        }
      } catch (error) {
        console.error('Failed to load progress:', error);
      }
    };

    loadProgress();
  }, [flashcard.id]);

  // Automatically show the summary when all cards have been processed
  useEffect(() => {
    const allCardsProcessed = cardOrder.length > 0 && Object.keys(cardResults).length >= cardOrder.length;
    const isAtEndOfOrder = currentOrderIndex >= cardOrder.length - 1;

    if (!showSummary && allCardsProcessed && isAtEndOfOrder) {
      setQuizCompletedAt(new Date());
      setShowSummary(true);
    }
  }, [cardResults, cardOrder.length, currentOrderIndex, showSummary]);

  if (showSummary) {
    const stats = calculateStats();
    const evaluation = buildLearningEvaluation(stats);
    
    return (
      <div className="viewer-container">
        <div className="quiz-summary">
          <div className="summary-header">
            <h2>🎉 Quiz Complete!</h2>
            <div className="session-label">Session: {sessionType === 'postponed' ? t('quiz.postponedReview') : sessionType === 'speed' ? t('quiz.speedSession') : t('quiz.fullQuiz')}</div>
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
                <div className="stat-number">{stats.box1Count}</div>
                <div className="stat-label">Box 1 (Learned)</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.box2Count}</div>
                <div className="stat-label">Box 2 (Uncertain)</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{stats.box3Count}</div>
                <div className="stat-label">Box 3 (Not Learned)</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{formatTime(elapsedTime)}</div>
                <div className="stat-label">Time Taken</div>
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
                  {breakdown.box1 > 0 && (
                    <span className="level-counts box1">✅ {breakdown.box1}</span>
                  )}
                  {breakdown.box2 > 0 && (
                    <span className="level-counts box2">⚠️ {breakdown.box2}</span>
                  )}
                  {breakdown.box3 > 0 && (
                    <span className="level-counts box3">❌ {breakdown.box3}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="detailed-results">
            <div className="detailed-results-header">
              <h3>Detailed Results</h3>
              {quizCompletedAt && (
                <div className="quiz-completion-time">
                  Completed: {quizCompletedAt.toLocaleDateString()} at {quizCompletedAt.toLocaleTimeString()}
                </div>
              )}
            </div>
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
            <h3>Continue Learning</h3>
            <div className="action-buttons">
              <button
                onClick={() => handleContinueWithBox(1)}
                className={`action-button ${stats.box1Count === 0 ? 'disabled' : ''}`}
                disabled={stats.box1Count === 0}
              >
                <span className="button-icon">✅</span>
                <span className="button-text">Continue with Box 1 (Learned)</span>
                {stats.box1Count > 0 && (
                  <span className="badge">{stats.box1Count}</span>
                )}
              </button>

              <button
                onClick={() => handleContinueWithBox(2)}
                className={`action-button ${stats.box2Count === 0 ? 'disabled' : ''}`}
                disabled={stats.box2Count === 0}
              >
                <span className="button-icon">⚠️</span>
                <span className="button-text">Continue with Box 2 (Uncertain)</span>
                {stats.box2Count > 0 && (
                  <span className="badge">{stats.box2Count}</span>
                )}
              </button>

              <button
                onClick={() => handleContinueWithBox(3)}
                className={`action-button ${stats.box3Count === 0 ? 'disabled' : ''}`}
                disabled={stats.box3Count === 0}
              >
                <span className="button-icon">❌</span>
                <span className="button-text">Continue with Box 3 (Not Learned)</span>
                {stats.box3Count > 0 && (
                  <span className="badge">{stats.box3Count}</span>
                )}
              </button>

              <button
                onClick={handleSaveProgress}
                className="action-button save"
              >
                <span className="button-icon">💾</span>
                <span className="button-text">Save Progress</span>
              </button>

              <button
                onClick={handleRestartQuiz}
                className="action-button primary"
              >
                <span className="button-icon">🔄</span>
                <span className="button-text">Start Fresh (All Cards)</span>
              </button>

              <button
                onClick={onBack}
                className="action-button exit"
              >
                <span className="button-icon">🚪</span>
                <span className="button-text">Exit Quiz</span>
              </button>
            </div>

            <div className="action-note">
              Box 1: {stats.box1Count} cards • Box 2: {stats.box2Count} cards • Box 3: {stats.box3Count} cards
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showStartScreen) {
    return (
      <div className="viewer-container">
        <div className="start-screen">
          <button onClick={onBack} className="back-button">← {t('common.back')}</button>

          <div className="start-screen-header">
            <h2>{flashcard.title}</h2>
            <div className="metadata">
              <span>{t('quiz.author')} {flashcard.author}</span>
              <span>{t('quiz.level')} {flashcard.level}</span>
              <span>Total Cards: {cards.length}</span>
            </div>
          </div>

          <div className="mode-selection">
            <h3>{t('quiz.selectMode')}</h3>

            <div className="mode-cards">
              <button
                className={`mode-card ${selectedMode === 'regular' ? 'selected' : ''}`}
                onClick={() => setSelectedMode('regular')}
              >
                <div className="mode-icon">📚</div>
                <div className="mode-title">{t('quiz.regularMode')}</div>
                <div className="mode-description">{t('quiz.regularModeDesc')}</div>
                <div className="mode-count">{cards.length} cards</div>
              </button>

              {/* Speed mode only shown if more than 12 cards */}
              {cards.length > 12 && (
                <button
                  className={`mode-card ${selectedMode === 'speed' ? 'selected' : ''}`}
                  onClick={() => setSelectedMode('speed')}
                >
                  <div className="mode-icon">⚡</div>
                  <div className="mode-title">{t('quiz.speedMode')}</div>
                  <div className="mode-description">{t('quiz.speedModeDesc')}</div>
                  <div className="mode-count">
                    12 cards
                  </div>
                </button>
              )}
            </div>

            <button
              className="start-quiz-button"
              onClick={handleStartQuiz}
              disabled={!selectedMode}
            >
              {t('quiz.startQuiz')}
            </button>
          </div>

          <div className="level-mix-panel">
            <div className="level-mix-header">
              <div>
                <h3>{t('levelMix.title')}</h3>
                <p className="level-mix-subtitle">
                  {t('levelMix.subtitle')}
                </p>
              </div>
              <div className="level-availability">
                <span>{t('levelMix.available', { a: availableLevelCounts.A, b: availableLevelCounts.B, c: availableLevelCounts.C }).replace('{a}', availableLevelCounts.A).replace('{b}', availableLevelCounts.B).replace('{c}', availableLevelCounts.C)}</span>
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
                {t('levelMix.applyMix')}
              </button>
              <button className="level-mix-reset" onClick={handleResetLevelMix}>
                {t('levelMix.reset')}
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
              <div>{t('levelMix.appliedMix')} {appliedMixSummary}</div>
              <div>
                {t('levelMix.showing', { a: appliedLevelCounts.A, b: appliedLevelCounts.B, c: appliedLevelCounts.C, total: cards.length }).replace('{a}', appliedLevelCounts.A).replace('{b}', appliedLevelCounts.B).replace('{c}', appliedLevelCounts.C).replace('{total}', cards.length)}
              </div>
            </div>
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
        <button onClick={onBack} className="back-button">Back</button>
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
          <span className="stat-value">{sessionType === 'postponed' ? t('quiz.postponedReview') : sessionType === 'speed' ? t('quiz.speedSession') : t('quiz.fullQuiz')}</span>
        </div>
      </div>

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
              <div className="card-content">
                <p>{currentCard.answer}</p>
              </div>
              {!currentCardAnswered && (
                <div className="box-assignment-buttons">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBoxAssignment(1); }}
                    className="box-button box-green"
                  >
                    ✅ Box 1
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBoxAssignment(2); }}
                    className="box-button box-yellow"
                  >
                    ⚠️ Box 2
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBoxAssignment(3); }}
                    className="box-button box-red"
                  >
                    ❌ Box 3
                  </button>
                </div>
              )}
              {currentCardAnswered && (
                <div className="answered-indicator">
                  {cardResults[currentCardIndex]?.box === 1 && (
                    <span className="correct-indicator">✅ Box 1 - Learned</span>
                  )}
                  {cardResults[currentCardIndex]?.box === 2 && (
                    <span className="uncertain-indicator">⚠️ Box 2 - Uncertain</span>
                  )}
                  {cardResults[currentCardIndex]?.box === 3 && (
                    <span className="incorrect-indicator">❌ Box 3 - Not Learned</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Multiple choice card (flip-style like single answer)
        <div className="card-container">
          <div
            className={`flashcard ${isFlipped ? 'flipped' : ''}`}
            onClick={handleCardClick}
          >
            {/* Front side: Question with checkboxes */}
            <div className="flashcard-face flashcard-front">
              <div className="card-content" style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                height: '100%',
                padding: '1rem',
                alignItems: 'center'
              }}>
                <div style={{ marginBottom: '1rem', width: '100%', maxWidth: '90%' }}>
                  {renderQuestionContent()}
                </div>

                <div className="answers-list" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  width: '100%',
                  maxWidth: '90%'
                }}>
                  {currentCard.answers && currentCard.answers.map((answer, idx) => {
                    const isSelectedAnswer = selectedAnswers.includes(idx);

                    return (
                      <label
                        key={idx}
                        className={`answer-option ${isSelectedAnswer ? 'selected' : ''}`}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelectedAnswer}
                          onChange={() => handleAnswerSelect(idx)}
                          disabled={currentCardAnswered}
                        />
                        <span className="answer-text">{answer}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {!currentCardAnswered && (
                <div className="card-hint">
                  Click to flip and check your answers
                </div>
              )}
            </div>

            {/* Back side: Show correct/incorrect answers */}
            <div className="flashcard-face flashcard-back">
              <div className="card-content" style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                height: '100%',
                padding: '1rem',
                paddingBottom: '5rem',
                alignItems: 'center'
              }}>
                <div className="answers-list" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  width: '100%',
                  maxWidth: '90%'
                }}>
                  {currentCard.answers && currentCard.answers.map((answer, idx) => {
                    const isCorrectAnswer = currentCard.correctAnswers && currentCard.correctAnswers[idx];
                    const isSelectedAnswer = selectedAnswers.includes(idx);

                    let answerClasses = `answer-option revealed`;
                    if (isCorrectAnswer) {
                      answerClasses += ' correct';
                    } else if (isSelectedAnswer) {
                      answerClasses += ' incorrect';
                    }

                    return (
                      <div key={idx} className={answerClasses} style={{
                        width: '100%',
                        boxSizing: 'border-box'
                      }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelectedAnswer}
                          disabled={true}
                        />
                        <span className="answer-text">{answer}</span>
                        <span className={`answer-indicator ${isCorrectAnswer ? 'correct' : 'incorrect'}`}>
                          {isCorrectAnswer ? '✓' : '✗'}
                        </span>
                        {isSelectedAnswer && (
                          <span className="selection-indicator">
                            {isCorrectAnswer ? '👍' : '👎'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {cardResults[currentCardIndex]?.evaluationResult !== undefined && (
                  <div className="evaluation-result" style={{ marginTop: '1rem' }}>
                    {cardResults[currentCardIndex]?.evaluationResult === true ? (
                      <div className="correct-evaluation">✅ Correct! Marked as done</div>
                    ) : (
                      <div className="incorrect-evaluation">❌ Incorrect. Review the correct answers above.</div>
                    )}
                  </div>
                )}
              </div>

              {!currentCardAnswered && (
                <div className="box-assignment-buttons" style={{
                  position: 'absolute',
                  bottom: '1rem',
                  left: '1rem',
                  right: '1rem'
                }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBoxAssignment(1); }}
                    className="box-button box-green"
                  >
                    ✅ Box 1
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBoxAssignment(2); }}
                    className="box-button box-yellow"
                  >
                    ⚠️ Box 2
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBoxAssignment(3); }}
                    className="box-button box-red"
                  >
                    ❌ Box 3
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Audio Mode Controls */}
      <div className="audio-controls">
        <button
          onClick={toggleAudioMode}
          className={`audio-toggle-btn ${audioMode ? 'active' : ''}`}
          title={audioMode ? 'Disable Audio Mode' : 'Enable Audio Mode'}
        >
          {audioMode ? '🔊 Audio ON' : '🔇 Audio OFF'}
        </button>

        {audioMode && (
          <>
            <button
              onClick={stopAudio}
              disabled={!isAudioPlaying}
              className="audio-control-btn"
              title="Stop Audio"
            >
              ⏹️ Stop
            </button>

            <div className="audio-delay-control">
              <label>
                Delay: {audioDelay}s
                <input
                  type="range"
                  min="3"
                  max="15"
                  value={audioDelay}
                  onChange={(e) => setAudioDelay(parseInt(e.target.value))}
                  className="audio-delay-slider"
                />
              </label>
            </div>

            {isAudioPlaying && (
              <span className="audio-status">▶️ Playing...</span>
            )}
          </>
        )}
      </div>

      {/* Auto-Play Mode Controls */}
      <div className="autoplay-controls">
        <button
          onClick={toggleAutoPlayMode}
          className={`autoplay-toggle-btn ${autoPlayMode ? 'active' : ''}`}
          title={autoPlayMode ? 'Disable Auto-Play' : 'Enable Auto-Play'}
          disabled={audioMode}
        >
          {autoPlayMode ? '🔄 Auto-Play ON' : '⏸️ Auto-Play OFF'}
        </button>

        {autoPlayMode && (
          <>
            <button
              onClick={stopAutoPlay}
              className="autoplay-control-btn"
              title="Stop Auto-Play"
            >
              ⏹️ Stop
            </button>

            <div className="autoplay-delay-control">
              <label>
                Delay: {autoPlayDelay}s
                <input
                  type="range"
                  min="3"
                  max="15"
                  value={autoPlayDelay}
                  onChange={(e) => setAutoPlayDelay(parseInt(e.target.value))}
                  className="autoplay-delay-slider"
                />
              </label>
            </div>

            <span className="autoplay-status">▶️ Auto-playing...</span>
          </>
        )}

        {audioMode && (
          <span className="mode-info" title="Auto-play is disabled when audio mode is active">
            ℹ️ Disabled during audio mode
          </span>
        )}
      </div>

      <div className="navigation-buttons">
        <button
          onClick={handlePrevious}
          disabled={currentOrderIndex === 0}
          className="nav-button"
        >
          ← Previous
        </button>
        <button
          onClick={handleNext}
          disabled={cardOrder.length === 0}
          className="nav-button"
        >
          {currentOrderIndex === cardOrder.length - 1 ? 'Show Results' : 'Next →'}
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

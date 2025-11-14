import React, { useState, useMemo } from 'react';
import './FlashcardSelector.css';

function FlashcardSelector({ flashcards, onSelect }) {
  const [selectedModule, setSelectedModule] = useState('all');

  // Extrahiere alle verfügbaren Module aus den Metadaten
  const availableModules = useMemo(() => {
    const modulesSet = new Set();
    flashcards.forEach(flashcard => {
      if (flashcard.module && flashcard.module.trim() !== '') {
        modulesSet.add(flashcard.module);
      }
    });
    return Array.from(modulesSet).sort();
  }, [flashcards]);

  // Filtere Flashcards basierend auf dem ausgewählten Modul
  const filteredFlashcards = useMemo(() => {
    if (selectedModule === 'all') {
      return flashcards;
    }
    return flashcards.filter(flashcard => flashcard.module === selectedModule);
  }, [flashcards, selectedModule]);

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
      
      {/* Module Filter Buttons */}
      {availableModules.length > 0 && (
        <div className="topic-filter-section">
          <h3>Filter by Module</h3>
          <div className="topic-buttons">
            <button
              className={`topic-button ${selectedModule === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedModule('all')}
            >
              🔍 All Modules ({flashcards.length})
            </button>
            {availableModules.map(module => (
              <button
                key={module}
                className={`topic-button ${selectedModule === module ? 'active' : ''}`}
                onClick={() => setSelectedModule(module)}
              >
                📚 {module} ({flashcards.filter(f => f.module === module).length})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flashcard-list">
        {filteredFlashcards.map((flashcard) => (
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
                  {flashcard.module && (
                    <span className="topic-badge">📚 {flashcard.module}</span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
      
      {filteredFlashcards.length === 0 && selectedModule !== 'all' && (
        <div className="no-flashcards-filtered">
          <p>No flashcards found for module "{selectedModule}".</p>
        </div>
      )}
    </div>
  );
}

export default FlashcardSelector;

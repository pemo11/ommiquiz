import React, { useState, useMemo } from 'react';
import './FlashcardSelector.css';

function FlashcardSelector({ flashcards, onSelect }) {
  const [selectedModule, setSelectedModule] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

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
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return flashcards.filter(flashcard => {
      if (selectedModule !== 'all' && flashcard.module !== selectedModule) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableFields = [
        flashcard.id,
        flashcard.title,
        flashcard.description,
        flashcard.author,
        flashcard.module,
        flashcard.language,
        flashcard.level
      ];

      if (Array.isArray(flashcard.topics)) {
        searchableFields.push(...flashcard.topics);
      }

      if (Array.isArray(flashcard.keywords)) {
        searchableFields.push(...flashcard.keywords);
      }

      const haystack = searchableFields
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [flashcards, searchQuery, selectedModule]);

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

      <div className="search-section">
        <label htmlFor="flashcard-search">Search by keyword or topic</label>
        <div className="search-input-wrapper">
          <span className="search-icon" aria-hidden="true">🔎</span>
          <input
            id="flashcard-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, description, author, module, topics, or keywords"
          />
        </div>
      </div>

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
                <span className="flashcard-title">
                  {flashcard.title || flashcard.id}
                </span>
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
                  {Array.isArray(flashcard.topics) && flashcard.topics.length > 0 && (
                    <span className="topic-badge">🏷️ {flashcard.topics.join(', ')}</span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
      
      {filteredFlashcards.length === 0 && (
        <div className="no-flashcards-filtered">
          <p>No flashcards match your filters.</p>
          {selectedModule !== 'all' && (
            <p>
              Try clearing the module filter.
            </p>
          )}
          {searchQuery.trim() && <p>Adjust or clear your search query to see more results.</p>}
        </div>
      )}
    </div>
  );
}

export default FlashcardSelector;

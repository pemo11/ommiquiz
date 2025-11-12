import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function AdminPanel({ onBack }) {
  const [flashcards, setFlashcards] = useState([]);
  const [selectedFlashcard, setSelectedFlashcard] = useState(null);
  const [editingFlashcard, setEditingFlashcard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showYamlImport, setShowYamlImport] = useState(false);
  const [yamlInput, setYamlInput] = useState('');
  const [yamlParseError, setYamlParseError] = useState(null);
  // Add state for storing raw string values during typing
  const [topicsInput, setTopicsInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');

  useEffect(() => {
    fetchFlashcardList();
  }, []);

  const fetchFlashcardList = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/flashcards`);
      if (!response.ok) {
        throw new Error('Failed to fetch flashcard list');
      }
      const data = await response.json();
      setFlashcards(data.flashcards);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFlashcard = async (flashcardId) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/flashcards/${flashcardId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch flashcard');
      }
      const data = await response.json();
      setSelectedFlashcard(data);
      setEditingFlashcard({ ...data }); // Create a copy for editing
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createNewFlashcard = () => {
    const newFlashcard = {
      id: '',
      author: '',
      title: '',
      description: '',
      createDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
      language: 'en',
      level: 'beginner',
      topics: [],
      keywords: [],
      flashcards: [
        {
          question: '',
          answer: '',
          type: 'single'
        }
      ]
    };
    
    setSelectedFlashcard(newFlashcard);
    setEditingFlashcard({ ...newFlashcard });
    setIsCreatingNew(true);
    setError(null);
  };

  const createFromYaml = () => {
    setShowYamlImport(true);
    setYamlInput('');
    setYamlParseError(null);
    setError(null);
  };

  const parseYamlInput = () => {
    if (!yamlInput.trim()) {
      setYamlParseError('Please paste your YAML content');
      return;
    }

    try {
      // Simple YAML parser for our flashcard format
      const lines = yamlInput.split('\n');
      const flashcardData = {
        id: '',
        author: '',
        title: '',
        description: '',
        createDate: '',
        language: 'en',
        level: 'beginner',
        topics: [],
        keywords: [],
        flashcards: []
      };

      let currentSection = 'metadata';
      let currentCard = null;
      let currentAnswers = [];
      let indentLevel = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;

        // Detect sections
        if (trimmedLine === 'flashcards:') {
          currentSection = 'flashcards';
          continue;
        }

        if (currentSection === 'metadata') {
          const colonIndex = trimmedLine.indexOf(':');
          if (colonIndex > -1) {
            const key = trimmedLine.substring(0, colonIndex).trim();
            const value = trimmedLine.substring(colonIndex + 1).trim();
            
            if (key === 'topics' || key === 'keywords') {
              if (value === '[]') {
                flashcardData[key] = [];
              } else {
                // Handle array items on following lines
                const items = [];
                for (let j = i + 1; j < lines.length; j++) {
                  const nextLine = lines[j];
                  if (nextLine.trim().startsWith('- ')) {
                    items.push(nextLine.trim().substring(2));
                    i = j;
                  } else if (nextLine.trim() && !nextLine.trim().startsWith(' ')) {
                    break;
                  }
                }
                flashcardData[key] = items;
              }
            } else {
              flashcardData[key] = value;
            }
          }
        }

        if (currentSection === 'flashcards') {
          if (trimmedLine.startsWith('- question:')) {
            // Save previous card if exists
            if (currentCard) {
              if (currentAnswers.length > 0) {
                currentCard.answers = currentAnswers;
                currentCard.type = 'multiple';
              }
              flashcardData.flashcards.push(currentCard);
            }
            
            // Start new card
            currentCard = {
              question: trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1'),
              type: 'single'
            };
            currentAnswers = [];
          } else if (trimmedLine.startsWith('answer:') && currentCard) {
            currentCard.answer = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim().replace(/^"(.*)"$/, '$1');
            currentCard.type = 'single';
          } else if (trimmedLine === 'answers:' && currentCard) {
            currentCard.type = 'multiple';
            currentAnswers = [];
          } else if (trimmedLine.startsWith('- "') && currentCard && currentCard.type === 'multiple') {
            currentAnswers.push(trimmedLine.substring(2).trim().replace(/^"(.*)"$/, '$1'));
          } else if (trimmedLine.startsWith('type:') && currentCard) {
            currentCard.type = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim();
          }
        }
      }

      // Save last card
      if (currentCard) {
        if (currentAnswers.length > 0) {
          currentCard.answers = currentAnswers;
        }
        flashcardData.flashcards.push(currentCard);
      }

      // Validate required fields
      if (!flashcardData.id) {
        throw new Error('Missing required field: id');
      }
      if (!flashcardData.title) {
        throw new Error('Missing required field: title');
      }
      if (!flashcardData.author) {
        throw new Error('Missing required field: author');
      }
      if (flashcardData.flashcards.length === 0) {
        throw new Error('No flashcards found in YAML');
      }

      // Set default createDate if not provided
      if (!flashcardData.createDate) {
        flashcardData.createDate = new Date().toISOString().split('T')[0];
      }

      // Load into editor
      setSelectedFlashcard(flashcardData);
      setEditingFlashcard({ ...flashcardData });
      setIsCreatingNew(true);
      setShowYamlImport(false);
      setYamlParseError(null);
      setError(null);

    } catch (err) {
      setYamlParseError(`Failed to parse YAML: ${err.message}`);
    }
  };

  const cancelYamlImport = () => {
    setShowYamlImport(false);
    setYamlInput('');
    setYamlParseError(null);
  };

  const saveFlashcard = async () => {
    if (!editingFlashcard) return;

    // Validation for new flashcards
    if (isCreatingNew) {
      if (!editingFlashcard.id.trim()) {
        setError('Flashcard ID is required');
        return;
      }
      if (!editingFlashcard.title.trim()) {
        setError('Flashcard title is required');
        return;
      }
      if (!editingFlashcard.author.trim()) {
        setError('Flashcard author is required');
        return;
      }
      if (editingFlashcard.flashcards.length === 0) {
        setError('At least one flashcard is required');
        return;
      }
      
      // Check if any flashcard has empty question or answer
      for (let i = 0; i < editingFlashcard.flashcards.length; i++) {
        const card = editingFlashcard.flashcards[i];
        if (!card.question.trim()) {
          setError(`Question for card ${i + 1} is required`);
          return;
        }
        if (card.type === 'single' && !card.answer?.trim()) {
          setError(`Answer for card ${i + 1} is required`);
          return;
        }
        if (card.type === 'multiple' && (!card.answers || card.answers.length === 0 || card.answers.every(a => !a.trim()))) {
          setError(`At least one answer for card ${i + 1} is required`);
          return;
        }
      }
    }

    try {
      setSaving(true);
      setError(null);

      // Convert the flashcard data to YAML format
      const yamlData = convertToYAML(editingFlashcard);
      
      // Create a blob and form data
      const blob = new Blob([yamlData], { type: 'text/yaml' });
      const formData = new FormData();
      formData.append('file', blob, `${editingFlashcard.id}.yaml`);

      // For existing flashcards, delete the old one if ID changed
      if (!isCreatingNew && selectedFlashcard.id !== editingFlashcard.id) {
        await fetch(`${API_URL}/flashcards/${selectedFlashcard.id}`, {
          method: 'DELETE'
        });
      }

      // Upload the flashcard
      const response = await fetch(`${API_URL}/flashcards/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save flashcard');
      }

      const result = await response.json();
      const actionText = isCreatingNew ? 'created' : 'saved';
      setMessage(`Flashcard ${actionText} successfully!`);
      setSelectedFlashcard({ ...editingFlashcard });
      setIsCreatingNew(false);
      
      // Refresh the flashcard list
      await fetchFlashcardList();
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const convertToYAML = (data) => {
    const yamlLines = [];
    yamlLines.push(`id: ${data.id}`);
    yamlLines.push(`author: ${data.author}`);
    yamlLines.push(`title: ${data.title}`);
    yamlLines.push(`description: ${data.description}`);
    yamlLines.push(`createDate: ${data.createDate}`);
    yamlLines.push(`language: ${data.language}`);
    yamlLines.push(`level: ${data.level}`);
    
    if (data.topics && data.topics.length > 0) {
      yamlLines.push('topics:');
      data.topics.forEach(topic => {
        yamlLines.push(`  - ${topic}`);
      });
    } else {
      yamlLines.push('topics: []');
    }
    
    if (data.keywords && data.keywords.length > 0) {
      yamlLines.push('keywords:');
      data.keywords.forEach(keyword => {
        yamlLines.push(`  - ${keyword}`);
      });
    } else {
      yamlLines.push('keywords: []');
    }
    
    yamlLines.push('');
    yamlLines.push('flashcards:');
    
    data.flashcards.forEach(card => {
      yamlLines.push(`  - question: "${card.question.replace(/"/g, '\\"')}"`);
      if (card.type === 'single') {
        yamlLines.push(`    answer: "${card.answer.replace(/"/g, '\\"')}"`);
      } else {
        yamlLines.push('    answers:');
        card.answers.forEach(answer => {
          yamlLines.push(`      - "${answer.replace(/"/g, '\\"')}"`);
        });
      }
      yamlLines.push(`    type: ${card.type}`);
      yamlLines.push('');
    });
    
    return yamlLines.join('\n');
  };

  const updateFlashcardField = (field, value) => {
    setEditingFlashcard(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Helper function to convert string to array
  const stringToArray = (str) => {
    return str ? str.split(',').map(item => item.trim()).filter(item => item) : [];
  };

  // Helper function to convert array to string
  const arrayToString = (arr) => {
    return arr ? arr.join(', ') : '';
  };

  // Handle topics input changes
  const handleTopicsChange = (e) => {
    setTopicsInput(e.target.value);
  };

  const handleTopicsBlur = () => {
    const topicsArray = stringToArray(topicsInput);
    updateFlashcardField('topics', topicsArray);
  };

  // Handle keywords input changes
  const handleKeywordsChange = (e) => {
    setKeywordsInput(e.target.value);
  };

  const handleKeywordsBlur = () => {
    const keywordsArray = stringToArray(keywordsInput);
    updateFlashcardField('keywords', keywordsArray);
  };

  // Update input states when flashcard changes
  useEffect(() => {
    if (editingFlashcard) {
      setTopicsInput(arrayToString(editingFlashcard.topics));
      setKeywordsInput(arrayToString(editingFlashcard.keywords));
    }
  }, [editingFlashcard?.id]); // Only update when flashcard ID changes (new flashcard loaded)

  const updateCardField = (cardIndex, field, value) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      newFlashcards[cardIndex] = {
        ...newFlashcards[cardIndex],
        [field]: value
      };
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const addNewCard = () => {
    setEditingFlashcard(prev => ({
      ...prev,
      flashcards: [
        ...prev.flashcards,
        {
          question: '',
          answer: '',
          type: 'single'
        }
      ]
    }));
  };

  const deleteCard = (cardIndex) => {
    setEditingFlashcard(prev => ({
      ...prev,
      flashcards: prev.flashcards.filter((_, index) => index !== cardIndex)
    }));
  };

  const addAnswer = (cardIndex) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      if (!newFlashcards[cardIndex].answers) {
        newFlashcards[cardIndex].answers = [];
      }
      newFlashcards[cardIndex].answers.push('');
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const updateAnswer = (cardIndex, answerIndex, value) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      newFlashcards[cardIndex].answers[answerIndex] = value;
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const deleteAnswer = (cardIndex, answerIndex) => {
    setEditingFlashcard(prev => {
      const newFlashcards = [...prev.flashcards];
      newFlashcards[cardIndex].answers = newFlashcards[cardIndex].answers.filter((_, index) => index !== answerIndex);
      return {
        ...prev,
        flashcards: newFlashcards
      };
    });
  };

  const cancelEdit = () => {
    setSelectedFlashcard(null);
    setEditingFlashcard(null);
    setIsCreatingNew(false);
    setError(null);
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <button onClick={onBack} className="back-button">← Back to Quiz</button>
        <h2>🔧 Admin Panel</h2>
      </div>

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
        </div>
      )}

      {!selectedFlashcard && !showYamlImport ? (
        <div className="flashcard-list-section">
          <div className="flashcard-list-header">
            <h3>Manage Flashcards</h3>
            <div className="action-buttons">
              <button onClick={createNewFlashcard} className="create-new-button">
                ➕ Create New Flashcard
              </button>
              <button onClick={createFromYaml} className="import-yaml-button">
                📋 Import from YAML
              </button>
            </div>
          </div>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <h4>Edit Existing Flashcards</h4>
              <div className="admin-flashcard-list">
                {flashcards.map((flashcard) => (
                  <div
                    key={flashcard.id}
                    className="admin-flashcard-item"
                    onClick={() => fetchFlashcard(flashcard.id)}
                  >
                    <span className="flashcard-icon">📝</span>
                    <span className="flashcard-name">{flashcard.id}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : showYamlImport ? (
        <div className="yaml-import-section">
          <div className="yaml-import-header">
            <button onClick={cancelYamlImport} className="back-to-list-button">
              ← Back to List
            </button>
            <h3>Import Flashcard from YAML</h3>
            <button onClick={parseYamlInput} className="parse-yaml-button">
              Parse YAML
            </button>
          </div>

          <div className="yaml-import-content">
            <div className="yaml-instructions">
              <h4>Instructions:</h4>
              <p>Paste your complete YAML flashcard content below. The YAML should include:</p>
              <ul>
                <li><strong>id:</strong> Unique identifier for the flashcard set</li>
                <li><strong>title:</strong> Display name for the flashcard set</li>
                <li><strong>author:</strong> Author name</li>
                <li><strong>description:</strong> Brief description (optional)</li>
                <li><strong>flashcards:</strong> Array of question/answer pairs</li>
              </ul>
            </div>

            {yamlParseError && (
              <div className="error-message">
                <p>Parse Error: {yamlParseError}</p>
              </div>
            )}

            <div className="yaml-input-section">
              <label>YAML Content:</label>
              <textarea
                value={yamlInput}
                onChange={(e) => setYamlInput(e.target.value)}
                placeholder={`Example:
id: my-flashcard-set
author: Your Name
title: My Flashcard Set
description: A collection of learning cards
createDate: 2025-11-12
language: en
level: beginner
topics:
  - topic1
  - topic2
keywords: []

flashcards:
  - question: "What is the capital of France?"
    answer: "Paris"
    type: single
    
  - question: "Name three primary colors"
    answers:
      - "Red"
      - "Blue"
      - "Yellow"
    type: multiple`}
                rows="20"
                className="yaml-textarea"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="editor-section">
          <div className="editor-header">
            <button
              onClick={cancelEdit}
              className="back-to-list-button"
            >
              ← Back to List
            </button>
            <h3>
              {isCreatingNew ? 'Creating New Flashcard' : `Editing: ${selectedFlashcard.id}`}
            </h3>
            <button
              onClick={saveFlashcard}
              disabled={saving}
              className="save-button"
            >
              {saving ? 'Saving...' : (isCreatingNew ? 'Create Flashcard' : 'Save Changes')}
            </button>
          </div>

          {editingFlashcard && (
            <div className="editor-form">
              <div className="metadata-section">
                <h4>Metadata</h4>
                <div className="form-row">
                  <label>ID: <span className="required">*</span></label>
                  <input
                    type="text"
                    value={editingFlashcard.id}
                    onChange={(e) => updateFlashcardField('id', e.target.value)}
                    pattern="^[a-zA-Z0-9_-]+$"
                    placeholder="e.g. my-flashcard-set"
                    disabled={!isCreatingNew}
                  />
                  {isCreatingNew && (
                    <small>ID cannot be changed after creation. Use only letters, numbers, hyphens, and underscores.</small>
                  )}
                </div>
                <div className="form-row">
                  <label>Title: <span className="required">*</span></label>
                  <input
                    type="text"
                    value={editingFlashcard.title}
                    onChange={(e) => updateFlashcardField('title', e.target.value)}
                    placeholder="e.g. My Awesome Flashcards"
                  />
                </div>
                <div className="form-row">
                  <label>Author: <span className="required">*</span></label>
                  <input
                    type="text"
                    value={editingFlashcard.author}
                    onChange={(e) => updateFlashcardField('author', e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="form-row">
                  <label>Description:</label>
                  <textarea
                    value={editingFlashcard.description}
                    onChange={(e) => updateFlashcardField('description', e.target.value)}
                    rows="3"
                  />
                </div>
                <div className="form-row">
                  <label>Language:</label>
                  <select
                    value={editingFlashcard.language}
                    onChange={(e) => updateFlashcardField('language', e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="de">German</option>
                    <option value="fr">French</option>
                    <option value="es">Spanish</option>
                    <option value="it">Italian</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>Level:</label>
                  <select
                    value={editingFlashcard.level}
                    onChange={(e) => updateFlashcardField('level', e.target.value)}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>Topics (comma-separated):</label>
                  <input
                    type="text"
                    value={topicsInput}
                    onChange={handleTopicsChange}
                    onBlur={handleTopicsBlur}
                    placeholder="e.g. programming, web development, javascript"
                  />
                  <small>Separate multiple topics with commas. Example: programming, web development, javascript</small>
                </div>
                <div className="form-row">
                  <label>Keywords (comma-separated):</label>
                  <input
                    type="text"
                    value={keywordsInput}
                    onChange={handleKeywordsChange}
                    onBlur={handleKeywordsBlur}
                    placeholder="e.g. html, css, react, frontend"
                  />
                  <small>Separate multiple keywords with commas. Example: html, css, react, frontend</small>
                </div>
              </div>

              <div className="cards-section">
                <div className="cards-header">
                  <h4>Flashcards ({editingFlashcard.flashcards.length})</h4>
                  <button onClick={addNewCard} className="add-card-button">
                    + Add Card
                  </button>
                </div>

                {editingFlashcard.flashcards.map((card, cardIndex) => (
                  <div key={cardIndex} className="card-editor">
                    <div className="card-header">
                      <span>Card {cardIndex + 1}</span>
                      <button
                        onClick={() => deleteCard(cardIndex)}
                        className="delete-card-button"
                      >
                        🗑️ Delete
                      </button>
                    </div>

                    <div className="form-row">
                      <label>Question:</label>
                      <textarea
                        value={card.question}
                        onChange={(e) => updateCardField(cardIndex, 'question', e.target.value)}
                        rows="2"
                      />
                    </div>

                    <div className="form-row">
                      <label>Type:</label>
                      <select
                        value={card.type}
                        onChange={(e) => {
                          const newType = e.target.value;
                          if (newType === 'single') {
                            updateCardField(cardIndex, 'type', newType);
                            updateCardField(cardIndex, 'answer', card.answers ? card.answers[0] || '' : '');
                            updateCardField(cardIndex, 'answers', undefined);
                          } else {
                            updateCardField(cardIndex, 'type', newType);
                            updateCardField(cardIndex, 'answers', card.answer ? [card.answer] : ['']);
                            updateCardField(cardIndex, 'answer', undefined);
                          }
                        }}
                      >
                        <option value="single">Single Answer</option>
                        <option value="multiple">Multiple Answers</option>
                      </select>
                    </div>

                    {card.type === 'single' ? (
                      <div className="form-row">
                        <label>Answer:</label>
                        <textarea
                          value={card.answer || ''}
                          onChange={(e) => updateCardField(cardIndex, 'answer', e.target.value)}
                          rows="2"
                        />
                      </div>
                    ) : (
                      <div className="answers-section">
                        <div className="answers-header">
                          <label>Answers:</label>
                          <button
                            onClick={() => addAnswer(cardIndex)}
                            className="add-answer-button"
                          >
                            + Add Answer
                          </button>
                        </div>
                        {card.answers && card.answers.map((answer, answerIndex) => (
                          <div key={answerIndex} className="answer-row">
                            <input
                              type="text"
                              value={answer}
                              onChange={(e) => updateAnswer(cardIndex, answerIndex, e.target.value)}
                              placeholder={`Answer ${answerIndex + 1}`}
                            />
                            <button
                              onClick={() => deleteAnswer(cardIndex, answerIndex)}
                              className="delete-answer-button"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
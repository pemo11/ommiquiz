import React, { useState, useEffect } from 'react';
import './App.css';
import FlashcardViewer from './components/FlashcardViewer';
import FlashcardSelector from './components/FlashcardSelector';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function App() {
  const [selectedFlashcard, setSelectedFlashcard] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const handleSelectFlashcard = async (flashcardId) => {
    try {
      setLoading(true);
      console.log('Fetching flashcard:', flashcardId);
      const response = await fetch(`${API_URL}/flashcards/${flashcardId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch flashcard');
      }
      const data = await response.json();
      console.log('Raw data from API:', data);
      
      // Transform YAML data to match FlashcardViewer expectations
      const transformedFlashcard = {
        ...data,
        cards: data.flashcards || [] // Map 'flashcards' array to 'cards'
      };
      
      console.log('Transformed flashcard:', transformedFlashcard);
      console.log('Number of cards:', transformedFlashcard.cards.length);
      
      setSelectedFlashcard(transformedFlashcard);
      setError(null);
    } catch (err) {
      console.error('Error loading flashcard:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedFlashcard(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎓 Ommiquiz</h1>
        <p>Learn with flashcards</p>
      </header>
      
      <main className="App-main">
        {error && (
          <div className="error-message">
            <p>Error: {error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}
        
        {loading && !selectedFlashcard && (
          <div className="loading">Loading...</div>
        )}
        
        {!loading && !selectedFlashcard && !error && (
          <FlashcardSelector
            flashcards={flashcards}
            onSelect={handleSelectFlashcard}
          />
        )}
        
        {selectedFlashcard && (
          <FlashcardViewer
            flashcard={selectedFlashcard}
            onBack={handleBack}
          />
        )}
      </main>
    </div>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import './App.css';
import FlashcardViewer from './components/FlashcardViewer';
import FlashcardSelector from './components/FlashcardSelector';
import AdminPanel from './components/AdminPanel';

// Use the current hostname for API requests to support mobile access
const getApiUrl = () => {
  const hostname = window.location.hostname;
  // If we're in development and hostname is localhost, keep localhost
  // Otherwise, use the current hostname (this allows mobile devices to connect)
  const baseUrl = hostname === 'localhost' ? 'localhost' : hostname;
  return process.env.REACT_APP_API_URL || `http://${baseUrl}:8000/api`;
};

const API_URL = getApiUrl();

function App() {
  const [selectedFlashcard, setSelectedFlashcard] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

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

  const handleAdminToggle = () => {
    setShowAdmin(!showAdmin);
    setSelectedFlashcard(null); // Reset flashcard selection when switching modes
  };

  const handleAdminBack = () => {
    setShowAdmin(false);
    fetchFlashcardList(); // Refresh the list in case changes were made
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div className="header-main">
            <div className="title-with-version">
              <h1>🎓 Ommiquiz</h1>
              <span className="header-version">v1.0.0</span>
            </div>
            <p>Learn with flashcards</p>
          </div>
          <button 
            onClick={handleAdminToggle} 
            className={`admin-toggle-button ${showAdmin ? 'active' : ''}`}
            title={showAdmin ? 'Switch to Quiz Mode' : 'Switch to Admin Mode'}
          >
            {showAdmin ? '🎯 Quiz' : '🔧 Admin'}
          </button>
        </div>
      </header>
      
      <main className="App-main">
        {error && !showAdmin && (
          <div className="error-message">
            <p>Error: {error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        {showAdmin ? (
          <AdminPanel onBack={handleAdminBack} />
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import './App.css';
import FlashcardViewer from './components/FlashcardViewer';
import FlashcardSelector from './components/FlashcardSelector';
import AdminPanel from './components/AdminPanel';

// Use the environment variable first, with proper fallback for development
const getApiUrl = () => {
  // In production, always use the environment variable
  if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // In development, use environment variable if set, otherwise construct local URL
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Development fallback - use current hostname for local development
  const hostname = window.location.hostname;
  const baseUrl = hostname === 'localhost' ? 'localhost' : hostname;
  // Use HTTPS if the current page is served over HTTPS, HTTP for localhost
  const protocol = hostname === 'localhost' ? 'http' : window.location.protocol.replace(':', '');
  const port = hostname === 'localhost' ? ':8080' : '';
  return `${protocol}://${baseUrl}${port}/api`;
};

const API_URL = getApiUrl();

// Add debug logging to help identify connection issues
console.log('Environment:', process.env.NODE_ENV);
console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
console.log('Constructed API_URL:', API_URL);

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
      console.log('Fetching from URL:', `${API_URL}/flashcards`);
      const response = await fetch(`${API_URL}/flashcards`);
      
      // Log response details for debugging
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('Response URL:', response.url);
      
      if (!response.ok) {
        // Try to get the error text instead of JSON
        const errorText = await response.text();
        console.error('Error response text:', errorText);
        throw new Error(`Failed to fetch flashcard list: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Non-JSON response received:', responseText.substring(0, 500) + '...');
        throw new Error(`Server returned non-JSON response. Content-Type: ${contentType}. Response: ${responseText.substring(0, 200)}...`);
      }
      
      const data = await response.json();
      setFlashcards(data.flashcards);
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
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
            <p>Erfolgreich durch das Studium der Medieninformatik</p>
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

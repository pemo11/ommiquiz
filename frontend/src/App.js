import React, { useState, useEffect } from 'react';
import './App.css';
import FlashcardViewer from './components/FlashcardViewer';
import FlashcardSelector from './components/FlashcardSelector';
import AdminPanel from './components/AdminPanel';
import AboutModal from './components/AboutModal';
import { FRONTEND_VERSION } from './version';
import LanguageSelector from './components/LanguageSelector';

// Add debug logging for version number
console.log('🔥 === FRONTEND VERSION DEBUG ===');
console.log('📦 FRONTEND_VERSION from import:', FRONTEND_VERSION);
console.log('🌍 process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('🔧 process.env.REACT_APP_VERSION:', process.env.REACT_APP_VERSION);

// Try to get package.json version directly
try {
  const packageJson = require('../package.json');
  console.log('📋 Package.json version direct:', packageJson.version);
} catch (error) {
  console.log('❌ Could not load package.json directly:', error.message);
}

console.log('✨ Frontend app starting with version:', FRONTEND_VERSION);
console.log('🔥 === END VERSION DEBUG ===');

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
  const [showAbout, setShowAbout] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginEmail, setLoginEmail] = useState('ommi-admin'); // Pre-fill username
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Add password visibility state
  const [loginError, setLoginError] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetchFlashcardList();
  }, []);

  const fetchFlashcardList = async () => {
    try {
      setLoading(true);
      // Add cache-busting parameter to prevent browser caching
      const timestamp = Date.now();
      const url = `${API_URL}/flashcards?_t=${timestamp}`;
      console.log('🔍 === FETCHING FLASHCARD LIST ===');
      console.log('📡 Fetching from URL:', url);
      console.log('⏰ Timestamp:', new Date().toISOString());
      
      const response = await fetch(url, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      // Log response details for debugging
      console.log('📊 Response status:', response.status);
      console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('🔗 Response URL:', response.url);
      
      if (!response.ok) {
        // Try to get the error text instead of JSON
        const errorText = await response.text();
        console.error('❌ ERROR: Response not OK');
        console.error('📄 Error response text:', errorText);
        const errorMessage = `Failed to fetch flashcard list: ${response.status} ${response.statusText} - ${errorText}`;
        console.error('🚨 Throwing error:', errorMessage);
        throw new Error(errorMessage);
      }
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      console.log('📝 Content-Type:', contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('❌ ERROR: Non-JSON response received');
        console.error('📄 Response text (first 500 chars):', responseText.substring(0, 500) + '...');
        const errorMessage = `Server returned non-JSON response. Content-Type: ${contentType}. Response: ${responseText.substring(0, 200)}...`;
        console.error('🚨 Throwing error:', errorMessage);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('🎯 === RAW API RESPONSE ANALYSIS ===');
      console.log('📦 Full response object:', JSON.stringify(data, null, 2));
      console.log('📊 Flashcards array exists:', !!data.flashcards);
      console.log('🔢 Number of flashcards received:', data.flashcards ? data.flashcards.length : 0);
      console.log('📋 Flashcards array type:', Array.isArray(data.flashcards) ? 'Array' : typeof data.flashcards);
      
      // Log each flashcard for debugging with detailed analysis
      if (data.flashcards && Array.isArray(data.flashcards)) {
        console.log('🔍 === INDIVIDUAL FLASHCARD ANALYSIS ===');
        data.flashcards.forEach((card, index) => {
          const cardInfo = {
            index: index + 1,
            id: card.id,
            filename: card.filename,
            module: card.module,
            title: card.title,
            description: card.description,
            cardcount: card.cardcount,
            isEmpty: !card.title && !card.description && !card.module,
            isQueryOptimierung: card.id === 'DBTE_QueryOptimierung'
          };
          
          if (cardInfo.isQueryOptimierung) {
            console.log('🚨 PHANTOM MODULE DETECTED:', cardInfo);
            console.log('🔍 Full phantom card object:', JSON.stringify(card, null, 2));
          } else if (index === 1) {
            console.log(`🎯 POSITION #2 CARD (USER SAYS PHANTOM IS HERE):`, cardInfo);
            console.log('🔍 Full #2 card object:', JSON.stringify(card, null, 2));
          } else {
            console.log(`📇 Flashcard ${cardInfo.index}:`, cardInfo);
          }
        });
        
        // Detailed module counting analysis
        console.log('📊 === MODULE COUNTING ANALYSIS ===');
        const moduleCounts = {};
        const moduleDetails = {};
        
        data.flashcards.forEach((card, index) => {
          const moduleKey = card.module || '[EMPTY_MODULE]';
          
          if (!moduleCounts[moduleKey]) {
            moduleCounts[moduleKey] = 0;
            moduleDetails[moduleKey] = [];
          }
          
          moduleCounts[moduleKey]++;
          moduleDetails[moduleKey].push({
            index: index + 1,
            id: card.id,
            title: card.title || '[NO_TITLE]',
            isEmpty: !card.title && !card.description && !card.module
          });
        });
        
        console.log('🎯 Module counts from API:', moduleCounts);
        console.log('📋 Module details:', moduleDetails);
        
        // Check for empty/phantom modules
        Object.entries(moduleDetails).forEach(([module, cards]) => {
          const emptyCards = cards.filter(card => card.isEmpty);
          if (emptyCards.length > 0) {
            console.log(`🚨 Found ${emptyCards.length} empty/phantom cards in module "${module}":`, emptyCards);
          }
        });
      } else {
        console.error('❌ ERROR: flashcards is not an array:', data.flashcards);
      }
      
      console.log('💾 === SETTING STATE ===');
      console.log('📥 About to set flashcards state with:', data.flashcards);
      setFlashcards(data.flashcards);
      console.log('✅ State updated with flashcards');
      setError(null);
      console.log('✅ Error state cleared');
      
      // Log the state after setting (with a small delay to ensure state is updated)
      setTimeout(() => {
        console.log('🔍 === STATE VERIFICATION ===');
        console.log('📦 Current flashcards state:', flashcards);
        console.log('🔢 Current flashcards count:', flashcards ? flashcards.length : 0);
      }, 100);
      
    } catch (err) {
      console.error('🚨 === FETCH ERROR OCCURRED ===');
      console.error('🔧 Error type:', err.constructor.name);
      console.error('💬 Error message:', err.message);
      console.error('📜 Error stack:', err.stack);
      console.error('🔍 Full error object:', err);
      setError(err.message);
      console.error('💾 Error state set to:', err.message);
    } finally {
      setLoading(false);
      console.log('⏹️ Loading state set to false');
      console.log('🏁 === FETCH COMPLETE ===');
    }
  };

  const handleSelectFlashcard = async (flashcardId) => {
    try {
      setLoading(true);
      console.log('Fetching flashcard:', flashcardId);
      const response = await fetch(`${API_URL}/flashcards/${flashcardId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('The selected flashcard set is not available. It may have been moved or deleted.');
        } else if (response.status >= 500) {
          throw new Error('Server error occurred while loading the flashcard set. Please try again later.');
        } else {
          throw new Error('Unable to load the flashcard set. Please try selecting a different one.');
        }
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

  const handleAboutOpen = () => {
    setShowAbout(true);
  };

  const handleAboutClose = () => {
    setShowAbout(false);
  };

  const handleLoginClick = () => {
    setShowLoginForm(true);
    setLoginError(null);
    setLoginEmail('ommi-admin'); // Ensure username is pre-filled when opening
  };

  const handleLoginClose = () => {
    setShowLoginForm(false);
    setLoginError(null);
    setLoginEmail('ommi-admin'); // Keep username pre-filled
    setLoginPassword('');
    setShowPassword(false); // Reset password visibility
  };

  const handleLoginSubmit = (event) => {
    event.preventDefault();

    if (loginEmail === 'ommi-admin' && loginPassword === 'demo+123') {
      setIsLoggedIn(true);
      setShowLoginForm(false);
      setLoginError(null);
      setLoginEmail('');
      setLoginPassword('');
    } else {
      setLoginError('Invalid email or password.');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div className="header-main">
            <div className="title-with-version">
              <h1>Das große OMMI-Quiz</h1>
              <div className="version-info">v{FRONTEND_VERSION}</div>
            </div>
            <div className="header-actions">
              <button onClick={handleAboutOpen} className="about-btn">
                About
              </button>
              {!showAdmin && (
                <button onClick={isLoggedIn ? handleAdminToggle : handleLoginClick} className="admin-btn">
                  Admin
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error-message">
              <p>⚠️ {error}</p>
            </div>
          )}
        </div>
        <LanguageSelector />
      </header>

      <main className="App-main">
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

      {showLoginForm && (
        <div className="login-overlay" role="dialog" aria-modal="true">
          <div className="login-modal">
            <div className="login-header">
              <h2>Login</h2>
              <button
                className="login-close"
                onClick={handleLoginClose}
                aria-label="Close login form"
              >
                ×
              </button>
            </div>
            <form className="login-form" onSubmit={handleLoginSubmit}>
              <label className="login-label">
                Username
                <input
                  type="text"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="ommi-admin"
                  required
                />
              </label>
              <label className="login-label">
                Password
                <div className="password-input-container">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle-btn"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </label>
              {loginError && <div className="login-error">{loginError}</div>}
              <div className="login-actions">
                <button type="button" className="login-cancel" onClick={handleLoginClose}>
                  Cancel
                </button>
                <button type="submit" className="login-submit">
                  Login
                </button>
              </div>
              <p className="login-hint">Use ommi-admin with password demo+123 to continue.</p>
            </form>
          </div>
        </div>
      )}

      <AboutModal isOpen={showAbout} onClose={handleAboutClose} />
    </div>
  );
}

export default App;

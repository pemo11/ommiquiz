import React, { useState, useEffect } from 'react';
import './App.css';
import FlashcardViewer from './components/FlashcardViewer';
import FlashcardSelector from './components/FlashcardSelector';
import AdminPanel from './components/AdminPanel';
import QuizReport from './components/QuizReport';
import AboutModal from './components/AboutModal';
import MyFlashcards from './components/MyFlashcards';
import { FRONTEND_VERSION } from './version';
import LanguageSelector from './components/LanguageSelector';
import { signIn, signUp, signOut, getSession, onAuthStateChange } from './supabase';

// Add debug logging for version number
console.log('🔥 === FRONTEND VERSION DEBUG ===');
console.log('📦 FRONTEND_VERSION from import:', FRONTEND_VERSION);
console.log('🌍 process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('🔧 process.env.OMMIQUIZ_APP_VERSION:', process.env.OMMIQUIZ_APP_VERSION);

console.log('✨ Frontend app starting with version:', FRONTEND_VERSION);
console.log('🔥 === END VERSION DEBUG ===');

// Use the environment variable first, with proper fallback for development
const getApiUrl = () => {
  // In production, always use the environment variable
  if (process.env.NODE_ENV === 'production' && process.env.OMMIQUIZ_APP_API_URL) {
    return process.env.OMMIQUIZ_APP_API_URL;
  }

  // In development, use environment variable if set, otherwise construct local URL
  if (process.env.OMMIQUIZ_APP_API_URL) {
    return process.env.OMMIQUIZ_APP_API_URL;
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
console.log('OMMIQUIZ_APP_API_URL:', process.env.OMMIQUIZ_APP_API_URL);
console.log('Constructed API_URL:', API_URL);

function App() {
  const [selectedFlashcard, setSelectedFlashcard] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showMyFlashcards, setShowMyFlashcards] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupError, setSignupError] = useState(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [favorites, setFavorites] = useState(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Fetch user profile with admin status
  const fetchUserProfile = async (accessToken) => {
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch user profile:', response.status);
        return null;
      }

      const profile = await response.json();
      console.log('User profile fetched:', profile);
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };

  // Fetch user favorites
  const fetchFavorites = async (accessToken) => {
    try {
      const response = await fetch(`${API_URL}/users/me/favorites`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) return new Set();
      const data = await response.json();
      return new Set(data.favorites.map(f => f.flashcard_id));
    } catch (error) {
      console.error('Error fetching favorites:', error);
      return new Set();
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    checkSession();

    // Subscribe to auth state changes
    const { data: authListener } = onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);

      if (session?.user) {
        setUser(session.user);
        setIsLoggedIn(true);
        // Store token in localStorage for API calls
        localStorage.setItem('authToken', session.access_token);

        // Fetch user profile to get admin status
        const profile = await fetchUserProfile(session.access_token);
        setUserProfile(profile);

        // Fetch user favorites
        const userFavorites = await fetchFavorites(session.access_token);
        setFavorites(userFavorites);
      } else {
        setUser(null);
        setIsLoggedIn(false);
        setUserProfile(null);
        setFavorites(new Set());
        localStorage.removeItem('authToken');
      }
      setAuthLoading(false);
    });

    // Cleanup subscription
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    try {
      const { session } = await getSession();

      if (session?.user) {
        setUser(session.user);
        setIsLoggedIn(true);
        localStorage.setItem('authToken', session.access_token);

        // Fetch user profile to get admin status
        const profile = await fetchUserProfile(session.access_token);
        setUserProfile(profile);

        // Fetch user favorites
        const userFavorites = await fetchFavorites(session.access_token);
        setFavorites(userFavorites);
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  // Toggle favorite for a flashcard
  const toggleFavorite = async (flashcardId) => {
    if (!isLoggedIn || !user) return;

    const isFavorite = favorites.has(flashcardId);

    // Optimistic update
    const newFavorites = new Set(favorites);
    isFavorite ? newFavorites.delete(flashcardId) : newFavorites.add(flashcardId);
    setFavorites(newFavorites);

    try {
      const session = await getSession();
      if (!session) throw new Error('No active session');

      const url = isFavorite
        ? `${API_URL}/users/me/favorites/${flashcardId}`
        : `${API_URL}/users/me/favorites`;

      const options = {
        method: isFavorite ? 'DELETE' : 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      };

      if (!isFavorite) {
        options.body = JSON.stringify({ flashcard_id: flashcardId });
      }

      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Failed to toggle favorite');
    } catch (error) {
      console.error('Error toggling favorite:', error);
      setFavorites(favorites); // Rollback on error
      alert(`Failed to ${isFavorite ? 'remove' : 'add'} favorite. Please try again.`);
    }
  };

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
      
      // Include auth token if available to get user flashcards
      const headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };

      const authToken = localStorage.getItem('authToken');
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, {
        cache: 'no-cache',
        headers: headers
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

  const handleReportBack = () => {
    setShowReport(false);
  };

  const handleMyFlashcardsBack = () => {
    setShowMyFlashcards(false);
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
    setLoginEmail('');
  };

  const handleLoginClose = () => {
    setShowLoginForm(false);
    setLoginError(null);
    setLoginEmail('');
    setLoginPassword('');
    setShowPassword(false);
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginError(null);

    try {
      const { user, session, error } = await signIn(loginEmail, loginPassword);

      if (error) {
        console.error('Login error:', error);
        setLoginError(error.message || 'Invalid email or password.');
        return;
      }

      if (session && user) {
        setUser(user);
        setIsLoggedIn(true);
        setShowLoginForm(false);
        setLoginEmail('');
        setLoginPassword('');

        // Fetch user profile to get admin status
        const profile = await fetchUserProfile(session.access_token);
        setUserProfile(profile);

        console.log('Login successful:', user.email);
      }
    } catch (err) {
      console.error('Unexpected login error:', err);
      setLoginError('An error occurred during login. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await signOut();

      if (error) {
        console.error('Logout error:', error);
        return;
      }

      setUser(null);
      setIsLoggedIn(false);
      setUserProfile(null);
      setShowAdmin(false);
      setShowReport(false);
      localStorage.removeItem('authToken');
      console.log('Logout successful');
    } catch (err) {
      console.error('Unexpected logout error:', err);
    }
  };

  const handleSignupClick = () => {
    setShowSignupForm(true);
    setShowLoginForm(false);
    setSignupError(null);
    setSignupSuccess(false);
    setSignupEmail('');
    setSignupPassword('');
    setSignupConfirmPassword('');
  };

  const handleSignupClose = () => {
    setShowSignupForm(false);
    setSignupError(null);
    setSignupSuccess(false);
    setSignupEmail('');
    setSignupUsername('');
    setSignupPassword('');
    setSignupConfirmPassword('');
    setShowSignupPassword(false);
  };

  const handleSignupSubmit = async (event) => {
    event.preventDefault();
    setSignupError(null);
    setSignupSuccess(false);

    // Validate username
    if (!signupUsername || signupUsername.length < 2 || signupUsername.length > 8) {
      setSignupError('Username must be between 2 and 8 characters');
      return;
    }

    // Validate username contains only alphanumeric characters
    if (!/^[a-zA-Z0-9]+$/.test(signupUsername)) {
      setSignupError('Username can only contain letters and numbers');
      return;
    }

    // Validate passwords match
    if (signupPassword !== signupConfirmPassword) {
      setSignupError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (signupPassword.length < 6) {
      setSignupError('Password must be at least 6 characters long');
      return;
    }

    try {
      const { user, session, error } = await signUp(signupEmail, signupPassword, signupUsername);

      if (error) {
        console.error('Signup error:', error);
        setSignupError(error.message || 'Failed to create account');
        return;
      }

      // Signup successful
      setSignupSuccess(true);
      console.log('Signup successful:', signupEmail);

      // If user is immediately available (auto-confirmed), log them in
      if (session && user) {
        setUser(user);
        setIsLoggedIn(true);
        setTimeout(() => {
          setShowSignupForm(false);
          setSignupEmail('');
          setSignupUsername('');
          setSignupPassword('');
          setSignupConfirmPassword('');
          setSignupSuccess(false);
        }, 2000);
      }
    } catch (err) {
      console.error('Unexpected signup error:', err);
      setSignupError('An error occurred during signup. Please try again.');
    }
  };

  const handleSwitchToLogin = () => {
    setShowSignupForm(false);
    setShowLoginForm(true);
    setSignupError(null);
    setSignupSuccess(false);
  };

  const handleSwitchToSignup = () => {
    setShowLoginForm(false);
    setShowSignupForm(true);
    setLoginError(null);
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
              {isLoggedIn && user && (
                <span className="user-email" title={user.email}>
                  {user.email}
                </span>
              )}

              {/* Login button only for non-authenticated users */}
              {!isLoggedIn && (
                <button onClick={handleLoginClick} className="login-btn">
                  Login
                </button>
              )}

              {/* My Flashcards button for authenticated users */}
              {isLoggedIn && (
                <button
                  onClick={() => setShowMyFlashcards(!showMyFlashcards)}
                  className={showMyFlashcards ? "my-flashcards-btn active" : "my-flashcards-btn"}
                >
                  {showMyFlashcards ? 'Exit My Flashcards' : 'My Flashcards'}
                </button>
              )}

              {/* Admin button only for authenticated admins */}
              {isLoggedIn && userProfile?.is_admin && (
                <button
                  onClick={handleAdminToggle}
                  className={showAdmin ? "admin-btn active" : "admin-btn"}
                >
                  {showAdmin ? 'Exit Admin' : 'Admin'}
                </button>
              )}

              {/* Report button for non-admin users */}
              {isLoggedIn && !userProfile?.is_admin && (
                <button
                  onClick={() => setShowReport(true)}
                  className={showReport ? "report-btn active" : "report-btn"}
                >
                  Report
                </button>
              )}

              {isLoggedIn && (
                <button onClick={handleLogout} className="logout-btn">
                  Logout
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
        ) : showReport ? (
          <QuizReport onBack={handleReportBack} />
        ) : showMyFlashcards ? (
          <MyFlashcards
            apiUrl={API_URL}
            accessToken={localStorage.getItem('authToken')}
            onBack={handleMyFlashcardsBack}
          />
        ) : (
          <>
            {loading && !selectedFlashcard && (
              <div className="loading">Loading...</div>
            )}

            {!loading && !selectedFlashcard && !error && (
              <FlashcardSelector
                flashcards={flashcards}
                onSelect={handleSelectFlashcard}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                showFavoritesOnly={showFavoritesOnly}
                onToggleShowFavorites={setShowFavoritesOnly}
                isLoggedIn={isLoggedIn}
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
                Email
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="your.email@example.com"
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
              <p className="login-hint">
                Don't have an account?{' '}
                <button type="button" className="login-switch-link" onClick={handleSwitchToSignup}>
                  Sign up here
                </button>
              </p>
            </form>
          </div>
        </div>
      )}

      {showSignupForm && (
        <div className="signup-overlay" role="dialog" aria-modal="true">
          <div className="signup-modal">
            <div className="signup-header">
              <h2>Create Account</h2>
              <button
                className="signup-close"
                onClick={handleSignupClose}
                aria-label="Close signup form"
              >
                ×
              </button>
            </div>
            <form className="signup-form" onSubmit={handleSignupSubmit}>
              <label className="signup-label">
                Email
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                />
              </label>
              <label className="signup-label">
                Username (2-8 characters)
                <input
                  type="text"
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value)}
                  placeholder="myusername"
                  minLength={2}
                  maxLength={8}
                  pattern="[a-zA-Z0-9]+"
                  title="Username must be 2-8 characters, letters and numbers only"
                  required
                />
              </label>
              <label className="signup-label">
                Password
                <div className="password-input-container">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="password-toggle-btn"
                    title={showSignupPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSignupPassword ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </label>
              <label className="signup-label">
                Confirm Password
                <div className="password-input-container">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="password-toggle-btn"
                    title={showSignupPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSignupPassword ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </label>
              {signupError && <div className="signup-error">{signupError}</div>}
              {signupSuccess && (
                <div className="signup-success">
                  Account created successfully! {user ? 'Logging you in...' : 'Please check your email to confirm your account.'}
                </div>
              )}
              <div className="signup-actions">
                <button type="button" className="signup-cancel" onClick={handleSignupClose}>
                  Cancel
                </button>
                <button type="submit" className="signup-submit">
                  Sign Up
                </button>
              </div>
              <p className="signup-hint">
                Already have an account?{' '}
                <button type="button" className="signup-switch-link" onClick={handleSwitchToLogin}>
                  Login here
                </button>
              </p>
            </form>
          </div>
        </div>
      )}

      <AboutModal isOpen={showAbout} onClose={handleAboutClose} />
    </div>
  );
}

export default App;

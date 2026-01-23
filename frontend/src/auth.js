/**
 * Authentication service for Ommiquiz frontend
 * Handles all authentication through backend API
 */

// Get API URL
const getApiUrl = () => {
  if (process.env.NODE_ENV === 'production' && process.env.OMMIQUIZ_APP_API_URL) {
    return process.env.OMMIQUIZ_APP_API_URL;
  }
  if (process.env.OMMIQUIZ_APP_API_URL) {
    return process.env.OMMIQUIZ_APP_API_URL;
  }
  const hostname = window.location.hostname;
  const baseUrl = hostname === 'localhost' ? 'localhost' : hostname;
  const protocol = hostname === 'localhost' ? 'http' : window.location.protocol.replace(':', '');
  const port = hostname === 'localhost' ? ':8080' : '';
  return `${protocol}://${baseUrl}${port}/api`;
};

const API_URL = getApiUrl();

/**
 * Sign up a new user with email and password
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @param {string} username - User's username
 * @returns {Promise<{user, session, error}>}
 */
export async function signUp(email, password, username) {
  try {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        username
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        user: null,
        session: null,
        error: {
          message: data.detail || 'Signup failed'
        }
      };
    }

    return {
      user: data.user,
      session: data.session,
      error: null
    };
  } catch (err) {
    return {
      user: null,
      session: null,
      error: {
        message: err.message || 'Network error during signup'
      }
    };
  }
}

/**
 * Sign in an existing user with email and password
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{user, session, error}>}
 */
export async function signIn(email, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        user: null,
        session: null,
        error: {
          message: data.detail || 'Login failed'
        }
      };
    }

    // Store access token in localStorage
    if (data.access_token) {
      localStorage.setItem('authToken', data.access_token);
    }

    return {
      user: data.user,
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        user: data.user
      },
      error: null
    };
  } catch (err) {
    return {
      user: null,
      session: null,
      error: {
        message: err.message || 'Network error during login'
      }
    };
  }
}

/**
 * Sign out the current user
 *
 * @returns {Promise<{error}>}
 */
export async function signOut() {
  try {
    const token = localStorage.getItem('authToken');

    if (token) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    }

    // Clear local storage regardless of API response
    localStorage.removeItem('authToken');

    return { error: null };
  } catch (err) {
    // Always clear local storage even if API call fails
    localStorage.removeItem('authToken');

    return {
      error: {
        message: err.message || 'Logout error'
      }
    };
  }
}

/**
 * Get the current session
 *
 * @returns {Promise<{session, error}>}
 */
export async function getSession() {
  try {
    const token = localStorage.getItem('authToken');

    if (!token) {
      return { session: null, error: null };
    }

    const response = await fetch(`${API_URL}/auth/session`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // Token might be expired or invalid
      localStorage.removeItem('authToken');
      return { session: null, error: null };
    }

    const data = await response.json();

    return {
      session: {
        access_token: token,
        user: data.user
      },
      error: null
    };
  } catch (err) {
    return {
      session: null,
      error: {
        message: err.message || 'Session error'
      }
    };
  }
}

/**
 * Subscribe to authentication state changes
 * Since we're using backend auth, this is a simplified implementation
 *
 * @param {Function} callback - Callback function to handle auth state changes
 * @returns {Object} Subscription object with unsubscribe method
 */
export function onAuthStateChange(callback) {
  // Check session on mount
  getSession().then(({ session }) => {
    if (session) {
      callback('SIGNED_IN', session);
    } else {
      callback('SIGNED_OUT', null);
    }
  });

  // Return unsubscribe function (no-op since we don't have real-time updates)
  return {
    data: {
      subscription: {
        unsubscribe: () => {}
      }
    }
  };
}

/**
 * Get the current access token (JWT)
 *
 * @returns {Promise<string|null>} Access token or null if not authenticated
 */
export async function getAccessToken() {
  return localStorage.getItem('authToken');
}

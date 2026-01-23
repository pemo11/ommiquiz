/**
 * Authentication module using backend API only
 * No Supabase client or credentials needed in frontend
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { user: null, session: null, error };
    }

    const data = await response.json();

    // Store token in localStorage
    if (data.access_token) {
      localStorage.setItem('authToken', data.access_token);
    }

    return {
      user: data.user,
      session: {
        access_token: data.access_token,
        user: data.user,
      },
      error: null,
    };
  } catch (error) {
    console.error('Sign in error:', error);
    return { user: null, session: null, error };
  }
}

/**
 * Sign up with email, password, and username
 */
export async function signUp(email, password, username) {
  try {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, username }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { user: null, session: null, error };
    }

    const data = await response.json();

    // Store token in localStorage
    if (data.access_token) {
      localStorage.setItem('authToken', data.access_token);
    }

    return {
      user: data.user,
      session: {
        access_token: data.access_token,
        user: data.user,
      },
      error: null,
    };
  } catch (error) {
    console.error('Sign up error:', error);
    return { user: null, session: null, error };
  }
}

/**
 * Sign out current user
 */
export async function signOut() {
  try {
    const token = localStorage.getItem('authToken');

    if (token) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    }

    // Clear local storage
    localStorage.removeItem('authToken');

    return { error: null };
  } catch (error) {
    console.error('Sign out error:', error);
    // Still clear token even if API call fails
    localStorage.removeItem('authToken');
    return { error };
  }
}

/**
 * Get current session
 */
export async function getSession() {
  try {
    const token = localStorage.getItem('authToken');

    if (!token) {
      return { session: null, user: null };
    }

    const response = await fetch(`${API_URL}/auth/session`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Token is invalid, clear it
      localStorage.removeItem('authToken');
      return { session: null, user: null };
    }

    const data = await response.json();

    return {
      session: {
        access_token: token,
        user: data.user,
      },
      user: data.user,
    };
  } catch (error) {
    console.error('Get session error:', error);
    return { session: null, user: null };
  }
}

/**
 * Listen to auth state changes (simplified implementation)
 * In the original Supabase client, this would be a real-time listener
 * Here we just check session on mount
 */
export function onAuthStateChange(callback) {
  // Check session immediately
  getSession().then(({ session, user }) => {
    callback('INITIAL_SESSION', session);
  });

  // Return unsubscribe function (no-op in this implementation)
  return {
    data: {
      subscription: {
        unsubscribe: () => {},
      },
    },
  };
}

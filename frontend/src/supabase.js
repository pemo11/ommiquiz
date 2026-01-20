/**
 * Supabase client configuration for Ommiquiz frontend
 *
 * This module initializes the Supabase client with environment variables
 * and provides authentication utilities.
 */

import { createClient } from '@supabase/supabase-js'

// Supabase configuration from environment variables
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// API URL for backend endpoints
const getApiUrl = () => {
  if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  const hostname = window.location.hostname;
  const baseUrl = hostname === 'localhost' ? 'localhost' : hostname;
  const protocol = hostname === 'localhost' ? 'http' : window.location.protocol.replace(':', '');
  const port = hostname === 'localhost' ? ':8080' : '';
  return `${protocol}://${baseUrl}${port}/api`;
};

const API_URL = getApiUrl();

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase configuration. Please set:')
  console.error('  REACT_APP_SUPABASE_URL')
  console.error('  REACT_APP_SUPABASE_ANON_KEY')
}

// Create and export Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

/**
 * Log a login attempt to the backend
 * This is non-blocking - failures won't affect the actual login
 *
 * @param {string} email - User's email address
 * @param {boolean} success - Whether the login was successful
 * @param {string|null} errorMessage - Error message if login failed
 * @param {string|null} accessToken - Access token if login succeeded
 */
async function logLoginAttempt(email, success, errorMessage = null, accessToken = null) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Include auth token for successful logins
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    await fetch(`${API_URL}/auth/log-login`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        email: email,
        success: success,
        error_message: errorMessage
      })
    });
  } catch (error) {
    // Log but don't throw - we don't want to fail the login if logging fails
    console.warn('Failed to log login attempt:', error);
  }
}

/**
 * Sign up a new user with email and password
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{user, session, error}>}
 */
export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username,
        display_name: username
      }
    }
  })

  return { user: data?.user, session: data?.session, error }
}

/**
 * Sign in an existing user with email and password
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{user, session, error}>}
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Log the login attempt (non-blocking)
  logLoginAttempt(
    email,
    !error,
    error?.message || null,
    data?.session?.access_token || null
  );

  return { user: data?.user, session: data?.session, error }
}

/**
 * Sign out the current user
 *
 * @returns {Promise<{error}>}
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

/**
 * Get the current session
 *
 * @returns {Promise<{session, error}>}
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  return { session: data?.session, error }
}

/**
 * Get the current user
 *
 * @returns {Promise<{user, error}>}
 */
export async function getUser() {
  const { data, error } = await supabase.auth.getUser()
  return { user: data?.user, error }
}

/**
 * Subscribe to authentication state changes
 *
 * @param {Function} callback - Callback function to handle auth state changes
 * @returns {Object} Subscription object with unsubscribe method
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}

/**
 * Get the current access token (JWT)
 *
 * @returns {Promise<string|null>} Access token or null if not authenticated
 */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

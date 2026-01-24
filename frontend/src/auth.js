/**
 * Authentication module using modern Supabase client-side authentication
 */

import { createClient } from '@supabase/supabase-js'

// Get Supabase configuration from environment
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://zihxfkwzlxgpppzddfyb.supabase.co'
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_06GTeAb6I9QWgNTOCH0LKw_H_4lzXnP'

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('Sign in error:', error)
      return { user: null, session: null, error }
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    }
  } catch (error) {
    console.error('Sign in error:', error)
    return { user: null, session: null, error }
  }
}

/**
 * Sign up with email, password, and username
 */
export async function signUp(email, password, username) {
  try {
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

    if (error) {
      console.error('Sign up error:', error)
      return { user: null, session: null, error }
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    }
  } catch (error) {
    console.error('Sign up error:', error)
    return { user: null, session: null, error }
  }
}

/**
 * Sign out current user
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('Sign out error:', error)
      return { error }
    }

    return { error: null }
  } catch (error) {
    console.error('Sign out error:', error)
    return { error }
  }
}

/**
 * Get current session
 */
export async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession()
    
    if (error) {
      console.error('Get session error:', error)
      return { session: null, user: null }
    }

    return {
      session: data.session,
      user: data.session?.user || null,
    }
  } catch (error) {
    console.error('Get session error:', error)
    return { session: null, user: null }
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })

  return data
}

// Export the supabase client for other uses
export { supabase }

// This file exports the frontend version
// The version MUST be set using the REACT_APP_VERSION environment variable
// No default value to ensure configuration errors are detected early

if (!process.env.REACT_APP_VERSION) {
  throw new Error('REACT_APP_VERSION environment variable is not set. Please check your .env file.');
}

export const FRONTEND_VERSION = process.env.REACT_APP_VERSION;

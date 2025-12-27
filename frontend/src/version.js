import packageJson from '../package.json';

// This file exports the frontend version from package.json
// The version can be overridden using the REACT_APP_VERSION environment variable
export const FRONTEND_VERSION = process.env.REACT_APP_VERSION || packageJson.version;

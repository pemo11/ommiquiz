import packageJson from '../package.json';

// Version updated to 1.0.6 - Force cache refresh
export const FRONTEND_VERSION = process.env.REACT_APP_VERSION || packageJson.version;

import packageJson from '../package.json';

export const FRONTEND_VERSION = process.env.REACT_APP_VERSION || packageJson.version;

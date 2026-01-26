#!/usr/bin/env node
/**
 * Custom start script for Create React App development server
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting development server...\n');

// Get the path to react-scripts
const reactScriptsPath = path.resolve(__dirname, '../node_modules/.bin/react-scripts');

// Spawn react-scripts start
const child = spawn(reactScriptsPath, ['start'], {
  env: { ...process.env },
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code);
});

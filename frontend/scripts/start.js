#!/usr/bin/env node
/**
 * Custom start script for Create React App development server
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Read version from root version.json
let version = '1.0.0';
try {
  const versionPath = path.resolve(__dirname, '../../version.json');
  if (fs.existsSync(versionPath)) {
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    version = versionData.frontend || '1.0.0';
  }
} catch (error) {
  console.warn('⚠️  Could not read version.json, using default 1.0.0');
}

console.log('🚀 Starting development server... (version: ' + version + ')\n');

// Get the path to react-scripts
const reactScriptsPath = path.resolve(__dirname, '../node_modules/.bin/react-scripts');

// Spawn react-scripts start
const child = spawn(reactScriptsPath, ['start'], {
  env: { 
    ...process.env,
    OMMIQUIZ_APP_VERSION: version
  },
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code);
});

#!/usr/bin/env node
/**
 * Custom start script that maps OMMIQUIZ_APP_* environment variables to REACT_APP_*
 * This allows us to use a consistent naming convention while working with Create React App
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Read .env file
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

// Parse environment variables
const envVars = {};
envContent.split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;

  const match = line.match(/^(OMMIQUIZ_APP_[^=]+)=(.*)$/);
  if (match) {
    const key = match[1];
    const value = match[2].replace(/^['"]|['"]$/g, ''); // Remove quotes

    // Map OMMIQUIZ_APP_* to REACT_APP_*
    const reactKey = key.replace('OMMIQUIZ_APP_', 'REACT_APP_');
    envVars[reactKey] = value;

    console.log(`✓ Mapped ${key} → ${reactKey}`);
  }
});

console.log('\n🚀 Starting development server with OMMIQUIZ_APP_ variables...\n');

// Get the path to react-scripts
const reactScriptsPath = path.resolve(__dirname, '../node_modules/.bin/react-scripts');

// Spawn react-scripts start with mapped environment variables
const child = spawn(reactScriptsPath, ['start'], {
  env: { ...process.env, ...envVars },
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code);
});

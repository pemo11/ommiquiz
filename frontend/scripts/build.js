#!/usr/bin/env node
/**
 * Custom build script for Create React App
 * Runs react-scripts build with CI=false to treat warnings as warnings
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🏗️  Building production bundle...\n');

// Get the path to react-scripts
const reactScriptsPath = path.resolve(__dirname, '../node_modules/.bin/react-scripts');

// Spawn react-scripts build
const child = spawn(reactScriptsPath, ['build'], {
  env: {
    ...process.env,
    CI: 'false' // Treat warnings as warnings, not errors
  },
  stdio: 'inherit'
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log('\n✅ Build completed successfully!');
  } else {
    console.error('\n❌ Build failed with exit code:', code);
  }
  process.exit(code);
});

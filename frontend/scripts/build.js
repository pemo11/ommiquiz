#!/usr/bin/env node
/**
 * Custom build script for Create React App
 * Runs react-scripts build with CI=false to treat warnings as warnings
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
    version = versionData.version || versionData.frontend || '1.0.0';
  }
} catch (error) {
  console.warn('⚠️  Could not read version.json, using default 1.0.0');
}

console.log('🏗️  Building production bundle... (version: ' + version + ')\n');

// Get the path to react-scripts
const reactScriptsPath = path.resolve(__dirname, '../node_modules/.bin/react-scripts');

// Spawn react-scripts build
const child = spawn(reactScriptsPath, ['build'], {
  env: {
    ...process.env,
    CI: 'false', // Treat warnings as warnings, not errors
    OMMIQUIZ_APP_VERSION: version
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

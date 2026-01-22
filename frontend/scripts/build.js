#!/usr/bin/env node
/**
 * Custom build script that maps OMMIQUIZ_APP_* environment variables to REACT_APP_*
 * This allows us to use a consistent naming convention while working with Create React App
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine which .env file to use based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
const envPath = path.resolve(__dirname, '../', envFile);
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

console.log(`📄 Reading environment from: ${envFile}`);

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

console.log('\n🏗️  Building production bundle with OMMIQUIZ_APP_ variables...\n');

// Get the path to react-scripts
const reactScriptsPath = path.resolve(__dirname, '../node_modules/.bin/react-scripts');

// Spawn react-scripts build with mapped environment variables
const child = spawn(reactScriptsPath, ['build'], {
  env: {
    ...process.env,
    ...envVars,
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

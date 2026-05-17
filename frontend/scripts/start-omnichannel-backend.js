#!/usr/bin/env node

/**
 * OmniChat Backend Migration & Auto-Start Script
 * Khởi động OmniChat API server và sync config files
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting OmniChat Backend Setup...\n');

// Paths
const pluginDir = path.join(process.env.HAGENT_HOME || '~', '.hagent', 'plugins', 'platforms', 'omnichannel');
const frontendRoot = process.cwd();

// Check if backend exists
const backendPath = path.join(pluginDir, 'backend');

if (!fs.existsSync(backendPath)) {
  console.log('❌ OmniChat backend not found! Running init...\n');
  execSync(`cd ${pluginDir} && bash init.sh`, { stdio: 'inherit' });
} else {
  console.log('✅ OmniChat backend already initialized\n');
}

// Create frontend config directory if needed
const configDir = path.join(frontendRoot, 'config', 'omnichannel');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

console.log('📝 Syncing configuration files...\n');

// Copy .env from plugin backend to frontend config
const envPath = path.join(pluginDir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  fs.writeFileSync(path.join(configDir, '.env'), envContent);
  console.log('✅ Copied .env configuration');
}

// Copy backend directory to frontend
const backendDest = path.join(frontendRoot, 'backend');
if (!fs.existsSync(backendDest)) {
  const command = `cp -r ${pluginDir}/backend/* ${frontendRoot}/`;
  console.log(`📦 Copying backend files...`);
  execSync(command, { stdio: 'inherit' });
}

console.log('\n🚀 Starting OmniChat API server...');

// Start the backend server
const serverCommand = `cd ${backendPath} && npx -y @hono/node-server ./api_server.ts`;
execSync(serverCommand, { 
  stdio: 'inherit',
  cwd: frontendRoot
});

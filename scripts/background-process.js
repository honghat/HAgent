#!/usr/bin/env node

/**
 * Background Process Script
 *
 * Example of running a script as a background process with notifications.
 * Similar to hermes-agent's: terminal(background=true, notify_on_complete=true)
 */

import { spawn } from 'child_process';
import fs from 'fs';

const task_id = `bg_${Date.now()}`;
const script_path = process.argv[2];

// Ensure home directory exists
const homeDir = process.env.HERMES_HOME || process.env.HOME;
if (!fs.existsSync(homeDir)) {
  console.error(`Home directory does not exist: ${homeDir}`);
  process.exit(1);
}

console.log(`Starting background task: ${task_id}`);
console.log(`Script: ${script_path}`);

// Create log file
const logFile = `${homeDir}/logs/${task_id}.log`;
const mkdir = require('fs').mkdirSync;
const mkdirSync = mkdir;
try {
  mkdirSync(`${homeDir}/logs`, { recursive: true });
} catch (e) {}

// Start process
const proc = spawn('node', [script_path], {
  cwd: homeDir,
  env: process.env,
  stdio: 'inherit'
});

// Track process for notifications
let hasNotified = false;

proc.on('close', code => {
  const timestamp = new Date().toISOString();

  // Log completion
  console.log(`\n✅ Task completed with exit code ${code}`);

  // Write to log file
  try {
    fs.appendFileSync(logFile, `\n---\nCompleted at ${timestamp}\nExit code: ${code}`);
  } catch (e) {}

  // Send notification via Telegram if configured
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_HOME_CHANNEL_ID;

  if (botToken && channelId) {
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: `✅ Task completed\nID: ${task_id}\nExit code: ${code}`,
        parse_mode: 'MarkdownV2'
      })
    }).catch(console.error);
  }

  // Notify via stdout (for terminal watching)
  if (!hasNotified) {
    console.log(`[NOTIFICATION] Background task '${task_id}' completed`);
    hasNotified = true;
  }
});

proc.on('error', error => {
  console.error(`❌ Task failed: ${error.message}`);

  // Write to log file
  try {
    fs.appendFileSync(logFile, `\n---\nFailed at ${new Date().toISOString()}\nError: ${error.message}`);
  } catch (e) {}

  // Send failure notification
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_HOME_CHANNEL_ID;

  if (botToken && channelId) {
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: `❌ Task failed\nID: ${task_id}\nError: ${error.message}`,
        parse_mode: 'MarkdownV2'
      })
    }).catch(console.error);
  }

  // Notify via stdout
  if (!hasNotified) {
    console.log(`[NOTIFICATION] Background task '${task_id}' failed`);
    hasNotified = true;
  }
});

// Cleanup log file after 1 hour
setTimeout(() => {
  try {
    fs.unlinkSync(logFile);
    console.log('Log file cleaned up');
  } catch (e) {}
}, 3600 * 1000);

console.log(`Task running. Log: ${logFile}`);

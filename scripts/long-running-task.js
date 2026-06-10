#!/usr/bin/env node

/**
 * Long-Running Task Example
 *
 * Demonstrates how to run a long-running task with:
 * - Background process monitoring
 * - Background notifications
 * - Session persistence
 * - Tool calling for complex workflows
 *
 * Inspired by: hagent-agent's terminal(background=true, notify_on_complete=true)
 */

import { HAgent } from '../backend-loop.js';
import scheduler from '../cron-scheduler.js';
import { setupBackgroundNotifications } from '../model-tools.js';
import * as fs from 'fs';

// Configuration
const HOME_CHANNEL_ID = process.env.TELEGRAM_HOME_CHANNEL_ID || '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Initialize agent
const agent = new HAgent({
  model: 'claude-3-5-sonnet-20241022',
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxIterations: 20
});

/**
 * Example: Run a long-running code analysis task
 */
async function runLongRunningTask() {
  console.log('Starting long-running task...');

  // Set up background notifications
  setupBackgroundNotifications({
    off: false,
    result: true
  });

  const taskId = `analysis_${Date.now()}`;

  // Register the task in scheduler
  scheduler.add({
    id: taskId,
    name: 'Code Analysis',
    schedule: '0 0 * * *', // Daily at midnight
    command: `node scripts/long-running-task.js`,
    enabled: true,
    notificationOnComplete: true
  });

  try {
    // Simulate a long-running task with multiple steps
    const steps = [
      { name: 'Step 1: Analyzing file structure', duration: 2000 },
      { name: 'Step 2: Searching dependencies', duration: 3000 },
      { name: 'Step 3: Reviewing code patterns', duration: 4000 }
    ];

    for (const step of steps) {
      console.log(`\n${step.name}`);

      // Wait for step duration (simulated)
      await new Promise(resolve => setTimeout(resolve, step.duration));

      // Append progress to session
      agent.sessionDb.setConfig('progress', `Completed: ${step.name}`);
    }

    // Notify completion via Telegram if available
    if (BOT_TOKEN && HOME_CHANNEL_ID) {
      console.log('\n✅ Task completed! Notifying...');

      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: HOME_CHANNEL_ID,
          text: `✅ Task completed:\n\nCode Analysis finished.\nTotal duration: ~9 seconds`
        })
      });

      const result = await response.json();
      console.log('Telegram notification sent:', result.ok ? 'Success' : 'Failed');
    }

    console.log('\n📝 Results saved to session');

  } catch (error) {
    console.error('Task failed:', error.message);

    // Notify failure via Telegram
    if (BOT_TOKEN && HOME_CHANNEL_ID) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: HOME_CHANNEL_ID,
          text: `❌ Task failed:\n\n${error.message}`
        })
      });
    }
  }

  // Cleanup
  scheduler.remove(taskId);
}

/**
 * Example: Run analysis on a file path
 */
async function analyzeFilePath(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const stat = fs.statSync(filePath);
  console.log(`Analyzing: ${filePath} (${stat.size} bytes)`);

  // In a real implementation, this would use tools like file_read, web_search, etc.

  // Save results to session
  agent.sessionDb.setConfig('analysis_result', `Analyzed ${filePath}`);
}

// Run the task
runLongRunningTask().catch(console.error);

import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execAsync = promisify(exec);

/**
 * Mở terminal và chạy lệnh claude với plugin telegram từ thư mục HAgent
 */
export async function openClaudeTelegram() {
  try {
    const projectRoot = resolve(import.meta.dirname, '../../../..');
    const initialPrompt = "Calling plugin:telegram:telegram";
    
    const command = `osascript -e 'tell application "Terminal"
      activate
      do script "export TELEGRAM_BOT_TOKEN=\\"TELEGRAM_BOT_TOKEN_OLD_PLACEHOLDER\\" && export ANTHROPIC_MODEL=\\"qwen3.5:latest\\" && cd \\"${projectRoot}\\" && claude \\"${initialPrompt}\\" --channels plugin:telegram@claude-plugins-official"
    end tell'`;
    await execAsync(command);
    return '✅ Đã mở Terminal và đang chạy Claude Code (Qwen) với plugin Telegram.';
  } catch (error) {
    return `❌ Lỗi khi mở Terminal: ${error.message}`;
  }
}

/**
 * Mở terminal và chạy lệnh claude với model DeepSeek
 */
export async function openClaudeDeepSeek() {
  try {
    const projectRoot = resolve(import.meta.dirname, '../../../..');
    const initialPrompt = "Calling plugin:telegram:telegram";
    
    const command = `osascript -e 'tell application "Terminal"
      activate
      do script "export TELEGRAM_BOT_TOKEN=\\"TELEGRAM_BOT_TOKEN_OLD_PLACEHOLDER\\" && export ANTHROPIC_MODEL=\\"deepseek-v4-flash\\" && cd \\"${projectRoot}\\" && claude \\"${initialPrompt}\\" --channels plugin:telegram@claude-plugins-official"
    end tell'`;
    await execAsync(command);
    return '✅ Đã mở Terminal và đang chạy Claude Code (DeepSeek) với plugin Telegram.';
  } catch (error) {
    return `❌ Lỗi khi mở Terminal: ${error.message}`;
  }
}

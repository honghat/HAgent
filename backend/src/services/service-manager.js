import { execSync, exec } from 'node:child_process';
import dotenv from 'dotenv';
dotenv.config({ override: true });
import db from '../db.js';

const REMOTE_HOST = process.env.SSH_REMOTE_HOST || '100.69.50.64';
const REMOTE_USER = process.env.SSH_REMOTE_USER || 'hatnguyen';
const REMOTE_PWD = process.env.SSH_PASSWORD;

/**
 * Điều khiển các dịch vụ LLM trên máy Remote (Linux) và Local (Mac)
 */
export async function controlService(service, userId) {
  if (!REMOTE_PWD) throw new Error('Chưa cấu hình SSH_PASSWORD trong .env');

  const baseSSH = `sshpass -p '${REMOTE_PWD}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${REMOTE_USER}@${REMOTE_HOST}`;
  let cmd = '';
  let message = '';
  let providerToSet = null;

  switch (service) {
    case 'lmstudio':
      cmd = `${baseSSH} 'sudo systemctl stop ollama && systemctl --user stop llamacpp.service && systemctl --user start lmstudio.service'`;
      message = '🚀 Đã bật LM Studio (Remote) và tắt các dịch vụ khác.';
      providerToSet = 'lmstudio';
      break;

    case 'ollama':
      cmd = `${baseSSH} 'systemctl --user stop lmstudio.service && systemctl --user stop llamacpp.service && sudo systemctl start ollama'`;
      message = '🦙 Đã bật Ollama (Remote) và tắt các dịch vụ khác.';
      providerToSet = 'ollama';
      break;

    case 'llamacpp':
      cmd = `${baseSSH} 'sudo systemctl stop ollama && systemctl --user stop lmstudio.service && systemctl --user start llamacpp.service'`;
      message = '🏗️ Đã bật Llama-cpp (Port 8080) và tắt các dịch vụ khác.';
      providerToSet = 'ollama'; // llama-cpp often uses openai-compatible on 8080 or custom
      break;

    case 'off':
      cmd = `${baseSSH} 'sudo systemctl stop ollama && systemctl --user stop lmstudio.service && systemctl --user stop llamacpp.service'`;
      message = '🛑 Đã tắt tất cả dịch vụ AI trên Remote.';
      break;

    case 'fixrdp':
      cmd = `${baseSSH} "sudo systemctl stop xrdp; sudo pkill -9 -f xorgxrdp || true; sudo rm -rf /tmp/.X11-unix/X*; sudo systemctl start xrdp"`;
      message = '🛠️ Đã thực hiện siêu cứu hộ RDP thành công. Bạn hãy kết nối lại sau 5 giây.';
      break;

    case 'lmstudio_local':
      return new Promise((resolve, reject) => {
        exec('open -a "LM Studio"', (err) => {
          if (err) return reject(new Error(`Lỗi bật Local: ${err.message}`));
          
          if (userId) {
             updateUserProvider(userId, 'lmstudio_local');
          }
          resolve({ ok: true, message: '💻 Đã bật LM Studio trên máy Mac (Local).', provider: 'lmstudio_local' });
        });
      });

    default:
      throw new Error(`Dịch vụ không hợp lệ: ${service}`);
  }

  if (cmd) {
    execSync(cmd, { timeout: 60000 });
    if (userId && providerToSet) {
      updateUserProvider(userId, providerToSet);
    }
    return { ok: true, message, provider: providerToSet };
  }
}

function updateUserProvider(userId, provider) {
  try {
    // Ensure user exists (for Telegram users hitting this endpoint)
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(userId, `tg_${userId}`, 'tg_token_dummy');
    }

    // Ensure tg-last session exists
    const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get('tg-last');
    if (!session) {
      db.prepare('INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)').run('tg-last', userId, 'Telegram Session');
    }

    // Insert a dummy assistant message to trigger provider switch in history-based logic
    db.prepare('INSERT INTO messages (id, session_id, user_id, role, content, provider) VALUES (?, ?, ?, ?, ?, ?)').run(
      `sys-${Date.now()}`, `tg-last`, userId, 'assistant', `✅ Đã chuyển cấu hình sang: ${provider}`, provider
    );
    
    // Also update user default if available
    db.prepare('UPDATE users SET default_provider = ? WHERE id = ?').run(provider, userId);
  } catch (e) {
    // Silently handle if there are still constraint issues to avoid console spam
  }
}

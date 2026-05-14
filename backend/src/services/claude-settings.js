import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SETTINGS_PATH = '/Users/nguyenhat/.claude/settings.json';

export const CLAUDE_PROXY_CONFIGS = {
  deepseek: {
    label: 'DeepSeek Proxy',
    baseURL: 'https://api.deepseek.com/anthropic',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    apiKey: process.env.DEEPSEEK_API_KEY || 'DEEPSEEK_API_KEY_PLACEHOLDER',
    settingsJson: {
      model: 'opus',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        ANTHROPIC_API_KEY: process.env.DEEPSEEK_API_KEY || 'DEEPSEEK_API_KEY_PLACEHOLDER',
        ANTHROPIC_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        ANTHROPIC_AUTH_TOKEN: process.env.DEEPSEEK_API_KEY || 'DEEPSEEK_API_KEY_PLACEHOLDER',
      },
      apiBaseUrl: 'https://api.deepseek.com/anthropic',
    },
  },
  ollama: {
    label: 'Ollama Remote Proxy',
    baseURL: process.env.CLAUDE_OLLAMA_URL || 'http://100.69.50.64:11434',
    model: process.env.CLAUDE_OLLAMA_MODEL || 'qwen',
    apiKey: 'xxx',
    settingsJson: {
      model: 'opus',
      env: {
        ANTHROPIC_BASE_URL: process.env.CLAUDE_OLLAMA_URL || 'http://100.69.50.64:11434',
        ANTHROPIC_API_KEY: 'xxx',
        ANTHROPIC_MODEL: process.env.CLAUDE_OLLAMA_MODEL || 'qwen',
        ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.CLAUDE_OLLAMA_MODEL || 'qwen',
        ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.CLAUDE_OLLAMA_MODEL || 'qwen',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.CLAUDE_OLLAMA_MODEL || 'qwen',
        ANTHROPIC_AUTH_TOKEN: 'xxx',
      },
      apiBaseUrl: process.env.CLAUDE_OLLAMA_URL || 'http://100.69.50.64:11434',
    },
  },
  lmstudio: {
    label: 'LM Studio Remote Proxy',
    baseURL: process.env.CLAUDE_LM_STUDIO_URL || 'http://100.69.50.64:1234',
    model: process.env.CLAUDE_LM_STUDIO_MODEL || 'qwen/qwen3.5-9b',
    apiKey: 'xxx',
    settingsJson: {
      model: 'opus',
      env: {
        ANTHROPIC_BASE_URL: process.env.CLAUDE_LM_STUDIO_URL || 'http://100.69.50.64:1234',
        ANTHROPIC_API_KEY: 'xxx',
        ANTHROPIC_MODEL: process.env.CLAUDE_LM_STUDIO_MODEL || 'qwen/qwen3.5-9b',
        ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.CLAUDE_LM_STUDIO_MODEL || 'qwen/qwen3.5-9b',
        ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.CLAUDE_LM_STUDIO_MODEL || 'qwen/qwen3.5-9b',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.CLAUDE_LM_STUDIO_MODEL || 'qwen/qwen3.5-9b',
        ANTHROPIC_AUTH_TOKEN: 'xxx',
      },
      apiBaseUrl: process.env.CLAUDE_LM_STUDIO_URL || 'http://100.69.50.64:1234',
    },
  },
  llamacpp: {
    label: 'Llama-cpp Remote Proxy',
    baseURL: process.env.CLAUDE_LLAMACPP_URL || 'http://100.69.50.64:8080',
    model: process.env.CLAUDE_LLAMACPP_MODEL || 'google/gemma-4-e4b',
    apiKey: 'xxx',
    settingsJson: {
      model: 'opus',
      env: {
        ANTHROPIC_BASE_URL: process.env.CLAUDE_LLAMACPP_URL || 'http://100.69.50.64:8080',
        ANTHROPIC_API_KEY: 'xxx',
        ANTHROPIC_MODEL: process.env.CLAUDE_LLAMACPP_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.CLAUDE_LLAMACPP_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.CLAUDE_LLAMACPP_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.CLAUDE_LLAMACPP_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_AUTH_TOKEN: 'xxx',
      },
      apiBaseUrl: process.env.CLAUDE_LLAMACPP_URL || 'http://100.69.50.64:8080',
    },
  },
  lmstudio_local: {
    label: 'LM Studio Local Proxy',
    baseURL: process.env.CLAUDE_LM_STUDIO_LOCAL_URL || 'http://localhost:1234',
    model: process.env.CLAUDE_LM_STUDIO_LOCAL_MODEL || 'google/gemma-4-e4b',
    apiKey: 'xxx',
    settingsJson: {
      model: 'opus',
      env: {
        ANTHROPIC_BASE_URL: process.env.CLAUDE_LM_STUDIO_LOCAL_URL || 'http://localhost:1234',
        ANTHROPIC_API_KEY: 'xxx',
        ANTHROPIC_MODEL: process.env.CLAUDE_LM_STUDIO_LOCAL_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.CLAUDE_LM_STUDIO_LOCAL_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.CLAUDE_LM_STUDIO_LOCAL_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.CLAUDE_LM_STUDIO_LOCAL_MODEL || 'google/gemma-4-e4b',
        ANTHROPIC_AUTH_TOKEN: 'xxx',
      },
      apiBaseUrl: process.env.CLAUDE_LM_STUDIO_LOCAL_URL || 'http://localhost:1234',
    },
  },
};

export function readSettingsFile() {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[ClaudeSettings] Error reading settings.json:', e.message);
  }
  return {};
}

export function writeSettingsFile(data) {
  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[ClaudeSettings] Error writing settings.json:', e.message);
    return false;
  }
}

export function applyClaudeMode(mode) {
  const config = CLAUDE_PROXY_CONFIGS[mode];
  if (!config) return { ok: false, error: 'Invalid mode' };

  const current = readSettingsFile();
  const update = config.settingsJson;

  // Merge: keep existing top-level fields, override with config
  const merged = { ...current, ...update, env: { ...current.env, ...update.env } };
  merged.hasCompletedOnboarding = current.hasCompletedOnboarding || true;

  const ok = writeSettingsFile(merged);
  return { ok, mode, label: config.label };
}

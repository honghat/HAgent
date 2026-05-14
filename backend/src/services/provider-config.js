import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Central configuration for all LLM providers.
 * Similar to how Claude Proxy is configured.
 */
export const PROVIDER_CONFIGS = {
  deepseek: {
    name: 'deepseek',
    label: 'DeepSeek',
    type: 'openai',
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  ollama: {
    name: 'ollama',
    label: 'Ollama (Remote)',
    type: 'openai',
    baseURL: process.env.OLLAMA_URL || 'http://100.69.50.64:11434/v1',
    apiKey: 'ollama',
    model: process.env.OLLAMA_MODEL || 'qwen3.5:4b',
  },
  lmstudio: {
    name: 'lmstudio',
    label: 'LM Studio (Remote)',
    type: 'openai',
    baseURL: process.env.LM_STUDIO_URL || 'http://100.69.50.64:1234/v1',
    apiKey: 'lmstudio',
    model: process.env.LM_STUDIO_MODEL || 'google/gemma-4-e4b',
  },
  llamacpp: {
    name: 'llamacpp',
    label: 'Llama.cpp (Remote)',
    type: 'openai',
    baseURL: process.env.LLAMACPP_URL || 'http://100.69.50.64:8080/v1',
    apiKey: 'llamacpp',
    model: process.env.LLAMACPP_MODEL || 'qwen',
  },
  lmstudio_local: {
    name: 'lmstudio_local',
    label: 'LM Studio (Local)',
    type: 'openai',
    baseURL: process.env.LM_STUDIO_URL2 || 'http://localhost:1234/v1',
    apiKey: 'lmstudio',
    model: process.env.LM_STUDIO_MODEL_LOCAL || 'google/gemma-4-e4b',
  },
  cx: {
    name: 'cx',
    label: 'CX GPT-5.5',
    type: 'openai',
    baseURL: process.env.CX_BASE_URL || 'http://localhost:20128/v1',
    apiKey: process.env.CX_API_KEY || 'cx',
    model: process.env.CX_MODEL || 'cx/gpt-5.5',
  },
  gemini: {
    name: 'gemini',
    label: 'Gemini',
    type: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
  openai: {
    name: 'openai',
    label: 'OpenAI',
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },
  anthropic: {
    name: 'anthropic',
    label: 'Anthropic',
    type: 'anthropic',
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
  }
};

const clients = new Map();

export function getProviderOptions() {
  return Object.values(PROVIDER_CONFIGS).map(({ name, label, type, baseURL, model }) => ({
    name,
    label,
    type,
    baseURL: baseURL || '',
    model: model || '',
  }));
}

export function isValidProvider(providerName) {
  return Boolean(PROVIDER_CONFIGS[providerName]);
}

export function getProviderClient(providerName) {
  const config = PROVIDER_CONFIGS[providerName] || PROVIDER_CONFIGS.anthropic;

  if (clients.has(config.name)) {
    return { ...config, client: clients.get(config.name) };
  }

  let client = null;
  if (config.type === 'anthropic') {
    client = new Anthropic({
      apiKey: config.apiKey || 'not-set',
      baseURL: config.baseURL || undefined
    });
  } else if (config.type === 'openai') {
    client = new OpenAI({
      apiKey: config.apiKey || 'not-set',
      baseURL: config.baseURL
    });
  }

  if (client) {
    clients.set(config.name, client);
  }

  return { ...config, client };
}

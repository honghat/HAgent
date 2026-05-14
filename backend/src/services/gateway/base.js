const SECRET_PATTERNS = [
  /\b\d{8,12}:[A-Za-z0-9_-]{25,}\b/g,
  /\b(?:sk|xoxb|ghp|glpat)_[A-Za-z0-9_-]{16,}\b/g,
];

export const PLATFORM_LIMITS = {
  telegram: 3900,
  zalo: 1900,
  default: 3000,
};

export function redactSecrets(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[REDACTED]');
  }
  return text;
}

export function splitOutboundText(text, maxLen = PLATFORM_LIMITS.default) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.length <= maxLen) return [raw];

  const chunks = [];
  let remaining = raw;
  while (remaining.length > maxLen) {
    const newlineCut = remaining.lastIndexOf('\n', maxLen);
    const spaceCut = remaining.lastIndexOf(' ', maxLen);
    const cut = newlineCut > maxLen * 0.55 ? newlineCut : (spaceCut > maxLen * 0.55 ? spaceCut : maxLen);
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export class GatewayRegistry {
  constructor() {
    this.adapters = new Map();
  }

  register(adapter) {
    if (!adapter?.name) throw new Error('Gateway adapter must have a name');
    this.adapters.set(adapter.name, adapter);
  }

  get(platform) {
    return this.adapters.get(platform);
  }

  async list() {
    return Promise.all([...this.adapters.values()].map(async adapter => ({
      platform: adapter.name,
      capabilities: adapter.capabilities || [],
      status: await adapter.status(),
    })));
  }

  async send({ platform, userId, target, text, options = {} }) {
    const adapter = this.get(platform);
    if (!adapter) {
      throw new Error(`Unsupported gateway platform: ${platform}`);
    }
    return adapter.send({ userId, target, text, options });
  }
}

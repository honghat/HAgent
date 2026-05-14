import { PROVIDER_CONFIGS, getProviderClient, getProviderOptions } from './provider-config.js';

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      return part?.text || '';
    }).join('');
  }
  return content == null ? '' : String(content);
}

export function resolveProviderForModel(model) {
  if (model && PROVIDER_CONFIGS[model]) {
    const config = PROVIDER_CONFIGS[model];
    return { providerName: config.name, upstreamModel: config.model };
  }

  const byModel = Object.values(PROVIDER_CONFIGS).find(config => config.model === model);
  if (byModel) return { providerName: byModel.name, upstreamModel: model };

  const configuredFallback = process.env.HAGENT_ROUTER_DEFAULT_PROVIDER;
  const fallbackName = configuredFallback && PROVIDER_CONFIGS[configuredFallback]
    ? configuredFallback
    : model?.startsWith('claude') && PROVIDER_CONFIGS.anthropic?.apiKey
    ? 'anthropic'
    : 'lmstudio';
  const fallback = PROVIDER_CONFIGS[fallbackName] || Object.values(PROVIDER_CONFIGS)[0];
  const shouldAliasClaude = model?.startsWith('claude') && fallback.name !== 'anthropic';
  return { providerName: fallback.name, upstreamModel: shouldAliasClaude ? fallback.model : (model || fallback.model) };
}

export function listRouterModels() {
  const seen = new Set();
  const models = [];
  for (const option of getProviderOptions()) {
    for (const id of [option.name, option.model].filter(Boolean)) {
      if (seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        object: 'model',
        owned_by: option.name,
      });
    }
  }
  return { object: 'list', data: models.sort((a, b) => a.id.localeCompare(b.id)) };
}

function splitOpenAIMessages(messages = []) {
  const system = messages
    .filter(message => message.role === 'system')
    .map(message => textFromContent(message.content))
    .filter(Boolean)
    .join('\n\n');
  const chatMessages = messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: textFromContent(message.content),
    }));
  return { system, chatMessages };
}

function anthropicToOpenAI(body, upstreamModel) {
  const messages = [...(body.messages || [])];
  if (body.system) messages.unshift({ role: 'system', content: body.system });
  const converted = {
    model: upstreamModel,
    messages: messages.map(message => ({
      role: message.role,
      content: textFromContent(message.content),
    })),
    max_tokens: body.max_tokens || 4096,
    stream: Boolean(body.stream),
  };
  if ('temperature' in body) converted.temperature = body.temperature;
  if ('top_p' in body) converted.top_p = body.top_p;
  return converted;
}

function openAIToAnthropic(data, model) {
  const message = data?.choices?.[0]?.message || {};
  const content = message.content || message.reasoning_content || '';
  const usage = data?.usage || {};
  return {
    id: data?.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: content }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

function openAIChunk({ model, content = '', finishReason = null }) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: content ? { content } : {},
      finish_reason: finishReason,
    }],
  };
}

function sendSse(res, data, event) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendOpenAISse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildGeminiContents(messages = []) {
  const contents = [];
  let system = '';
  for (const message of messages) {
    const text = textFromContent(message.content);
    if (message.role === 'system') {
      system += system ? `\n\n${text}` : text;
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    });
  }
  return { system, contents };
}

function geminiResponseToOpenAI(data, model) {
  const candidate = data?.candidates?.[0] || {};
  const parts = candidate.content?.parts || [];
  const content = parts.map(part => part.text || '').join('');
  const usage = data?.usageMetadata || {};
  return {
    id: 'chatcmpl-gemini',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
    }],
    usage: {
      prompt_tokens: usage.promptTokenCount || 0,
      completion_tokens: usage.candidatesTokenCount || 0,
      total_tokens: usage.totalTokenCount || ((usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0)),
    },
  };
}

async function callGeminiChat(body, config, upstreamModel) {
  if (!config.apiKey) throw new Error('GEMINI_API_KEY not configured');
  const { system, contents } = buildGeminiContents(body.messages || []);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${upstreamModel}:generateContent?key=${config.apiKey}`;
  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: body.max_tokens || body.max_completion_tokens || 2000,
      temperature: body.temperature ?? 0.7,
    },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText);
  return geminiResponseToOpenAI(data, body.model || upstreamModel);
}

async function streamGeminiChat(body, config, upstreamModel, res) {
  if (!config.apiKey) throw new Error('GEMINI_API_KEY not configured');
  const { system, contents } = buildGeminiContents(body.messages || []);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${upstreamModel}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: body.max_tokens || body.max_completion_tokens || 2000,
      temperature: body.temperature ?? 0.7,
    },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || response.statusText);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
      if (text) sendOpenAISse(res, openAIChunk({ model: body.model || upstreamModel, content: text }));
    }
  }
  sendOpenAISse(res, openAIChunk({ model: body.model || upstreamModel, finishReason: 'stop' }));
  res.write('data: [DONE]\n\n');
}

export async function handleOpenAIChatCompletion(body, res = null) {
  const { providerName, upstreamModel } = resolveProviderForModel(body.model);
  const config = getProviderClient(providerName);
  if (!config.model && !upstreamModel) throw new Error(`No model configured for provider: ${providerName}`);

  if (body.stream && res) {
    return streamOpenAIChatCompletion(body, config, upstreamModel, res);
  }

  if (config.type === 'gemini') return callGeminiChat(body, config, upstreamModel);

  if (config.type === 'anthropic') {
    const { system, chatMessages } = splitOpenAIMessages(body.messages || []);
    const response = await config.client.messages.create({
      model: upstreamModel || config.model,
      max_tokens: body.max_tokens || body.max_completion_tokens || 2000,
      system,
      messages: chatMessages,
      temperature: body.temperature,
    });
    const content = response.content?.filter(part => part.type === 'text').map(part => part.text).join('') || '';
    return {
      id: response.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || upstreamModel || config.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: response.stop_reason || 'stop' }],
      usage: {
        prompt_tokens: response.usage?.input_tokens || 0,
        completion_tokens: response.usage?.output_tokens || 0,
        total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      },
    };
  }

  const response = await config.client.chat.completions.create({
    ...body,
    model: upstreamModel || config.model,
    stream: false,
  });
  response.model = body.model || response.model;
  return response;
}

export async function streamOpenAIChatCompletion(body, config, upstreamModel, res) {
  if (config.type === 'gemini') return streamGeminiChat(body, config, upstreamModel, res);

  if (config.type === 'anthropic') {
    const { system, chatMessages } = splitOpenAIMessages(body.messages || []);
    const stream = await config.client.messages.create({
      model: upstreamModel || config.model,
      max_tokens: body.max_tokens || body.max_completion_tokens || 2000,
      system,
      messages: chatMessages,
      temperature: body.temperature,
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        sendOpenAISse(res, openAIChunk({ model: body.model || upstreamModel || config.model, content: event.delta.text }));
      }
      if (event.type === 'message_stop') {
        sendOpenAISse(res, openAIChunk({ model: body.model || upstreamModel || config.model, finishReason: 'stop' }));
      }
    }
    res.write('data: [DONE]\n\n');
    return;
  }

  const stream = await config.client.chat.completions.create({
    ...body,
    model: upstreamModel || config.model,
    stream: true,
  });
  for await (const chunk of stream) {
    if (body.model) chunk.model = body.model;
    sendOpenAISse(res, chunk);
  }
  res.write('data: [DONE]\n\n');
}

export async function handleAnthropicMessages(body, res = null) {
  const { providerName, upstreamModel } = resolveProviderForModel(body.model);
  const config = getProviderClient(providerName);

  if (body.stream && res) {
    return streamAnthropicMessages(body, config, upstreamModel, res);
  }

  if (config.type === 'anthropic') {
    return config.client.messages.create({
      ...body,
      model: upstreamModel || config.model,
      stream: false,
    });
  }

  const openAIResponse = await handleOpenAIChatCompletion(anthropicToOpenAI(body, upstreamModel || config.model));
  return openAIToAnthropic(openAIResponse, body.model || upstreamModel || config.model);
}

export async function streamAnthropicMessages(body, config, upstreamModel, res) {
  const model = body.model || upstreamModel || config.model;

  sendSse(res, {
    type: 'message_start',
    message: {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  }, 'message_start');
  sendSse(res, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, 'content_block_start');

  if (config.type === 'anthropic') {
    const stream = await config.client.messages.create({
      ...body,
      model: upstreamModel || config.model,
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        sendSse(res, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: event.delta.text } }, 'content_block_delta');
      }
    }
  } else {
    await streamOpenAICompatibleAsAnthropic(anthropicToOpenAI(body, upstreamModel || config.model), config, upstreamModel || config.model, res);
  }

  sendSse(res, { type: 'content_block_stop', index: 0 }, 'content_block_stop');
  sendSse(res, { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } }, 'message_delta');
  sendSse(res, { type: 'message_stop' }, 'message_stop');
}

async function streamOpenAICompatibleAsAnthropic(openAIBody, config, upstreamModel, res) {
  if (config.type === 'gemini') {
    if (!config.apiKey) throw new Error('GEMINI_API_KEY not configured');
    const { system, contents } = buildGeminiContents(openAIBody.messages || []);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${upstreamModel}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens: openAIBody.max_tokens || 4096,
        temperature: openAIBody.temperature ?? 0.7,
      },
    };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || response.statusText);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        const data = JSON.parse(raw);
        const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
        if (text) sendSse(res, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, 'content_block_delta');
      }
    }
    return;
  }

  const stream = await config.client.chat.completions.create({
    ...openAIBody,
    model: upstreamModel || config.model,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta || {};
    const text = delta.content || delta.reasoning_content || '';
    if (text) sendSse(res, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, 'content_block_delta');
  }
}

import { Langfuse } from 'langfuse';

let langfuse = null;

if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
  langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'
  });
  console.log('[Observability] Langfuse initialized.');
}

export function getLangfuse() {
  return langfuse;
}

export async function traceStep({ name, input, output, metadata, parentTraceId }) {
  if (!langfuse) return null;

  try {
    const trace = langfuse.trace({
      id: parentTraceId,
      name: name,
      metadata: metadata,
      input: input,
      output: output
    });
    return trace;
  } catch (err) {
    console.error('[Observability] Error tracing step:', err.message);
    return null;
  }
}

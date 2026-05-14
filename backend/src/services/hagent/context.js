const SHORT_CONFIRMATION_RE = /^(ok|okay|oke|yes|y|ừ|uh|uhm|được|duoc|đúng|dung|rồi|roi|tiếp|tiep|chạy đi|chay di|làm đi|lam di|go|continue|rerun|run again|chạy lại|chay lai|làm lại|lam lai)$/i;

export function isShortConfirmation(text = '') {
  return SHORT_CONFIRMATION_RE.test(String(text || '').trim());
}

export function findLastAssistantMessage(history = []) {
  return [...history].reverse().find(m => m.role === 'assistant' && String(m.content || '').trim()) || null;
}

export function buildHagentContinuationTurn({ text = '', history = [], replyText = '', platform = 'chat' } = {}) {
  const cleanText = String(text || '').trim();
  const replyBlock = replyText
    ? `[${platform.toUpperCase()}_REPLY_TO]\n${replyText}\n[/${platform.toUpperCase()}_REPLY_TO]\n\n`
    : '';

  if (!isShortConfirmation(cleanText)) return replyBlock + cleanText;

  const lastAssistant = findLastAssistantMessage(history);
  if (!lastAssistant) return replyBlock + cleanText;

  return replyBlock + [
    `[${platform.toUpperCase()}_CONFIRMATION] ${cleanText}`,
    'The user is confirming or approving the immediately preceding assistant proposal.',
    replyText ? 'The user also replied to the platform message quoted above.' : '',
    'Continue the proposed action using tools when needed.',
    'Do not answer with a social acknowledgement only if there is still an actionable task.',
    '',
    `[Previous assistant message]\n${lastAssistant.content}`,
  ].filter(Boolean).join('\n');
}

export function extractTelegramReplyText(msg = {}) {
  return msg?.reply_to_message?.text || msg?.reply_to_message?.caption || '';
}

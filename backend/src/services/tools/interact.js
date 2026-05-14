// ── AskUserQuestion

export function askUser({ question, options } = {}) {
  if (!question) return 'Thiếu câu hỏi.';
  const opts = Array.isArray(options) && options.length ? `\nCác lựa chọn: ${options.join(', ')}` : '';
  return `[ASK_USER] ${question}${opts}`;
}

// ── PushNotification

export async function pushNotification({ title, message } = {}) {
  try {
    if (!title && !message) return 'Thiếu nội dung thông báo.';
    return `[NOTIFICATION] ${title || ''}: ${message || ''}`;
  } catch (e) {
    return `Lỗi gửi thông báo: ${e.message}`;
  }
}

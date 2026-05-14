import { google } from 'googleapis';
import { getAuthClient, GOOGLE_NO_AUTH } from './google.js';

function extractBody(part) {
  if (part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf-8');
  if (part.parts) for (const p of part.parts) {
    const r = extractBody(p);
    if (r) return r;
  }
  return '';
}

async function handler(args) {
  try {
    const client = getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth: client });

    if (args.action === 'list' || !args.action) {
      const list = await gmail.users.messages.list({ userId: 'me', maxResults: args.maxResults || 5, labelIds: ['INBOX'] });
      const msgs = list.data.messages || [];
      const details = await Promise.all(msgs.slice(0, 5).map(async m => {
        const d = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
        const h = (n) => d.data.payload?.headers?.find(h => h.name === n)?.value || '';
        return `${h('Subject')} - ${h('From')}`;
      }));
      if (!details.length) return 'Inbox trong.';
      return details.map((d, i) => `${i+1}. ${d}`).join('\n');
    }

    if (args.action === 'search') {
      const list = await gmail.users.messages.list({ userId: 'me', q: args.query, maxResults: args.maxResults || 10 });
      const msgs = list.data.messages || [];
      const details = await Promise.all(msgs.slice(0, 10).map(async m => {
        const d = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
        const h = (n) => d.data.payload?.headers?.find(h => h.name === n)?.value || '';
        return `${h('Subject')} - ${h('From')}`;
      }));
      if (!details.length) return 'Khong tim thay.';
      return details.map((d, i) => `${i+1}. ${d}`).join('\n');
    }

    if (args.action === 'read') {
      const r = await gmail.users.messages.get({ userId: 'me', id: args.messageId, format: 'full' });
      const headers = r.data.payload?.headers || [];
      const h = (n) => headers.find(h => h.name === n)?.value || '';
      const body = extractBody(r.data.payload).slice(0, 10000);
      return `From: ${h('From')}\nSubject: ${h('Subject')}\nDate: ${h('Date')}\n\n${body}`;
    }

    if (args.action === 'send') {
      const raw = Buffer.from(
        `From: me\r\nTo: ${args.to}\r\nSubject: ${args.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${args.body}`
      ).toString('base64url');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      return `Da gui email toi ${args.to}`;
    }

    return 'Action: list, search, read, send';
  } catch (e) {
    if (e.message === GOOGLE_NO_AUTH) return 'Chua auth Google. Dung google_auth action=auth_url.';
    return `Loi: ${e.message}`;
  }
}

export const tool = {
  name: 'gmail',
  desc: 'Gmail: xem inbox, tim kiem, doc noi dung, gui email.',
  when: 'User hoi ve email, inbox, gui nhan email, Gmail.',
  args: { action: 'list | search | read | send', query: 'tu khoa tim kiem', messageId: 'ID email', maxResults: 'so luong (mac dinh 10)', to: 'nguoi nhan', subject: 'tieu de', body: 'noi dung' },
  handler,
  label: 'Dang doc Gmail...',
};

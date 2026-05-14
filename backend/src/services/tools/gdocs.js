import { google } from 'googleapis';
import { getAuthClient, GOOGLE_NO_AUTH } from './google.js';

async function handler(args) {
  try {
    const client = getAuthClient();

    if (args.action === 'read' || !args.action) {
      const docs = google.docs({ version: 'v1', auth: client });
      const r = await docs.documents.get({ documentId: args.documentId });
      const content = r.data.body?.content || [];
      const text = content
        .filter(p => p.paragraph)
        .map(p => p.paragraph.elements?.map(e => e.textRun?.content || '').join('') || '')
        .join('\n');
      return `Doc: ${r.data.title}\n\n${text.slice(0, 10000)}`;
    }

    if (args.action === 'create') {
      const docs = google.docs({ version: 'v1', auth: client });
      const doc = await docs.documents.create({ requestBody: { title: args.title } });
      const documentId = doc.data.documentId;
      if (args.content) {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests: [{ insertText: { location: { index: 1 }, text: args.content } }] },
        });
      }
      return `Created: ${args.title}\nhttps://docs.google.com/document/d/${documentId}`;
    }

    return 'Action: read, create';
  } catch (e) {
    if (e.message === GOOGLE_NO_AUTH) return 'Chua auth Google. Dung google_auth action=auth_url.';
    return `Loi: ${e.message}`;
  }
}

export const tool = {
  name: 'gdocs',
  desc: 'Google Docs: doc noi dung, tao document moi.',
  when: 'User hoi ve Google Docs, Google Document.',
  args: { action: 'read | create', documentId: 'ID Google Doc', title: 'tieu de (create)', content: 'noi dung (create)' },
  handler,
  label: 'Dang doc Google Docs...',
};

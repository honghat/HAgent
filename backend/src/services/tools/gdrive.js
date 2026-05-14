import { google } from 'googleapis';
import { getAuthClient, GOOGLE_NO_AUTH } from './google.js';

async function handler(args) {
  try {
    const client = getAuthClient();
    const drive = google.drive({ version: 'v3', auth: client });

    if (args.action === 'list' || !args.action) {
      const res = await drive.files.list({
        q: args.query || undefined,
        pageSize: 8,
        fields: 'files(id, name, mimeType, size, modifiedTime)',
      });
      const files = res.data.files || [];
      if (!files.length) return 'Khong co file nao.';
      return files.map((f, i) => `${i+1}. ${f.name}`).join('\n');
    }

    if (args.action === 'read') {
      const meta = await drive.files.get({ fileId: args.fileId, fields: 'id, name, mimeType' });
      if (meta.data.mimeType === 'application/vnd.google-apps.document') {
        const r = await drive.files.export({ fileId: args.fileId, mimeType: 'text/plain' });
        return `File: ${meta.data.name}\n\n${r.data}`;
      }
      const r = await drive.files.get({ fileId: args.fileId, alt: 'media' }, { responseType: 'text' });
      return `File: ${meta.data.name}\n\n${String(r.data).slice(0, 10000)}`;
    }

    return 'Action: list, read';
  } catch (e) {
    if (e.message === GOOGLE_NO_AUTH) return 'Chua auth Google. Dung google_auth action=auth_url.';
    return `Loi: ${e.message}`;
  }
}

export const tool = {
  name: 'gdrive',
  desc: 'Google Drive: liet ke file, doc file.',
  when: 'User hoi ve Google Drive, file tren Drive, list Drive.',
  args: { action: 'list | read', query: 'tu khoa tim kiem', fileId: 'ID file can doc' },
  handler,
  label: 'Dang doc Google Drive...',
};

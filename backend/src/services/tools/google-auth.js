import { exchangeGoogleCode, getAuthUrl } from './google.js';

async function handler(args) {
  try {
    if (args.action === 'auth_url') {
      return `Mo link, auth Google, code tu dong luu qua localhost:8004/oauth2callback:\n${getAuthUrl()}`;
    }
    if (args.action === 'exchange_code') {
      const r = await exchangeGoogleCode(args.code);
      return 'OAuth thanh cong!';
    }
    return 'Action: auth_url | exchange_code';
  } catch (e) {
    return `Loi: ${e.message}`;
  }
}

export const tool = {
  name: 'google_auth',
  desc: 'Xac thuc Google OAuth cho Drive, Docs, Gmail.',
  when: 'User can auth Google, OAuth chua co, can cap quyen.',
  args: { action: 'auth_url | exchange_code', code: 'code tu Google (exchange_code)' },
  handler,
  label: 'Dang auth Google...',
};

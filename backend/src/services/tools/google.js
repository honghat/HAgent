import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.resolve(process.cwd(), '.env');

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/gmail.modify',
];

function getOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'http://localhost:8004/oauth2callback');
}

function saveRefreshToken(token) {
  try {
    let env = fs.readFileSync(ENV_PATH, 'utf-8');
    if (env.includes('GOOGLE_REFRESH_TOKEN=')) {
      env = env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${token}`);
    } else {
      env += `\nGOOGLE_REFRESH_TOKEN=${token}`;
    }
    fs.writeFileSync(ENV_PATH, env);
    process.env.GOOGLE_REFRESH_TOKEN = token;
    return true;
  } catch { return false; }
}

export function getAuthClient() {
  const oauth2Client = getOAuth2Client();
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return oauth2Client;
  }
  throw new Error('NO_AUTH');
}

export async function exchangeGoogleCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh_token received. Delete app from https://myaccount.google.com/connections and retry.');
  }
  saveRefreshToken(tokens.refresh_token);
  return { success: true, message: 'Google OAuth thành công!' };
}

export function getAuthUrl() {
  return getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export const GOOGLE_NO_AUTH = 'NO_AUTH';

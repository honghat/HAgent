import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
export const youtubeAuthRouter = Router();

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8004/api/video/auth/youtube/callback';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload';

// Bước 1: Chuyển hướng đến Google OAuth
youtubeAuthRouter.get('/login', (_, res) => {
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
  res.redirect(url);
});

// Bước 2: Google redirect về đây với code
youtubeAuthRouter.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const data = await r.json();
    if (!data.refresh_token) return res.status(400).send('No refresh_token — cần prompt=consent (thử lại)');

    // Ghi refresh token vào .env
    let env = fs.readFileSync(envPath, 'utf8');
    if (env.includes('YOUTUBE_REFRESH_TOKEN=')) {
      env = env.replace(/YOUTUBE_REFRESH_TOKEN=.*/, `YOUTUBE_REFRESH_TOKEN=${data.refresh_token}`);
    } else {
      env += `\nYOUTUBE_REFRESH_TOKEN=${data.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, env);
    process.env.YOUTUBE_REFRESH_TOKEN = data.refresh_token;

    res.send(`
      <h3>✅ Đã lưu YouTube Refresh Token!</h3>
      <p>Refresh Token: ${data.refresh_token.slice(0, 30)}...</p>
      <p>Giờ bạn có thể đăng video từ ứng dụng.</p>
      <a href="/">Quay lại HAgent</a>
    `);
  } catch (e) {
    res.status(500).send(`Lỗi: ${e.message}`);
  }
});

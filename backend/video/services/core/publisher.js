import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'uploads');

export async function publishToYouTube(task) {
  const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
  const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return { error: 'Chưa cấu hình YouTube API. Thêm YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN vào .env' };
  }

  const videoPath = path.join(uploadDir, task.video_file);
  if (!fs.existsSync(videoPath)) return { error: 'File video không tồn tại' };

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: 'refresh_token',
      })
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) return { error: 'Không lấy được access token — check YOUTUBE_REFRESH_TOKEN' };

    const accessToken = tokenData.access_token;
    const stats = fs.statSync(videoPath);

    const desc = task.yt_desc || '🌿 Video được dịch & lồng tiếng tự động';
    // Thêm # vào trước mỗi tag
    const tags = task.yt_tags?.split(/[,;\s]+/).filter(Boolean).map(t => `#${t}`).join(' ') || '';
    const fullDesc = tags ? `${desc}\n\n${tags}` : desc;

    const metadata = JSON.stringify({
      snippet: {
        title: (task.title || 'Video không tiêu đề').slice(0, 100),
        description: fullDesc,
        categoryId: '22',
      },
      status: { privacyStatus: 'public' }
    });

    const initResp = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': stats.size.toString(),
        'X-Upload-Content-Type': 'video/*',
      },
      body: metadata
    });

    const uploadUrl = initResp.headers.get('Location');
    if (!uploadUrl) return { error: 'YouTube từ chối — check quota hoặc OAuth scope' };

    const videoStream = fs.createReadStream(videoPath);
    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Length': stats.size.toString(), 'Content-Type': 'video/*' },
      body: videoStream,
      duplex: 'half',
    });

    const result = await uploadResp.json();
    if (!result.id) return { error: result.error?.message || 'Upload thất bại' };

    return { url: `https://youtu.be/${result.id}` };
  } catch (e) {
    return { error: e.message };
  }
}

export async function publishToTikTok(task) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      error: 'Chưa cấu hình TikTok Content Posting API. Cần TIKTOK_ACCESS_TOKEN có scope video.publish hoặc đăng thủ công bằng MP4 + tiktok-caption.txt.',
    };
  }

  const videoPath = path.join(uploadDir, task.video_file);
  if (!fs.existsSync(videoPath)) return { error: 'File video không tồn tại' };

  try {
    const stats = fs.statSync(videoPath);
    const safeChunkSize = stats.size < 5 * 1024 * 1024
      ? stats.size
      : Math.min(32 * 1024 * 1024, stats.size);
    const totalChunkCount = Math.ceil(stats.size / safeChunkSize);
    const title = (task.tiktok_caption || task.yt_desc || task.title || 'Video giáo dục').slice(0, 2200);

    const initResp = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title,
          privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: stats.size,
          chunk_size: safeChunkSize,
          total_chunk_count: totalChunkCount,
        },
      }),
    });

    const initData = await initResp.json();
    const uploadUrl = initData?.data?.upload_url;
    const publishId = initData?.data?.publish_id;
    if (!initResp.ok || !uploadUrl) {
      return { error: initData?.error?.message || initData?.error?.code || 'TikTok từ chối khởi tạo upload' };
    }

    for (let i = 0; i < totalChunkCount; i += 1) {
      const start = i * safeChunkSize;
      const end = Math.min(stats.size - 1, start + safeChunkSize - 1);
      const length = end - start + 1;
      const uploadResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(length),
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        },
        body: fs.createReadStream(videoPath, { start, end }),
        duplex: 'half',
      });
      if (!uploadResp.ok) {
        const text = await uploadResp.text().catch(() => '');
        return { error: text || `TikTok upload chunk ${i + 1} thất bại` };
      }
    }

    return {
      url: publishId ? `TikTok publish_id: ${publishId}` : 'TikTok upload initialized',
      publishId,
    };
  } catch (e) {
    return { error: e.message };
  }
}

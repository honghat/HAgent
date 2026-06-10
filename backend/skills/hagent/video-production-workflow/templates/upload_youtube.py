#!/usr/bin/env python3
"""
Upload video to YouTube via YouTube Data API v3.

Setup (one-time):
  1. Google Cloud Console → enable YouTube Data API v3
  2. Create OAuth2 credentials (Desktop App) → download client_secret.json
  3. pip install google-auth-oauthlib google-api-python-client

Usage:
  python upload_youtube.py --credentials client_secret.json
  python upload_youtube.py --credentials client_secret.json --private
"""
import argparse
import os
import pickle
import sys
from pathlib import Path

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except ImportError:
    os.system("pip install google-auth-oauthlib google-api-python-client")
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

# ── CONFIGURE THESE ──────────────────────────────────────────────────────────
VIDEO_PATH = Path(__file__).parent / "final_video.mp4"   # path to your video
TOKEN_PATH = Path(__file__).parent / "youtube_token.pickle"

VIDEO_METADATA = {
    "title": "Tiêu đề video | Khoa học thường thức",
    "description": """Mô tả video...

#KhoaHoc #KhoaHocThuongThuc""",
    "tags": ["khoa học", "khoa học thường thức"],
    "category_id": "28",   # 28 = Science & Technology, 22 = People & Blogs
    "privacy": "public",   # "public" / "unlisted" / "private"
}
# ─────────────────────────────────────────────────────────────────────────────


def get_authenticated_service(client_secret_file: str):
    creds = None
    if TOKEN_PATH.exists():
        with open(TOKEN_PATH, "rb") as f:
            creds = pickle.load(f)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(client_secret_file, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, "wb") as f:
            pickle.dump(creds, f)

    return build("youtube", "v3", credentials=creds)


def upload_video(youtube, video_path: Path, metadata: dict):
    body = {
        "snippet": {
            "title": metadata["title"],
            "description": metadata["description"],
            "tags": metadata["tags"],
            "categoryId": metadata["category_id"],
        },
        "status": {"privacyStatus": metadata["privacy"]},
    }

    media = MediaFileUpload(
        str(video_path), mimetype="video/mp4",
        resumable=True, chunksize=1024 * 1024,
    )

    request = youtube.videos().insert(
        part=",".join(body.keys()), body=body, media_body=media
    )

    print(f"Uploading: {video_path.name} ({video_path.stat().st_size / 1024 / 1024:.1f}MB)")
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  Progress: {int(status.progress() * 100)}%")

    video_id = response["id"]
    print(f"\n✅ Uploaded! https://www.youtube.com/watch?v={video_id}")
    return video_id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", required=True, help="Path to client_secret.json")
    parser.add_argument("--private", action="store_true", help="Upload as private")
    args = parser.parse_args()

    if args.private:
        VIDEO_METADATA["privacy"] = "private"

    if not VIDEO_PATH.exists():
        print(f"❌ Video not found: {VIDEO_PATH}")
        sys.exit(1)

    print("Authenticating with YouTube...")
    youtube = get_authenticated_service(args.credentials)
    video_id = upload_video(youtube, VIDEO_PATH, VIDEO_METADATA)
    print(f"\n🎉 Done! https://youtu.be/{video_id}")


if __name__ == "__main__":
    main()

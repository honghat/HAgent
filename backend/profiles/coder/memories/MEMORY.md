Google OAuth setup: redirect_uri_mismatch fixed by adding `http://localhost:1` to authorized URIs in Google Cloud Console; gws CLI requires `uv pip install gws` or use Python API via `google_api.py`; token path is `~/.hagent/google_token.json` not `/Users/nguyenhat/hagent/...`; `_hagent_home.py` handles tilde expansion correctly; use `$GSETUP --check` to verify auth.

macOS autostart: LaunchDaemons at `/Library/LaunchDaemons/` require sudo; prefer LaunchAgents at `~/Library/LaunchAgents/` for user-space services without elevated privileges.
§
Zalo dual-auth: browser cookies (persistent) + QR code scanning (session-based). Use ~./hagent/plugins/platforms/zalo/adapter.py and adapter_qr.py. See assets/references/zalo-auth-methods.md for details.

Facebook Messenger Playwright: uses fbsbx.com cookies from Chrome DevTools, E2EE PIN handling for encrypted threads. Adapter at ~./hagent/plugins/platforms/facebook/adapter.py.

Credential extraction pattern: Open browser → F12 → Application → Cookies → [platform domain] tab → Click "Copy as curl" on first cookie line → Paste into terminal or shell profile.
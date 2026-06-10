# HAgent SearXNG Lite

Local, no-Docker SearXNG instance for HAgent web search.

## Layout

- `searxng-src/` — vendored SearXNG checkout
- `.venv/` — isolated Python environment for SearXNG
- `settings.yml` — minimal local config for agent search
- `start.sh`, `stop.sh`, `status.sh` — small lifecycle helpers

## Usage

```bash
./backend/searxng-lite/install.sh
./backend/searxng-lite/start.sh
./backend/searxng-lite/status.sh
./backend/searxng-lite/stop.sh
```

The local instance listens on `http://127.0.0.1:8888` and exposes JSON search results for HAgent.

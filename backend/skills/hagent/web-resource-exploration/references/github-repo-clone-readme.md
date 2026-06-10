# GitHub Repo Clone & README Reading Fallback

## Khi nào sử dụng
- `web_search` không hoạt động (SearXNG backend connection refused)
- `web_extract` không thể extract từ URL (backend không support)
- Browser tools không thể đọc README chi tiết (bot detection, page không render full content)
- Muốn đọc README, package.json, LICENSE trực tiếp từ repo

## Phương pháp clone repo GitHub

### Quick Command
```bash
# Clone repo vào /tmp và đọc README
cd /tmp && git clone https://github.com/<user>/<repo> && cd <repo> && cat README.md | head -500

# Hoặc chỉ clone và đọc README, không để repo tồn tại quá lâu
git clone --depth=1 https://github.com/<user>/<repo> /tmp/temp_repo && cat /tmp/temp_repo/README.md && rm -rf /tmp/temp_repo
```

### Lấy metadata qua GitHub API
```bash
# Lấy stars, forks, license, description
curl -sL "https://api.github.com/repos/<user>/<repo>" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ['name','description','stargazers_count','forks_count','license','created_at','updated_at']}, indent=2))"

# Lấy top contributors
curl -sL "https://api.github.com/repos/<user>/<repo>/contributors" | python3 -c "import sys,json; data=json.load(sys.stdin); print('Contributors:', len(data)); for i, c in enumerate(data[:5]): print(f'{i+1}. {c.get('login')}: {c.get('contributions')} contributions')"
```

### Đọc README và các file quan trọng trực tiếp
```bash
# README.md (main branch)
curl -sL "https://raw.githubusercontent.com/<user>/<repo>/main/README.md" | head -200

# LICENSE file (main branch)
curl -sL "https://raw.githubusercontent.com/<user>/<repo>/main/LICENSE" | head -50

# package.json để xem dependencies
curl -sL "https://raw.githubusercontent.com/<user>/<repo>/main/package.json" | python3 -c "import sys,json; data=json.load(sys.stdin); print(json.dumps(data, indent=2))"

# requirements.txt cho Python project
curl -sL "https://raw.githubusercontent.com/<user>/<repo>/main/requirements.txt" | head -20

# AGENTS.md / CLAUDE.md / COPILOT_INSTRUCTIONS.md cho AI agent projects
curl -sL "https://raw.githubusercontent.com/<user>/<repo>/main/AGENTS.md" | head -100
```

## Ví dụ cụ thể từ Dograh AI
Khi web_search không hoạt động với lỗi `"Could not reach SearXNG at http://127.0.0.1:8888: [Errno 61] Connection refused"`, fallback workflow:

1. **Clone repo**: `cd /tmp && git clone https://github.com/dograh-hq/dograh`
2. **Đọc README**: `cat dograh/README.md | head -500`
3. **Lấy metadata**: `curl -sL "https://api.github.com/repos/dograh-hq/dograh"`
4. **Save wiki**: Chuyển thông tin thành wiki entry

## Ưu điểm
- Đọc được README và file quan trọng ngay cả khi browser không load được
- Có được metadata chi tiết (stars, forks, license) từ GitHub API
- Không cần token cho public repos (rate limit ~60 req/hour)
- Nhanh hơn browser navigation khi chỉ cần README

## Nhược điểm
- Yêu cầu git có thể clone repo
- Không thể đọc content HTML của trang web khác GitHub
- Không thể duyệt các trang web có authentication
- Không thể đọc JavaScript-heavy pages

## Alternative: Browser tools tiếp
Khi clone repo không khả thi (no git, token issues), tiếp tục với browser tools:
1. `browser_navigate()` đến GitHub repo
2. `browser_snapshot()` để đọc README content từ HTML
3. `browser_click()` để duyệt qua các phần của README

Note: browser tools có thể không đọc được README đầy đủ do GitHub rendering.

## Tổng hợp
- **Path 1**: web_search + web_extract (SearXNG/DuckDuckGo)
- **Path 2**: browser_navigate + browser_snapshot (Browser tools)
- **Path 3**: GitHub repo clone + curl API (Fallback khi search không hoạt động)
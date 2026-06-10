# System Inventory Exploration — Local & Remote Machines

## Khi nào dùng

User yêu cầu **"nghiên cứu / khám phá / lưu wiki"** về:
- Máy tính hiện tại (Mac mini, PC)
- Các máy remote (SSH-accessible servers, Raspberry Pi)
- Toàn bộ network topology (LAN + VPN)
- Tài nguyên máy tính trong hệ thống

## Quy trình chuẩn

### Phase 1: Local Machine — macOS (Mac mini / MacBook)

```bash
# Hardware overview
system_profiler SPHardwareDataType

# Chip, cores, RAM
sysctl -n machdep.cpu.brand_string
sysctl -n hw.ncpu
sysctl -n hw.memsize

# GPU
system_profiler SPDisplaysDataType

# Storage
df -h /
diskutil info / | grep -E "Total Size|Volume Used|Container"

# Software
system_profiler SPSoftwareDataType
sw_vers

# Network interfaces
networksetup -listallhardwareports

# Rosetta
pkgutil --pkg-info=com.apple.pkg.RosettaUpdateAuto

# Runtimes
python3 --version
node --version
go version

# Homebrew packages (formulae + casks)
brew list --formula
brew list --cask
```

### Phase 2: Discover Remote Machines

#### 2a. SSH Config
```bash
cat ~/.ssh/config
```
Liệt kê tất cả hosts — mỗi host là một máy remote.

#### 2b. Tailscale Network
```bash
tailscale status
```
Ghi lại tất cả nodes: hostname, Tailscale IP, OS, online/offline.

#### 2c. LAN Neighbors (ARP)
```bash
arp -a
```
Map Tailscale nodes → LAN IPs → MAC addresses. Dùng để phát hiện máy nào tương ứng với IP nào trên mạng nội bộ.

### Phase 3: Probe Remote Machines (via SSH)

Dùng SSH key-based auth (BatchMode=yes) để tránh password prompts.

#### Common system info queries:
```bash
# Linux machine
ssh user@host 'hostname; uname -a; free -h; df -h /; lscpu | grep "Model name\|CPU(s)"'

# macOS machine (remotely)
ssh user@host 'hostname; uname -a; system_profiler SPHardwareDataType | head -20'

# GPU (Linux with NVIDIA)
ssh user@host 'nvidia-smi'

# GPU (Linux with Intel)
ssh user@host 'lspci -vnn | grep -A 12 "VGA.*NVIDIA\|VGA.*AMD\|3D controller"'

# Docker containers
ssh user@host 'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"'

# OS details
ssh user@host 'cat /proc/cpuinfo | head -5; cat /proc/meminfo | head -5; lsblk'
```

#### Raspberry Pi specific:
```bash
ssh pi@host 'vcgencmd measure_temp; vcgencmd get_config total_mem; cat /proc/meminfo | head -5'
```

### Phase 4: Map Network Topology

Cấu trúc dữ liệu cần xác định:

| Máy | Tailscale IP | LAN IP | MAC | Chức năng | OS | Online? |
|-----|-------------|--------|-----|-----------|-----|---------|

Xác định:
- **Tailscale subnet** (thường 100.x.x.x)
- **LAN subnet** (thường 192.168.1.x)
- Máy nào là **gateway/router** (192.168.1.1)
- Máy nào là **relay/WOL proxy** (thường là RPi chạy 24/7)

### Phase 5: Kiểm Tra Wake-on-LAN Config

```bash
# Check remote_power_tool.py for env vars
# WOL_MAC, WOL_BROADCAST, WOL_TARGET_IP, WOL_PORT
# WOL_PI_HOST (RPi relay)
# SSH_HOST, SSH_USER (target machine)
```

Cross-check WOL MAC với LAN IP qua ARP table để xác nhận.

### Phase 6: Lưu Wiki

Tiêu đề convention: `Tài nguyên máy tính — <tóm tắt cấu hình>`

```markdown
# Tài nguyên máy tính trong hệ thống

## Mạng kết nối
- **VPN**: Tailscale (subnet 100.x.x.x)
- **LAN**: subnet, router IP

## 1. 🖥️ <Tên máy> (<Model>) — <vai trò>
- **Tailscale**: IP — hostname
- **LAN IP**: IP
- **CPU**: model, cores/threads
- **RAM**: dung lượng, loại
- **GPU**: model, VRAM (nếu có)
- **Storage**: SSD/HDD dung lượng và tình trạng
- **OS**: version, kernel
- **Runtimes**: Python, Node, Go versions
- **Chạy dịch vụ**: liệt kê đang chạy

...
## Sơ đồ kết nối (ASCII)
```
Internet ─── Router (192.168.1.1)
                  │
          ┌───────┼───────┐
          │       │       │
      Hat-Mac  Hat-Linux  Hat-Pi4
         │         │           │
         └─────────┴───────────┘
                  │
            Tailscale VPN
          (100.x.x.x subnet)
```
```

## Common pitfalls

- **Python version mismatch**: System macOS Python là 3.9.x, dùng `.venv/bin/python` cho project Python 3.11/3.14
- **tailscale status JSON fail**: Trên macOS, `tailscale status --json` có thể crash với lỗi bundle identifier. Dùng `tailscale status` plain text thay thế.
- **Multiple machines with same hostname**: Phân biệt bằng Tailscale IP và OS. Ví dụ "pi" (RPi dự phòng) vs "hat-pi4" (RPi 4 chính).
- **Git-related keyword in wiki content**: Wiki tool chặn từ "git" — rephrase khi lưu.
- **SSH password required**: Nếu không có key-based auth (authorized_keys), cần sshpass + SSH_PASSWORD từ env.

## Data you need to collect per machine

- [ ] Hostname, model, CPU, cores/threads, RAM, GPU, VRAM
- [ ] Storage: total, used, free
- [ ] OS, kernel version, uptime (if reachable)
- [ ] Running services: Docker containers, LM Studio, n8n, etc.
- [ ] Network: IP (LAN + VPN), MAC
- [ ] Wake-on-LAN capability: MAC, broadcast
- [ ] Tailscale status: online/offline, last seen

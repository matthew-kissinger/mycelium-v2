# Mycelium v2 - Platform Setup Guide

This guide covers installation and setup for all supported platforms.

## Platforms (in order of support)

1. **NixOS** - Full declarative configuration
2. **Linux** - Manual setup with optional systemd
3. **macOS** - Manual setup with optional launchd
4. **Windows** - Manual setup

---

## NixOS (Recommended)

NixOS gets the full declarative treatment with flakes and home-manager.

### Quick Start

```bash
# Enter development shell
cd ~/mycelium-v2
nix develop

# Build packages
nix build .#mycel        # CLI
nix build .#mycelium-server  # Server
```

### Home Manager Integration

Add to your `flake.nix` inputs:

```nix
{
  inputs = {
    mycelium.url = "github:matthew-kissinger/mycelium-v2";
    # or local:
    # mycelium.url = "path:/home/mkagent/repos/mycelium-v2";
  };
}
```

In your `home.nix`:

```nix
{ inputs, pkgs, ... }:

{
  imports = [ inputs.mycelium.homeManagerModules.default ];

  # Add overlay for packages
  nixpkgs.overlays = [ inputs.mycelium.overlays.default ];

  services.mycelium = {
    enable = true;

    # Enable the backend server as a systemd user service
    server = {
      enable = true;
      port = 8765;
      autoStart = true;  # Start on login
    };

    # Scheduler configuration
    scheduler = {
      enable = true;
      autoStart = true;  # Auto-start scheduler when server boots
      config = {
        dispatcher_enabled = true;
        dispatcher_interval_sec = 60;
        max_concurrent_tasks = 3;
        discovery_enabled = true;
        discovery_interval_sec = 600;
      };
    };

    # Telegram integration (optional)
    telegram = {
      enable = true;
      botTokenFile = config.sops.secrets.telegram-token.path;  # Use sops-nix
      chatId = "your-chat-id";
    };
  };
}
```

### NixOS System Module (Server Deployment)

For running Mycelium as a system service:

```nix
{ inputs, ... }:

{
  imports = [ inputs.mycelium.nixosModules.default ];

  nixpkgs.overlays = [ inputs.mycelium.overlays.default ];

  services.mycelium = {
    enable = true;
    port = 8765;
    openFirewall = true;

    scheduler.config = {
      max_concurrent_tasks = 5;
    };
  };
}
```

### Development with direnv

```bash
# Install direnv hook in your shell config
# Then allow the project:
cd ~/mycelium-v2
direnv allow

# The Nix shell activates automatically when entering the directory
```

---

## Linux (Ubuntu, Debian, Fedora, etc.)

### Prerequisites

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Node.js (for compatibility)
# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Fedora:
sudo dnf install nodejs
```

### Installation

```bash
cd ~/mycelium-v2

# Install dependencies
bun install

# Build
bun run build

# Link CLI globally
cd packages/cli
bun link
```

### Running

```bash
# Development mode
bun scripts/dev.ts start

# Or manually:
bun run dev           # Backend only
bun run dev:client    # Frontend only

# Using the CLI
mycel stats
mycel tasks
```

### Systemd User Service (Optional)

Create `~/.config/systemd/user/mycelium.service`:

```ini
[Unit]
Description=Mycelium v2 Backend Server
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/repos/mycelium-v2
ExecStart=/home/%u/.bun/bin/bun run dev:server
Restart=on-failure
RestartSec=5
Environment=PORT=8765
Environment=HOST=0.0.0.0
Environment=DATABASE_PATH=%h/.config/mycelium-v2/mycelium.db
Environment=SCHEDULER_AUTO_START=true

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable mycelium
systemctl --user start mycelium
systemctl --user status mycelium
```

---

## macOS

### Prerequisites

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Node.js
brew install node@22
```

### Installation

Same as Linux:

```bash
cd ~/mycelium-v2
bun install
bun run build
cd packages/cli && bun link
```

### LaunchAgent (Optional)

Create `~/Library/LaunchAgents/com.mycelium.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mycelium.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/.bun/bin/bun</string>
        <string>run</string>
        <string>dev:server</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/repos/mycelium-v2</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>8765</string>
        <key>HOST</key>
        <string>0.0.0.0</string>
        <key>DATABASE_PATH</key>
        <string>/Users/YOUR_USERNAME/Library/Application Support/mycelium-v2/mycelium.db</string>
        <key>SCHEDULER_AUTO_START</key>
        <string>true</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/Library/Logs/mycelium-server.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/Library/Logs/mycelium-server.error.log</string>
</dict>
</plist>
```

Load the service:

```bash
launchctl load ~/Library/LaunchAgents/com.mycelium.server.plist
launchctl start com.mycelium.server
```

---

## Windows

### Prerequisites

1. **Install Bun**:
   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

2. **Install Node.js**: Download from https://nodejs.org/

3. **Install Git**: Download from https://git-scm.com/

### Installation

```powershell
cd C:\Users\YourName\repos\mycelium-v2

# Install dependencies
bun install

# Build
bun run build

# Link CLI globally
cd packages\cli
bun link
```

### Running

```powershell
# Development mode
bun scripts/dev.ts start

# Or manually
bun run dev           # Backend
bun run dev:client    # Frontend

# CLI
mycel stats
```

### Windows Task Scheduler (Optional)

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: "At log on"
4. Action: Start a program
   - Program: `C:\Users\YourName\.bun\bin\bun.exe`
   - Arguments: `run dev:server`
   - Start in: `C:\Users\YourName\repos\mycelium-v2`

---

## Configuration Paths by Platform

| Platform | Config Directory |
|----------|------------------|
| Linux/NixOS | `~/.config/mycelium-v2/` |
| macOS | `~/Library/Application Support/mycelium-v2/` |
| Windows | `%APPDATA%\mycelium-v2\` |

Files stored:
- `mycelium.db` - SQLite database
- `scheduler.json` - Scheduler configuration
- `telegram.json` - Telegram credentials
- `agents.json` - Agent settings
- `logs/` - Runtime logs

---

## Agent CLI Requirements

Mycelium dispatches to these agent CLIs (must be in PATH):

| Agent | Command | Installation |
|-------|---------|--------------|
| Claude Code | `claude` | `npm install -g @anthropic-ai/claude-code` |
| Codex | `codex` | `bun install -g @openai/codex` |
| Gemini | `gemini` | `bun install -g @anthropic-ai/gemini-cli` |
| Cline | `cline` | Cline CLI |
| Cursor | `agent` | Cursor Agent CLI |
| Kiro | `kiro-cli` | AWS Kiro CLI |
| Vibe | `vibe` | Mistral Vibe CLI |
| Pi | `pi` | Pi coding agent |
| OpenCode | `opencode` | OpenCode CLI |
| Copilot | `copilot` | GitHub Copilot CLI |

Agents are auto-detected on startup and managed via the DB-backed registry. Use `mycel registry detect` to re-detect.

---

## Troubleshooting

### Port already in use

```bash
# Check what's using the port
# Linux/macOS:
lsof -i :8765

# Windows:
netstat -ano | findstr :8765
```

### Database locked

Stop all mycelium processes and check for stale locks:

```bash
# Linux/macOS
rm ~/.config/mycelium-v2/mycelium.db-wal
rm ~/.config/mycelium-v2/mycelium.db-shm
```

### Agent not found

Ensure agent CLIs are in PATH:

```bash
which claude  # Should show path
```

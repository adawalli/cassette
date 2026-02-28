# macOS LaunchAgent Setup

Use a user LaunchAgent so the cassette runs continuously after login.

## 1. Create plist

Save this as `~/Library/LaunchAgents/com.example.cassette.plist` (replace `com.example` with your own reverse-domain prefix):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.example.cassette</string>

    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/bun</string>
      <string>run</string>
      <string>/path/to/cassette/index.ts</string>
      <string>--config</string>
      <string>/path/to/.config/cassette/config.yaml</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/path/to/cassette</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/path/to/Library/Logs/cassette.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/Library/Logs/cassette.error.log</string>
  </dict>
</plist>
```

Do not use `WatchPaths`. The app performs its own internal file watch loop.

## 2. Load agent

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.cassette.plist
launchctl kickstart -k gui/$(id -u)/com.example.cassette
```

## 3. Stop / unload

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.example.cassette.plist
```

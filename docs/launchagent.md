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

    <!-- Alternative: if you installed via npm (bun not required), use the cassette binary directly.
         Find the path with: which cassette
         Typical npm global bin paths: ~/.npm-global/bin/cassette or /usr/local/bin/cassette
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/cassette</string>
      <string>--config</string>
      <string>/path/to/.config/cassette/config.yaml</string>
    </array>
    -->

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>EnvironmentVariables</key>
    <dict>
      <key>OPENAI_API_KEY</key>
      <string>sk-...</string>
    </dict>

    <key>StandardOutPath</key>
    <string>/path/to/Library/Logs/cassette.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/Library/Logs/cassette.error.log</string>

    <key>WatchPaths</key>
    <array>
      <string>/path/to/.config/cassette/config.yaml</string>
    </array>
  </dict>
</plist>
```

`WatchPaths` on the config file causes launchd to restart cassette whenever config changes, picking up the new settings automatically. Do not add `WatchPaths` for the transcript directory (`watch.root_dir`) - cassette handles that watch internally.

## 2. Load agent

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.cassette.plist
launchctl kickstart -k gui/$(id -u)/com.example.cassette
```

## 3. Stop / unload

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.example.cassette.plist
```

## 4. Tail logs

Follow stdout and stderr in real time:

```bash
tail -f ~/Library/Logs/cassette.log
tail -f ~/Library/Logs/cassette.error.log
```

Or watch both streams together:

```bash
tail -f ~/Library/Logs/cassette.log ~/Library/Logs/cassette.error.log
```

The log level defaults to `info`. Set `LOG_LEVEL=debug` in the `EnvironmentVariables` dict of your plist for more verbose output.

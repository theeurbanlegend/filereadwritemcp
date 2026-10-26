# FileReadWrite agent

The agent runs on your machine, connects out to a FileReadWrite router, and runs the file and
command tools your MCP client calls. It only touches the folders and programs you allow.

## Install

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.ps1 | iex
```

The scripts download the latest release for your platform, check it against `SHA256SUMS`, and
install it as `frw-agent`: `~/.local/bin` on macOS and Linux, `%LOCALAPPDATA%\FileReadWrite\bin`
on Windows (added to your PATH). Set `FRW_VERSION=v1.2.3` to pin a version or `FRW_INSTALL_DIR`
to install elsewhere.

Prebuilt binaries: macOS (Apple Silicon and Intel), Linux x86_64, Windows x86_64. Anything else:
`cargo build --release` in this folder.

**Manual download:** grab `agent-<target>` from the Releases page, rename it to `frw-agent`
(`frw-agent.exe` on Windows), and make it executable. On macOS, files downloaded with a browser
are quarantined until releases are signed; clear it with `xattr -d com.apple.quarantine frw-agent`.

## First run

```bash
frw-agent
```

With no profile yet, it asks for the router URL, the enrollment code from your dashboard, a
name for this machine, and the folder it may access. Then it connects and keeps running.

| Command | What it does |
|---|---|
| `frw-agent` | Start. Uses the only profile, asks which one if there are several, enrolls if there are none. |
| `frw-agent --profile <name>` | Start one profile without prompting. Use this for services. |
| `frw-agent new` | Enroll another profile, e.g. a second account or router |
| `frw-agent config` | Edit a profile: router URL, allowed folders, allowed programs, auto-update |
| `frw-agent --version` | Print the version |

Profiles live in `file-read-write-agent/profiles/<name>/` in your OS config folder:
`~/Library/Application Support` on macOS, `~/.config` on Linux, `%APPDATA%` on Windows.
Restart the agent after changing a profile.

## Command approval

Every `runCommand` call asks you first:

| OS | Prompt |
|---|---|
| macOS | Native dialog |
| Linux | `zenity`, then `kdialog`, then a `[y/N]` prompt in the terminal |
| Windows | Windows popup |

Unanswered prompts are rejected after 90 seconds. With no display and no terminal, commands are
always rejected.

## Run it in the background

Enroll first by running `frw-agent` once in a terminal. Then set it up to start at login. Replace
`<name>` with your profile name.

### macOS (launchd)

Save as `~/Library/LaunchAgents/dev.filereadwrite.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.filereadwrite.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/YOU/.local/bin/frw-agent</string>
    <string>--profile</string>
    <string>NAME</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/Library/Logs/frw-agent.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/Library/Logs/frw-agent.log</string>
</dict>
</plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.filereadwrite.agent.plist
launchctl kickstart -k gui/$(id -u)/dev.filereadwrite.agent   # restart after config changes
launchctl bootout gui/$(id -u)/dev.filereadwrite.agent        # stop and unload
```

It runs in your login session, so approval dialogs still appear.

### Linux (systemd user service)

Save as `~/.config/systemd/user/frw-agent.service`:

```ini
[Unit]
Description=FileReadWrite agent
After=network-online.target

[Service]
ExecStart=%h/.local/bin/frw-agent --profile NAME
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now frw-agent
journalctl --user -u frw-agent -f          # logs
systemctl --user restart frw-agent         # after config changes
```

Approval dialogs need the service to know your display. Most desktops pass it on; if commands
are always rejected, run `systemctl --user import-environment DISPLAY WAYLAND_DISPLAY` and restart.
On a headless server there is nowhere to approve, so `runCommand` stays off in practice.

### Windows (Task Scheduler)

```powershell
$exe = "$env:LOCALAPPDATA\FileReadWrite\bin\frw-agent.exe"
$action = New-ScheduledTaskAction -Execute $exe -Argument '--profile NAME'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName 'FileReadWrite Agent' -Action $action -Trigger $trigger -Settings $settings
Start-ScheduledTask -TaskName 'FileReadWrite Agent'
```

It runs in your session (a console window stays open), so approval popups appear. Remove it with
`Unregister-ScheduledTask -TaskName 'FileReadWrite Agent'`.

## Updates

With auto-update on (the default), the agent downloads new releases from your router, checks the
SHA-256, replaces itself and restarts. Turn it off with `frw-agent config`.

## Testing on Windows

CI compiles and unit-tests the agent on Windows. These need a real Windows machine:

1. Install with `install.ps1`; check `frw-agent --version` works in a new terminal.
2. Enroll with a dashboard code. Check the profile lands in `%APPDATA%\file-read-write-agent\profiles`
   and the agent connects.
3. From an MCP client: `listAllowedResources` (paths should look like `C:\...`, not `\\?\C:\...`),
   `readFile`, `writeFile` on a new file, `searchForFilesWithNamesMatchingRegex`.
4. A path outside the allowed folder, including `..` tricks, is denied.
5. `runCommand` with `npm --version` (needs `npm` in the allow-list): the popup appears, approving
   runs it, denying or waiting 90 s rejects it.
6. Publish a newer test release and check the agent updates itself and reconnects.
7. The scheduled task starts the agent at login.

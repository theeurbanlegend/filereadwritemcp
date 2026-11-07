# FileReadWrite launcher

The desktop app (Tauri 2 + React). It runs the agent in `../binary` as a bundled helper,
shows the approval window, and lives in the menu bar / system tray.

## Develop

```sh
yarn install
yarn app:dev        # builds the agent for this machine, then starts the app
```

Other scripts:

| Script | What it does |
| --- | --- |
| `yarn agent` | Builds `../binary` into `src-tauri/binaries/frw-agent-<triple>` |
| `yarn icons` | Rebuilds every app and tray icon from `web/public/favicon.svg` and `icon-mono.svg` |
| `yarn app:build` | Release build of the installers for this machine |

Set `FRW_AGENT_BIN=/path/to/agent` to run a different agent binary.

## Releases

The launcher ships in the same GitHub release as the agent, with the same version, so
`releases/latest` keeps serving both.

Run `git release` from an up-to-date `main` (add the command once per clone with
`make git-alias`; it needs `gh auth login`). It commits your changes on a branch, opens a pull
request and merges it. When `agent/binary` or `agent/launcher` changed since the last tag, the
pull request also bumps the version in `agent/binary/Cargo.toml`,
`agent/launcher/package.json` and `agent/launcher/src-tauri/Cargo.toml`, and the merge is
tagged `vX.Y.Z`. Use `git release minor` or `major` for bigger bumps and `--dry-run` to see
the plan. CI refuses a tag that doesn't match all three versions.

CI then attaches, next to the `agent-<triple>` binaries:

| File | For |
| --- | --- |
| `FileReadWrite-macos-arm64.dmg`, `FileReadWrite-macos-x64.dmg` | macOS installers |
| `FileReadWrite-windows-x64-setup.exe` | Windows installer (per user, no admin) |
| `FileReadWrite-linux-x64.AppImage`, `FileReadWrite-linux-x64.deb` | Linux |
| `*.app.tar.gz`, `*.sig`, `latest.json` | In-app updates |

### Updates

The app checks `releases/latest/download/latest.json` 30 seconds after starting and every
6 hours, then offers "Install and restart". Update files are signed with the key whose public
half is in `src-tauri/tauri.conf.json`. CI needs the private half as repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password (empty if it has none)

A tagged build fails without the key, because released apps couldn't update themselves.
Losing the key means shipping a new public key in a manual release, so keep a backup.

The agent keeps updating itself as before. The app runs it from a copy in its data folder
and only replaces that copy when the bundled agent is newer.

### Unsigned builds

Installers aren't code-signed yet, so the first launch needs one extra step:

- macOS: System Settings → Privacy & Security → Open Anyway (the app is ad-hoc signed)
- Windows: "Windows protected your PC" → More info → Run anyway
- Linux: `chmod +x` the AppImage

Signing later means an Apple Developer ID (plus notarization) and a Windows Authenticode
certificate, passed to the same workflow through secrets.

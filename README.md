# FileReadWrite MCP

A remote MCP server that gives AI clients (Claude, Cursor, the MCP Inspector, …) sandboxed
access to files on **your own machines**, plus an approval-gated command runner.

It has two parts:

- **Router** (`router/`) — a hosted NestJS service. It speaks MCP over Streamable HTTP,
  handles accounts and auth (OAuth 2.1 + PKCE with dynamic client registration), and
  **forwards** every tool call to the right user's agent. It never touches files itself.
- **Dashboard** (`web/`) — a Vite + React app served on the router's domain, for signing up,
  adding and managing machines, and approving MCP clients.
- **Agent** (`agent/`) — a small Rust binary that runs on each user's machine. It holds the
  file/command tools and an allow-list, and dials **out** to the router over a WebSocket
  (Socket.IO), so it works behind NAT with no open ports.

```
MCP client --OAuth/HTTP--> Router --WebSocket--> Agent (your machine) --> files / commands
```

The join key is the **userId**: the OAuth token carries it, each enrolled agent is bound to
it, and the router only ever routes a user's calls to that user's own agents.

## Repository layout

| Path | What it is |
|---|---|
| `agent/` | Rust agent binary (tools, profiles, setup, self-updater) |
| `router/` | NestJS router: MCP endpoint, accounts, OAuth, enrollment, agent gateway, update distribution |
| `web/` | Dashboard: sign-up, machines, MCP clients, OAuth consent |
| `skills/file-read-write/` | Claude skill that teaches a model how to use these tools |
| `ONBOARDING.md` | Admin guide: creating users, enrollment codes, managing machines |
| `router/README.md` | Self-hosting guide |

---

## Using it

### 1. Create an account and get an enrollment code
Sign up at `https://<router>/signup` with email or GitHub. On the dashboard, click
**Add a machine** to get a one-time enrollment code (valid 15 minutes). See
[ONBOARDING.md](ONBOARDING.md) for the full walkthrough.

### 2. Run the agent on your machine
Install it with one command. The script picks your platform, checks the download against
`SHA256SUMS`, and installs it as `frw-agent`:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.ps1 | iex
```

Then run `frw-agent`. The first run enrolls the machine: it asks for the router URL, your
enrollment code, a machine name, a profile name, and the folder the agent may access. After that
it connects and stays running.

| Command | What it does |
|---|---|
| `frw-agent` | Start. With one profile it starts that one. With several it asks which one. With none it starts enrollment. |
| `frw-agent --profile <name>` | Start a specific profile without prompting (for services) |
| `frw-agent new` | Enroll this machine under another account or router as a new profile |
| `frw-agent config` | Edit a profile: router URL, allowed folders, allowed programs, auto-update |

[agent/README.md](agent/README.md) covers manual downloads, running the agent in the background
at login on macOS, Linux and Windows, and building from source.

#### Profiles and config
Profiles live in the OS config directory under `file-read-write-agent/profiles/<name>/`:
`~/Library/Application Support/…` on macOS, `~/.config/…` on Linux, `%APPDATA%\…` on Windows.
Each profile holds:

- `.env` contains `ROUTER_URL`, `AGENT_TOKEN` (long-lived; written with `0600` perms) and
  `FILE_ACCESS_CONFIG`.
- `file-access.json` holds the allow-list:

```json
{
  "allowedRoots": ["/Users/alice/projects"],
  "allowedExecutables": ["node", "yarn", "npm", "npx", "git", "tsc"],
  "autoUpdate": true
}
```

- `allowedRoots` lists the directories the tools may touch. They are canonicalized, so a symlink
  cannot be used to escape them.
- `allowedExecutables` lists the programs `runCommand` may start. Leave it empty to turn commands off.
- `autoUpdate`, when true, makes the agent download and swap in new releases pushed by the router
  (checked against SHA-256). The agent also checks for updates every 5 minutes.

Restart the agent after you change the config.

### 3. Connect your MCP client
Add a remote MCP server with URL `https://<router>/mcp` and transport **Streamable HTTP**.
The client registers itself and opens the sign-in page, where you sign in and approve the client.
Tool calls then run on your machine. The dashboard shows the exact URL to use.

### 4. Optional: install the skill
[`skills/file-read-write/SKILL.md`](skills/file-read-write/SKILL.md) teaches the model the
rules below (picking a machine, the hash protocol, command approval). Add the
`skills/file-read-write` folder as a skill in Claude, or copy it into `~/.claude/skills/` for
Claude Code.

### Self-hosting
To run your own router instead of the hosted one, follow [router/README.md](router/README.md).

---

## Tools (for the calling model)

These notes cover what the per-tool descriptions don't.

### Picking a machine
- **`getAgents`** is answered by the router. It lists your online machines (`agentId`, `name`,
  `lastSeenAt`).
- Every other tool takes an optional **`agentId`**. You can omit it when only one agent is
  online. When several are online, you must pass it.

### Where you can operate
Call **`listAllowedResources`** first. It returns the allowed roots and executables on that
machine. Use **absolute paths inside an allowed root**; anything outside fails with
`Access denied`. Roots can differ per machine and change between sessions, so check them
instead of assuming.

### Reading and exploring
- **`readFile(path, fromLine?, toLine?)`**: line numbers are 1-based. Without a range, large files are
  **truncated**. Check `truncated` / `bytes` / `lineCount`, then re-read with a range.
- **`getFolderContents(path)`** returns entries with `size` and `modified`.
- **`searchForFilesWithNamesMatchingRegex(path, queryRegex, caseInsensitive?)`** and
  **`searchForFilesWithContentMatchingRegex(...)`** search recursively and are case-insensitive by
  default. They skip `node_modules`, `.git`, `dist`, `build`, `.next`, and similar directories.
  Results are capped, so check `truncated`.

### Editing: the hash protocol
- **New file:** `writeFile(path, content)` needs no hash.
- **Overwriting an existing file:** pass its **current `hash`**, from `readFile` or a prior
  `writeFile`. If the file changed since then, you get **`Hash mismatch`**. Re-read the file and retry.
  The rule is read, then edit, then write.
- `fromLine`/`toLine` replace a line range. Omit both to replace the whole file.
- `writeFile` is text only. Don't use it for binary data.
- `deleteFile`, `createFolder` and `deleteFolder` act immediately, and the deletes cannot be
  undone.

### Running commands: `runCommand({ exe, args?, cwd? })`
- `exe` must be in the allow-list. `args` is an **array** and no shell is involved, so `;`, `|` and
  `$()` do nothing. `cwd` must be inside an allowed root and defaults to the first one.
- **Every call needs approval on the machine itself.** macOS shows a native dialog. Linux uses
  `zenity`, then `kdialog`, then a terminal `[y/N]` prompt. With no GUI and no terminal the
  command is denied. Expect a delay while a person decides. An unanswered prompt is rejected
  after 90 s. If the user rejects it, don't blindly retry.
- It returns `stdout`, `stderr` and `exitCode`, with a 120 s run timeout and capped output.
  Read these yourself to diagnose failures.

### Found a problem?
Flag it plainly to the user: what you ran, what you expected, what actually happened. The server
is actively maintained and that feedback is how it improves.

---

## Developing

### Router and dashboard
```bash
cp router/.env.example router/.env   # optional for development
make dev                    # Postgres, router and dashboard in Docker with live reload
make dev-migrate            # apply migrations
```

Open http://localhost:5173. `make dev-db` starts only Postgres if you'd rather run the router
(`yarn start:dev`) and dashboard (`yarn dev`) directly; see
[router/README.md](router/README.md#local-development).

Admin CLI: `yarn cli create-user --email <email> [--password <pw>]` and
`yarn cli create-enrollment --email <email>`.

To run your own router, see [router/README.md](router/README.md).

Key HTTP routes: `POST /mcp` (MCP), the OAuth endpoints (`/.well-known/*`, `/register`, `/authorize`,
`/token`), the dashboard API under `/api/*`, `POST /agent/enroll`, and `/agent/update/{webhook,download}`.

### Agent
```bash
cd agent
cargo run              # or: cargo run -- new / cargo run -- config / cargo run -- --profile <name>
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

- `agent/`: [MIT](agent/LICENSE)
- `router/`: [AGPL-3.0](router/LICENSE). If you run a modified router as a network service, you
  must make your modified source available to its users.

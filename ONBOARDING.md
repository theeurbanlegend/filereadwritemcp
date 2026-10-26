# Onboarding a New User & Their Agent(s)

How a user gets an account on a FileReadWrite router and connects one or more machines.
To set up a router first, see [router/README.md](router/README.md).

## How it works (30-second version)

- The **router** is a hosted service. It handles auth (OAuth 2.1 + PKCE, with dynamic
  client registration) and **forwards** every MCP tool call to the right user's agent.
  It never touches files itself.
- An **agent** runs on each user's own machine. It holds the file/command tools and an
  allow-list, and dials **out** to the router over WebSocket (so it works behind NAT).
- The join key is the **userId**: the OAuth token carries it, each enrolled agent is
  bound to it, and the router matches them. A user only ever reaches their own machines.

```
MCP client (Claude/Cursor) --OAuth--> Router --WebSocket--> Agent (user's PC) --> files
```

## Step 1: Create an account

Go to `https://<router>/signup` and sign up with **email and password** or **GitHub**.
Email sign-ups get a verification link (valid 24 hours) and can sign in once they click it.
GitHub sign-ups use the GitHub account's verified primary email and are ready immediately.

## Step 2: Get an enrollment code

On the dashboard, click **Add a machine**. You get a one-time code that expires in
**15 minutes**. Use one code per machine. Each account can enroll up to `MAX_AGENTS_PER_USER`
machines (10 by default).

### Admin alternative: the CLI

Admins can do Steps 1–2 for a user from the router host. In production these run inside the
container (`make sh` from the repository root); in development use `yarn cli` instead of `yarn cli:prod`.

```bash
yarn cli:prod create-user --email alice@example.com        # prints a generated password once
yarn cli:prod create-enrollment --email alice@example.com  # prints a one-time code
```

CLI-created users are already verified. Pass `--password <pw>` to choose the password.

---

## Step 3: Set up the agent on the user's machine

The agent is a single binary for macOS, Linux and Windows. The dashboard's **Add a machine**
panel shows the install command; it's also in [agent/README.md](agent/README.md):

```bash
curl -fsSL https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.sh | sh   # macOS / Linux
irm https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.ps1 | iex         # Windows PowerShell
```

Then run `frw-agent`. The first run enrolls the machine. It asks for:

1. **Router URL** (defaults to the hosted router; enter yours if self-hosting)
2. **Enrollment code** from Step 2
3. **Machine name**, the label the user sees in `getAgents`
4. **Profile name**, a short local id for this config
5. **Directory the agent may access**

It redeems the code, saves a profile, and connects:

```
Loaded 1 allowed root(s)
Connected to router; advertised N tool(s).
```

The router logs `Agent online: user=… agent=…`. That machine is now live.

### Profiles and settings

Each enrollment is saved as a **profile** in the OS config directory under
`file-read-write-agent/profiles/<name>/`: `~/Library/Application Support/…` on macOS,
`~/.config/…` on Linux and `%APPDATA%\…` on Windows. A profile holds:

- `.env` with `ROUTER_URL`, `AGENT_TOKEN` (long-lived, `0600` permissions) and `FILE_ACCESS_CONFIG`
- `file-access.json`:

```json
{
  "allowedRoots": ["/Users/alice/projects"],
  "allowedExecutables": ["node", "yarn", "npm", "npx", "git", "tsc"],
  "autoUpdate": true
}
```

- `allowedRoots`: directories the agent may read and write (canonicalized, so symlinks can't escape).
- `allowedExecutables`: programs `runCommand` may start. Each run still needs approval on the
  machine. Leave it empty to turn commands off.
- `autoUpdate`: install new agent releases automatically.

To change these, run `frw-agent config` and restart the agent. Other commands:

| Command | What it does |
|---|---|
| `frw-agent` | Start. Picks the only profile, asks if there are several, enrolls if there are none. |
| `frw-agent --profile <name>` | Start one profile without prompting (for services and headless machines) |
| `frw-agent new` | Enroll another profile, e.g. a second account or router |
| `frw-agent config` | Edit a profile's router URL, roots, executables and auto-update |

To start the agent automatically at login, see "Run it in the background" in
[agent/README.md](agent/README.md).

---

## Step 4: Connect an MCP client

In Claude / Cursor / the MCP Inspector, add the server:

- **URL:** `https://<router>/mcp`  (transport: **Streamable HTTP**)

The dashboard shows this URL with a copy button. On connect the client **registers itself**
(no manual client ID) and opens the router's sign-in page in the browser. Sign in with email or
GitHub, then **approve** the client on the consent screen. From then on tool calls run on the
user's machines. `runCommand` shows an approval prompt on the machine first.

---

## Multiple machines for one user

Repeat Steps 2–3 on each machine, with a fresh enrollment code per machine. Each connects under
the same `userId` with its own `agentId`.

The model calls `getAgents` to list the user's online machines, then passes `agentId` to target
one. With only one machine online, `agentId` can be left out.

## Managing & revoking

All from the dashboard:

- **Machines:** see which are online and when each was last seen, rename them, or revoke one.
  Revoking disconnects it immediately and its token stops working.
- **Rotate a machine's token:** revoke it and enroll it again (Steps 2–3).
- **MCP clients:** see which clients are connected and revoke one. Revoking stops it from
  refreshing its token; its current access token keeps working for up to an hour.
- **Account:** Settings → delete account removes the user, their machines and all tokens.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `No agent is connected for your account` | The agent isn't running, or the MCP client logged in as a different user than the agent is enrolled under. |
| `You have N agents online — pass the "agentId" argument` | Several machines are online. The model should call `getAgents` and pick one. |
| `Invalid or expired enrollment code` | Codes are one-time and last 15 minutes. Mint a fresh one (Step 2). |
| `No config profile found` | The agent was started without a terminal and has no profile. Run `frw-agent new` in a terminal first. |
| `Multiple profiles … Re-run with --profile <name>` | Several profiles and no terminal to pick from. Pass `--profile`. |
| `Access denied: path is outside the allowed roots` | Add the path with `frw-agent config`, then restart the agent. |
| `Command not approved by user. Nothing was run` | The user rejected the prompt, or nobody answered within 90 s. Approval uses a native dialog on macOS, `zenity` then `kdialog` on Linux, and a terminal `[y/N]` prompt otherwise. With no GUI and no terminal the command is denied. |
| macOS says the agent "cannot be opened" | It was downloaded with a browser, so Gatekeeper quarantined it. Use the install script, or run `xattr -d com.apple.quarantine frw-agent` until releases are signed. |
| `Verify your email before signing in` | Click the link in the verification email, or use "Resend email" on the sign-in page. |
| `You've reached the limit of N machines` | Revoke a machine on the dashboard, or raise `MAX_AGENTS_PER_USER`. |
| `Rate limit reached: too many tool calls this minute` | The account went over `TOOL_CALLS_PER_MINUTE`. Wait a minute. |
| OAuth login loops / 401 | Make sure the account exists and is verified, and that the client was approved on the consent screen. |

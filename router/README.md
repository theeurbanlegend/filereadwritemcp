# Self-hosting the router

The router is the hosted half of FileReadWrite. It serves MCP at `/mcp`, runs accounts and the
OAuth login, enrolls agents, and forwards tool calls to them. The web dashboard (`../web`) is
served next to it on the same domain. This guide runs everything on your own server with Docker
Compose: Postgres, the router, and the web image (Caddy), which serves the dashboard and handles
HTTPS. The Compose files and `Makefile` live in the repository root, and every `make` command
below runs from there. The router's settings are in `router/.env`, the website's in `web/.env`.

## Requirements

- A Linux server, such as Ubuntu. 1 vCPU and 1–2 GB RAM is plenty.
- A domain or subdomain with an **A record pointing at the server**, and ports 80 and 443 open.
  Caddy needs both to get a TLS certificate.
- Docker with the Compose plugin ([install guide](https://docs.docker.com/engine/install/)), and `make`.

## 1. Configure

```bash
git clone https://github.com/theeurbanlegend/filereadwritemcp.git
cd filereadwritemcp
cp router/.env.example router/.env
cp web/.env.example web/.env
```

Run Compose through `make`, which loads `router/.env`; plain `docker compose` needs
`--env-file router/.env`.

Edit `router/.env`:

| Variable | Set it to |
|---|---|
| `JWT_SECRET` | At least 32 random characters: `openssl rand -hex 32`. Signs access and agent tokens. The router refuses to start in production with a short or placeholder value. |
| `OAUTH_ISSUER` | Your public URL, e.g. `https://mcp.example.com` |
| `MCP_RESOURCE_URL` | The same URL plus `/mcp` |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | Lifetimes in seconds. The defaults are 1 hour and 30 days. |
| `RESEND_API_KEY` | Resend API key for verification and password-reset emails. If empty, emails are only printed to the router log. |
| `EMAIL_FROM` | Sender, e.g. `FileReadWrite <no-reply@mcp.example.com>`. Its domain must be verified in Resend. |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | Optional. Turns on "Continue with GitHub" (see below). |
| `MAX_AGENTS_PER_USER` | Machines each account may enroll. Default 10. |
| `TOOL_CALLS_PER_MINUTE` | Tool calls each account may make per minute. Default 120. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials. Use a strong password. |
| `DOMAIN` | Your domain without `https://`, e.g. `mcp.example.com` |
| `ACME_EMAIL` | Email for Let's Encrypt notices |
| `GITHUB_OWNER` / `GITHUB_REPO` | Where agent releases come from. Keep the defaults to get official releases. |
| `GITHUB_TOKEN` | Only needed if that repo is private (fine-grained token, Contents: read) |
| `GITHUB_WEBHOOK_SECRET` | Optional. Set it to get new releases pushed instantly (see step 4). |
| `RELEASES_DIR` | Leave as `/data/releases`; Compose mounts a volume there. |

`DATABASE_URL` is overridden inside Compose, so you only need it when running the router outside Docker.
Don't set `MCP_API_KEYS` on a multi-user server: every static key logs in as the same shared user.

The website's Privacy Policy and Terms name whoever runs the server. Fill them in before opening
signups: in `web/.env`, set `VITE_OPERATOR_NAME`, `VITE_CONTACT_EMAIL`, `VITE_JURISDICTION` (governing law, e.g. `England and Wales`), `VITE_HOSTING_PROVIDER`, and `VITE_BACKUP_RETENTION_DAYS` to match your backup rotation. Bump `VITE_LEGAL_UPDATED` whenever you change the policies. These values are built into the site, so rebuild after changing them (`make deploy`, or `make build up`). Until they're set, the pages show placeholders like `[Operator name]`. Both pages are starting drafts, not legal advice: have them reviewed for your jurisdiction.

## 2. Start it

From the repository root:

```bash
make up        # starts db, router and web
make migrate   # applies database migrations
make logs      # follow the logs
```

Check it's up: `https://<your-domain>` should show the landing page, and
`https://<your-domain>/.well-known/oauth-authorization-server` should return JSON.

### Email (Resend)
1. In Resend, add and verify your sending domain (DNS records).
2. Create an API key with "Sending access" and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on that domain, then `make restart`.

### GitHub login (optional)
1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Homepage URL: `https://<your-domain>`. Authorization callback URL:
   `https://<your-domain>/api/auth/github/callback`.
3. Generate a client secret and set `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`, then `make restart`.

GitHub logins use the account's verified primary email. If an account with that email already
exists, GitHub is linked to it.

## 3. Users and machines

Anyone can sign up at `https://<your-domain>/signup` with email or GitHub. From the dashboard
they add machines (each gets a one-time enrollment code), rename or revoke them, see connected
MCP clients, and delete their account. See [ONBOARDING.md](../ONBOARDING.md) for the walkthrough.

Admins can still create users and codes from the CLI inside the router container. CLI-created
users are marked as verified:

```bash
make sh
yarn cli:prod create-user --email alice@example.com          # prints a generated password once
yarn cli:prod create-enrollment --email alice@example.com    # one-time code, valid 15 minutes
```

## 4. Agent updates

On startup the router fetches the latest release from `GITHUB_OWNER/GITHUB_REPO`, caches the
`agent-<target>` binaries in `RELEASES_DIR`, and offers them to connected agents. Without a webhook,
the router only notices a newer release when it restarts.

To pick up new releases as soon as they're published, add a GitHub webhook on the release repo:

- **Payload URL:** `https://<your-domain>/agent/update/webhook`
- **Content type:** `application/json`
- **Secret:** the same value as `GITHUB_WEBHOOK_SECRET`
- **Events:** "Releases" only

Agents download updates from your router, never directly from GitHub, and check each binary's
SHA-256 before installing it. Users can turn auto-update off with `frw-agent config`.

## Day-to-day

| Task | Command |
|---|---|
| Status | `make ps` |
| Logs | `make logs` |
| Restart the router | `make restart` |
| Update to the latest code | `make deploy` (pulls, rebuilds, restarts), then `make migrate` |
| Database shell | `make db-shell` |
| Undo the last migration | `make migrate-revert` |
| Back up the database | `make backup` (writes `backups/mcp-<timestamp>.sql.gz`) |
| Restore a backup | `make restore FILE=backups/<file>.sql.gz` (asks you to type `restore`) |

**Monitoring.** `GET /api/health` returns `200 {"status":"ok"}` when the router and database
are up, and `503` otherwise. Docker uses it as the router's health check (`make ps` shows it), and
you can point an external monitor at it. Docker logs rotate at 5 × 10 MB per container, and Caddy
renews TLS certificates on its own.

**Backups.** Losing the database means every user has to sign up and enroll their machines again.
`make backup` writes a compressed dump to `backups/`; how often you run it and where you copy it is
up to you. `make restore` stops the router, loads the dump and starts it again. Restore a backup
into a router running the same version it was taken from, then run `make migrate` if you upgrade.

**Rotating `JWT_SECRET`.** Change it only if you think it leaked. MCP clients recover on their
own: their refresh tokens are stored in the database, not signed with the secret. Every agent
token stops working, though, so every machine must be enrolled again.

**Built-in limits.** Per IP, per minute:

| Endpoint | Limit |
|---|---|
| Sign-in, sign-up and email endpoints (`/api/auth/*`) | 10 |
| Client registration (`/register`), agent enrollment (`/agent/enroll`) | 10 |
| `/authorize` and consent | 30 |
| `/token` | 60 |
| Everything else except `/mcp` | 300 |
| Agent WebSocket connections | 20 |

On top of these:
- Five failed sign-ins lock that email for 15 minutes. A password reset unlocks it.
- `/mcp` is limited per account by `TOOL_CALLS_PER_MINUTE`.
- Every 6 hours the router deletes expired sessions, tokens and enrollment codes, plus registered
  clients that were never authorized within 30 days.

**Run one router instance only.** Connected agents and MCP sessions are kept in memory, so the
router can't be load-balanced across several instances. A restart drops open MCP sessions; agents
reconnect on their own and clients start a new session.

## Local development

The dashboard's dev server on port 5173 proxies API and OAuth paths to the router, so
`http://localhost:5173` is the public URL in development.

Everything in Docker, with live reload for both the router and the dashboard:

```bash
make dev           # db, router (nest --watch) and web (Vite); router/.env is optional
make dev-migrate   # first run, and after adding migrations
make dev-logs
```

Or run the router and dashboard on your machine, with only Postgres in Docker:

```bash
cp router/.env.example router/.env    # set OAUTH_ISSUER=http://localhost:5173 and MCP_RESOURCE_URL=http://localhost:5173/mcp
make dev-db             # Postgres on localhost:5432 (DEV_DB_PORT=… to change)
cd router && yarn install && yarn migration:run && yarn start:dev   # terminal 1
cd web && yarn install && yarn dev                                  # terminal 2
```

Use one or the other: both bind ports 3000 and 5173. After changing `package.json`, `make dev`
again rebuilds the images and reinstalls dependencies.

Leave `RESEND_API_KEY` empty and the verification and reset links are printed in the router log.
Point agents at `http://localhost:5173` too. `yarn cli create-user` and `yarn cli create-enrollment`
work in development as well.

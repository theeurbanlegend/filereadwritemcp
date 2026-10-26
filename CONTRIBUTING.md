# Contributing

Thanks for helping out. Bug reports, fixes and features are all welcome.

**Security issues:** don't open a public issue. Follow [SECURITY.md](SECURITY.md).

## Getting set up

- **Agent** (`agent/`): Rust, stable toolchain. `cargo run` starts it; `cargo run -- new` enrolls a profile.
- **Router** (`router/`): Node 22 + Yarn + Docker for Postgres. See the local development section
  in [router/README.md](router/README.md).
- **Dashboard** (`web/`): Node 22 + Yarn. `yarn dev` runs it on port 5173 and proxies to the router.

To try changes end to end, run the router locally, create a user and enrollment code with
`yarn cli`, then point a local agent at `http://localhost:3000`.

## Before opening a PR

CI runs these on every PR, so run them locally first:

Agent:
```bash
cd agent
cargo fmt --check
cargo clippy -- -D warnings
cargo build
```

Router:
```bash
cd router
yarn lint:check     # yarn lint fixes what it can
yarn typecheck
yarn test
```

Dashboard:
```bash
cd web
yarn typecheck
yarn build
```

Dashboard layout (`web/src`):
- `api/client.ts` is the only place that calls `fetch`; response shapes live in `api/types.ts`.
- Queries go in `hooks/queries/<feature>.ts` (keys in `hooks/queries/keys.ts`), mutations in
  `hooks/mutations/<feature>.ts`. Components and pages don't call `useQuery`/`useMutation` directly.
- Self-contained components go in `components/<feature>/`, one per file; shared primitives in
  `components/ui/`. Pages in `pages/` only compose them.
- Plain helpers (URLs, dates, validation, site config) go in `lib/`.

If you change the database entities, add a migration with `NAME=YourChange yarn migration:generate`.

## Guidelines

- Keep PRs focused on one change.
- Prefer clear names and small functions over comments. Add a comment only when the code can't
  explain itself.
- The agent is the security boundary. Changes to path checks, the allow-lists, command approval
  or self-update need a clear explanation of why they're safe.
- A new tool needs both halves: the implementation in `agent/src/common/` and its registration in
  `router/src/modules/mcp/mcp.service.ts`. Update `skills/file-read-write/SKILL.md` too.
- Update the README or docs when behavior users see changes.

## Licensing

Contributions to `agent/` are licensed under MIT and contributions to `router/` under AGPL-3.0,
matching each component's license.

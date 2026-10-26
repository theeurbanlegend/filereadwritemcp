## What and why

## How it was tested

## Checklist
- [ ] Agent: `cargo fmt --check`, `cargo clippy -- -D warnings` and `cargo build` pass
- [ ] Router: `yarn lint:check`, `yarn typecheck` and `yarn test` pass
- [ ] Dashboard: `yarn typecheck` and `yarn build` pass
- [ ] Migration added if entities changed
- [ ] Docs / `SKILL.md` updated if user-visible behavior changed
- [ ] Changes to path checks, allow-lists, command approval or self-update explain why they're safe

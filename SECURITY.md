# Security Policy

This project gives AI clients access to files and commands on users' machines, so we take
security reports seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub instead:
go to the repository's **Security** tab and click **Report a vulnerability**
(<https://github.com/theeurbanlegend/filereadwritemcp/security/advisories/new>).

Please include:
- which component is affected (`agent/`, `router/`, or both) and the version or commit
- steps to reproduce, or a proof of concept
- the impact you think it has

We'll acknowledge reports within a few days, keep you updated while we work on a fix, and
credit you in the advisory unless you'd rather stay anonymous.

## Scope

In scope:
- Sandbox escapes: reading or writing outside `allowedRoots`, or running executables not in
  `allowedExecutables`
- Bypassing the command approval prompt
- Reaching another user's agents or data through the router
- Authentication and OAuth flaws (login, tokens, client registration, enrollment)
- Tampering with agent self-update (binary download or checksum verification)

Out of scope:
- Issues that need an already-compromised user machine or router host
- Things a user explicitly allowed, such as an over-broad `allowedRoots` entry
- Denial of service through sheer request volume

## Supported versions

Only the latest agent release and the current `main` branch of the router get security fixes.

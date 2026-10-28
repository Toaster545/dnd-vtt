# Documentation index: entry point listing every doc in `docs/` with its purpose.

Last updated: 2026-10-28 (commit 00cb49a)

Documented up to: 00cb49a91332c16055f404118cf1e48d95e372e4 (2026-10-26)

## Documents

| Doc | Purpose |
|---|---|
| [overview.md](overview.md) | What the app is, tech stack, repo layout, and the commands to run, build, test and lint |

### Mobile (existing docs, kept as written)

These predate the documenter layout and have not yet been checked against the code in this pass; they do not carry the `Last updated` header.

| Doc | Purpose |
|---|---|
| [mobile/architecture.md](mobile/architecture.md) | How the mobile implementation relates to the single Angular app and NestJS backend |
| [mobile/capacitor-development.md](mobile/capacitor-development.md) | Capacitor requirements and development workflow |
| [mobile/pwa-installation.md](mobile/pwa-installation.md) | PWA installation and validation |
| [mobile/testing.md](mobile/testing.md) | Mobile test plan and evidence (dated 2026-08-16) |
| [mobile/implementation-audit.md](mobile/implementation-audit.md) | Mobile, PWA and Capacitor implementation audit (dated 2026-08-16) |

## Not yet documented

Outside the scope of the pass that produced this index; each will get its own doc and an entry in the table above.

- `CHANGELOG.md` (no baseline entry yet)
- Backend architecture: modules, auth and guards, storage and migrations, socket.io gateways, content service
- Frontend architecture: routing, `core/`, `shared/`, features, styling
- `data-model.md`: SQLite tables, the JSON character `data` blob, migrations
- `api/`: REST endpoints and socket events per module
- `features/`: one file per user-facing feature
- `operations/`: configuration, deployment (Cloudflare Tunnel, PM2), scripts, troubleshooting
- `decisions/`: architecture decision records
- Verification of the `mobile/` docs against the code

## Working documents

Owned by the user or other agents; the documenter reads and links them but does not edit them.

- [CLAUDE.md](../CLAUDE.md): instructions for coding agents
- [README.md](../README.md) (repo root): user-facing introduction
- [TODO.md](../TODO.md)
- [NOTICE.md](../NOTICE.md)
- [cline-tasks/](../cline-tasks/)

Sources: `docs/` (file listing), `git log -1` (commit 00cb49a).

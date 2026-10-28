# 0003 Single origin: NestJS serves the Angular build, exposed by one Cloudflare Tunnel

Purpose: records the single-server, single-origin deployment.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
Earlier commits pointed the frontend at a separate `api.` host for the tunnel setup (`e3705b0`) and added comma-separated CORS origins (`7c6d55e`).

## Decision
Commit `f259a20`: NestJS on port 3000 serves the Angular build and the API; one tunnel entry forwards the domain to `localhost:3000`; in development the Angular dev server proxies `/api`, `/uploads` and `/socket.io` to port 3000. Current `main.ts` registers `/uploads`, then the frontend static assets, then an SPA fallback for everything that is not `/api` or `/socket.io`; REST routes use the global prefix `api`.

## Consequences
- No separate frontend host; the frontend must be built before the backend serves it ([overview](../overview.md)).
- Same-origin requests need no CORS in production; native Capacitor builds use absolute URLs instead ([capacitor-development](../mobile/capacitor-development.md)).
- Details: [deployment](../operations/deployment.md), [backend](../architecture/backend.md).

Date: 2026-07-24
Commit: `f259a20` (Serve Angular build from NestJS — single port, single Cloudflare tunnel)

Sources: `CLAUDE.md` (Architecture), `dnd_vtt_backend/src/main.ts`, `git show f259a20`.

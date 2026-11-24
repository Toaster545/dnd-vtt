# 0006 15-minute access JWT with rotating refresh credential

Purpose: records the auth token model introduced with the mobile work.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
The mobile audit ([implementation-audit](../mobile/implementation-audit.md)) recorded a seven-day JWT in Local Storage with no rotation or revocation, and unauthenticated socket rooms.

## Decision
Commit `d1f2410` introduced refresh tokens (first appearance of `refresh_token` in `auth.service.ts`). Now: the access JWT expires in 15 minutes (`expiresIn: '15m'`); the refresh credential lasts 30 days, is rotated on use, and is delivered as an HttpOnly, SameSite=Strict cookie (`dnd_refresh_token`) on web. Native clients receive it in the response body and store it with `@aparajita/capacitor-secure-storage`. Sockets authenticate in the handshake (`SocketAuthService`).

## Consequences
- The frontend refreshes tokens and re-authenticates sockets when the access token rotates ([auth](../architecture/auth.md), [mobile architecture](../mobile/architecture.md#trust-boundaries)).

Date: 2026-08-16
Commit: `d1f2410` (First draft for Mobile Version)

Sources: `dnd_vtt_backend/src/auth/auth.module.ts`, `dnd_vtt_backend/src/auth/auth.controller.ts`, `dnd_vtt_backend/src/auth/auth.service.ts`, `dnd_vtt_backend/src/auth/socket-auth.service.ts`, `dnd_vtt_frontend/src/app/core/services/auth-token.service.ts`.

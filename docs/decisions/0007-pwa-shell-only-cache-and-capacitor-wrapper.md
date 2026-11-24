# 0007 PWA caches the app shell only; Capacitor wraps the same Angular build

Purpose: records the PWA and native-app approach.

Last updated: 2026-10-28 (commit 00cb49a)

## Context
Mobile support was added to the existing Angular app instead of a separate mobile codebase ([mobile architecture](../mobile/architecture.md)).

## Decision
Commit `d1f2410` added the Angular service worker config, a web manifest and Capacitor 8 (Android and iOS projects). `ngsw-config.json` defines `assetGroups` only and no `dataGroups`, so `/api` and `/uploads` are not cached; CI fails if `dataGroups` is non-empty. The service worker is disabled on native platforms; native builds call the absolute URLs in `environment.prod.ts`.

## Consequences
- Offline use covers the shell and static assets only.
- Native builds depend on the hosted origin for API and sockets ([capacitor-development](../mobile/capacitor-development.md), [pwa-installation](../mobile/pwa-installation.md)).

Date: 2026-08-16
Commit: `d1f2410`

Sources: `dnd_vtt_frontend/ngsw-config.json`, `dnd_vtt_frontend/capacitor.config.ts`, `dnd_vtt_frontend/src/app/app.config.ts`, `dnd_vtt_frontend/src/environments/environment.prod.ts`, `.github/workflows/ci.yml` (step "Verify PWA artifacts").

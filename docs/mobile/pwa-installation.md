# PWA installation and validation

Purpose: PWA installation and validation.

Last updated: 2026-10-28 (commit 00cb49a)

## Production preview

```powershell
cd dnd_vtt_frontend
npm ci
npm run build
cd ..\dnd_vtt_backend
npm ci
npm run build
npm run start:prod
```

Open `http://localhost:3000/home/dashboard`. Production output is `dnd_vtt_frontend/dist/dnd-app/browser`.

## Install

- Chromium desktop/Android: use the in-app **Install NatOne** button in the Settings dialog or the browser install action.
- iOS/iPadOS Safari: Share, then **Add to Home Screen**.
- The manifest (`name` and `short_name` `NatOne`) has start URL `/home/dashboard` and `display: standalone`. (unverified: safe-area layout.)

## Cache policy

`ngsw-config.json` has two asset groups: `app-shell` (prefetch: `/index.html`, `/manifest.webmanifest`, `/favicon.ico`, `/*.css`, `/*.js`, `/icons/**`) and `lazy-assets` (lazy install, prefetch update: woff2, woff, ttf, svg, png, jpg, jpeg, webp). It deliberately defines no `dataGroups`; `/api`, `/uploads`, Socket.IO, authenticated map images, and mutations are never service-worker cached.

CI runs an equivalent check (`ngsw.json` and `manifest.webmanifest` exist, `dataGroups` is empty). To verify manually after a production build (PowerShell; not part of any package script):

```powershell
Test-Path dist\dnd-app\browser\ngsw.json
Select-String -Path dist\dnd-app\browser\ngsw.json -Pattern '"/api/'
```

The first command must be true and the second must return no match. Test offline only after one online load installs the worker. Offline mode is read-only; queued mutations are out of scope (unverified). Update availability produces a reload prompt through `SwUpdate` in `PwaService` (the prompt wording was not checked).

Cinzel, Nunito, and Material Icons are bundled locally (`@fontsource/*` and `material-icons`, imported in `styles.scss`), so offline shell rendering does not call Google Fonts.

Sources: `dnd_vtt_frontend/ngsw-config.json`, `dnd_vtt_frontend/public/manifest.webmanifest`, `dnd_vtt_frontend/src/app/app.config.ts`, `dnd_vtt_frontend/src/app/core/services/pwa.service.ts`, `dnd_vtt_frontend/src/app/features/settings/settings-dialog.html`, `dnd_vtt_frontend/src/styles.scss`, `.github/workflows/ci.yml` (job `frontend-lint`, step "Verify PWA artifacts"). Build and start commands: [overview](../overview.md).

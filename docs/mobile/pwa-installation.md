# PWA installation and validation

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

- Chromium desktop/Android: use the in-app **Install D&D VTT** prompt or browser install action.
- iOS/iPadOS Safari: Share, then **Add to Home Screen**.
- The manifest start URL is `/home/dashboard`; standalone display and safe-area layout are enabled.

## Cache policy

`ngsw-config.json` prefetches the hashed app shell and lazily caches static fonts/images. It deliberately defines no `dataGroups`; `/api`, `/uploads`, Socket.IO, authenticated map images, and mutations are never service-worker cached.

Verify after a production build:

```powershell
Test-Path dist\dnd-app\browser\ngsw.json
Select-String -Path dist\dnd-app\browser\ngsw.json -Pattern '"/api/'
```

The first command must be true and the second must return no match. Test offline only after one online load installs the worker. Offline mode is read-only; queued mutations are out of scope. Update availability produces a controlled reload prompt.

Cinzel, Nunito, and Material Icons are bundled locally, so offline shell rendering does not call Google Fonts.

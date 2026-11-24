# Mobile test plan and evidence

Purpose: mobile test plan and evidence recorded on 2026-08-16.

Last updated: 2026-10-28 (commit 00cb49a)

Date: 2026-08-16. This is a point-in-time record; the results below were not re-run in this pass.

## Automated results

| Check | Result |
|---|---|
| Angular lint | Pass |
| Nest ESLint (non-fixing) | Pass |
| Angular unit tests | 93 passed (unverified, historical) |
| Nest unit tests | 160 passed (unverified, historical; [implementation-audit.md](implementation-audit.md) records 156) |
| Angular production/PWA build | Pass |
| Nest production build | Pass |
| Playwright desktop + Pixel 7 + iPad viewport (Chromium) | 9 passed (unverified, historical; `e2e/` now holds three spec files) |
| Capacitor Android/iOS sync | Pass; six plugins linked |
| Android debug compile | Blocked locally before Gradle: Java/JAVA_HOME unavailable |
| iOS compile | Not run; requires macOS/Xcode 26 |

The result cells were annotated (unverified, historical); the original numbers are unchanged.

Focused backend tests cover refresh rotation/replay rejection/logout revocation, draft autosave/resume/completion validation, and explicit current-session ownership. Playwright covers manifest/cache invariants, unauthorized route recovery, registration/login, dashboard routing, and mobile navigation.

## Manual device matrix

| Target | Required checks | Status |
|---|---|---|
| 360x800 Android phone | shell, wizard, sheet, map gestures, offline/update | Browser automation only |
| 390x844 iPhone | safe areas, Add to Home Screen, keyboard, map gestures | Not run |
| 768x1024 tablet | responsive shell and dialogs | Playwright Chromium pass |
| Desktop 1280+ | DM campaign/session/encounter/map regression | Build/unit + critical browser flow |
| Android emulator/device | secure storage, resume, network transitions, APK | Not run; local JDK missing |
| iOS simulator/device | Keychain, resume, keyboard/status bar, SPM build | Not run; macOS/Xcode required |

## Release gate

Before a private release, run the full Playwright matrix, `npm run android:debug`, an Android emulator and physical-device pass, an Xcode 26 simulator build, and at least one physical iPhone/iPad pass. Confirm hidden map cells cannot be recovered from network responses and guessed IDs receive 403/404. Record device/OS/browser versions and retain failure traces.

Lighthouse was not run in this environment. Run it against the production preview for installability, accessibility, best practices, and performance before release.

## Current automation

CI (pull requests to `main`) runs backend unit and e2e tests, build and lint; frontend format check, avatar compiler tests, lint, unit tests, production build and PWA artifact check; and the Playwright job `mobile-tests` (`npm run e2e`). Playwright projects: `desktop-chromium`, `phone` (Pixel 7), `tablet` (iPad gen 7 in Chromium).

Sources: `.github/workflows/ci.yml`, `dnd_vtt_frontend/playwright.config.ts`, `dnd_vtt_frontend/e2e/` (`critical.spec.ts`, `companions.spec.ts`, `magic-items.spec.ts`), `dnd_vtt_frontend/package.json` (`e2e`, `e2e:install`, `android:debug`). Other results: recorded in the original document, not re-verified.

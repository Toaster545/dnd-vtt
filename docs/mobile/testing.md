# Mobile test plan and evidence

Date: 2026-08-16

## Automated results

| Check | Result |
|---|---|
| Angular lint | Pass |
| Nest ESLint (non-fixing) | Pass |
| Angular unit tests | 93 passed |
| Nest unit tests | 160 passed |
| Angular production/PWA build | Pass |
| Nest production build | Pass |
| Playwright desktop + Pixel 7 + iPad viewport (Chromium) | 9 passed |
| Capacitor Android/iOS sync | Pass; six plugins linked |
| Android debug compile | Blocked locally before Gradle: Java/JAVA_HOME unavailable |
| iOS compile | Not run; requires macOS/Xcode 26 |

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

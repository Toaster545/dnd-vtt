# Capacitor development

Purpose: Capacitor requirements and development workflow.

Last updated: 2026-10-28 (commit 00cb49a)

## Requirements

- Node.js 22 or newer (CI uses Node 22).
- Capacitor 8.
- Android: JDK 21 (`capacitor.build.gradle`), `minSdkVersion` 24, `compileSdkVersion` 36. (Android Studio 2025.2.1+ is unverified.)
- iOS: macOS with Xcode 26 (unverified: the Xcode version is not recorded in the repo); deployment target iOS 15 (`IPHONEOS_DEPLOYMENT_TARGET = 15.0`). The project uses Swift Package Manager (`ios/App/CapApp-SPM`).

Identity: `NatOne`, application ID `ca.mathomelab.dndvtt`, web directory `dist/dnd-app/browser`.

Native production builds contain versioned Angular assets and do not use a remote `server.url`. Native builds use `https://dnd.mathomelab.ca/api` and `https://dnd.mathomelab.ca`; browser builds retain same-origin URLs. The service worker is disabled natively.

## Commands

```powershell
cd dnd_vtt_frontend
npm ci
npm run cap:sync
npm run cap:open:android
npm run cap:run:android
npm run android:debug
```

`android:debug` calls `gradlew.bat`, so it works on Windows only. The `Android Release Build` workflow (`workflow_dispatch`) runs `./gradlew assembleDebug` on Ubuntu with Node 22 and JDK 21.

On macOS:

```bash
cd dnd_vtt_frontend
npm ci
npm run cap:sync
npm run cap:open:ios
npm run cap:run:ios
```

App, Network, Status Bar, Splash Screen, Keyboard, and secure-storage plugins are linked. Refresh credentials use Keychain/Keystore; access credentials remain in memory.

Never commit signing keys, keystores, `.p12` files, provisioning profiles, `local.properties`, build directories, or IDE user data. Public store distribution is not configured.

Sources: `dnd_vtt_frontend/capacitor.config.ts`, `dnd_vtt_frontend/package.json` (scripts `cap:*`, `android:debug`; `@capacitor/*` ^8.0.0, `@aparajita/capacitor-secure-storage`), `dnd_vtt_frontend/src/environments/environment.prod.ts` (`apiUrl`, `wsUrl`), `dnd_vtt_frontend/src/app/app.config.ts` (`provideServiceWorker`), `dnd_vtt_frontend/android/variables.gradle`, `dnd_vtt_frontend/android/app/capacitor.build.gradle`, `dnd_vtt_frontend/ios/App/App.xcodeproj/project.pbxproj`, `.github/workflows/android-release.yml`. See also [scripts](../operations/scripts.md).

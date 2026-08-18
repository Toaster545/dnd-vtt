# Capacitor development

## Requirements

- Node.js 22 or newer.
- Capacitor 8.
- Android: Android Studio 2025.2.1+, JDK 21, Android SDK/API 24+.
- iOS: macOS with Xcode 26; deployment target iOS 15+. The generated project uses Swift Package Manager.

Identity: `D&D VTT`, application ID `ca.mathomelab.dndvtt`, web directory `dist/dnd-app/browser`.

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

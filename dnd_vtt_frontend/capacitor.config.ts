import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.mathomelab.dndvtt',
  appName: 'NatOne',
  webDir: 'dist/dnd-app/browser',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    StatusBar: { style: 'DARK', backgroundColor: '#090a0e' },
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#090a0e' },
    Keyboard: { resize: 'body' },
  },
};

export default config;

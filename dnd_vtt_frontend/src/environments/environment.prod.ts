import { Capacitor } from '@capacitor/core';

export const environment = {
  production: true,
  apiUrl: Capacitor.isNativePlatform() ? 'https://dnd.mathomelab.ca/api' : '/api',
  wsUrl: Capacitor.isNativePlatform() ? 'https://dnd.mathomelab.ca' : '/',
  devBypass: false,
};

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.spaacetime',
  appName: 'spaacetime',
  webDir: 'dist',
  server: {
    url: 'https://9e3e0ce6-5e59-4102-8283-3dbdc7dde026.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;

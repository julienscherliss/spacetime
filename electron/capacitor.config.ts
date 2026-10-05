import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spacetimelabs.spacetime',
  appName: 'Spacetime',
  // Opt in only for the isolated owned-backend device rehearsal.
  webDir: process.env.SPACETIME_MIGRATION_TEST === '1' ? '.migration-private/web-dist' : 'dist',
  server: {
    // For local development with hot-reload, uncomment the url below:
    // url: 'https://9e3e0ce6-5e59-4102-8283-3dbdc7dde026.lovableproject.com?forceHideBadge=true',
    // cleartext: true,
  },
};

export default config;

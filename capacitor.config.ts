/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dcc.salescrm',
  appName: 'DCC SFA',
  webDir: 'dist',

  // ─── LIVE UPDATE via Vercel ────────────────────────────────────────────────
  // The app loads all content from this URL instead of bundled files.
  // Push to GitHub → Vercel deploys → app shows new version on next open.
  // No APK rebuild or reinstall ever needed for code changes.
  server: {
    url: 'https://sales-crm-dcc.vercel.app',
    cleartext: false,
    allowNavigation: ['sales-crm-dcc.vercel.app', '*.supabase.co'],
  },

  android: {
    backgroundColor: '#F5F7FB',
    allowMixedContent: false,
    // Use the bundled dist/ as offline fallback when no internet
    useLegacyBridge: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#F5F7FB',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;

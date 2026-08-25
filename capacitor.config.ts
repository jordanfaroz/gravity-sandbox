import type { CapacitorConfig } from '@capacitor/cli';

// Must match the canvas clear colour in src/lib/renderer.ts and the <body>
// background in src/app/layout.tsx, so launch shows no white flash.
const SIM_BACKGROUND = '#0a0a0f';

const config: CapacitorConfig = {
  appId: 'com.jordanfaroz.nbody',
  appName: 'N-Body',
  webDir: 'out',
  backgroundColor: SIM_BACKGROUND,
  android: {
    backgroundColor: SIM_BACKGROUND,
  },
  plugins: {
    SplashScreen: {
      // Hand straight off to the WebView: the splash is the same colour as the sim,
      // so there is nothing to fade between and no reason to hold the screen.
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: SIM_BACKGROUND,
      showSpinner: false,
    },
    StatusBar: {
      // targetSdk 35+ forces edge-to-edge, so the sim draws under the system bars by
      // design. Light icons for the dark sky. Note: StatusBar backgroundColor is
      // ignored while overlaysWebView is true, so it is deliberately not set here.
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;

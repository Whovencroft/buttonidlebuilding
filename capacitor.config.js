/**
 * Capacitor configuration for browser-first host packaging.
 * Purpose: points native wrappers at Vite output under `dist`.
 */
const config = {
  appId: 'com.buttonidlebuilding.app',
  appName: 'Button Idle Building',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  }
};

export default config;

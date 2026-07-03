import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alertbxt.app',
  appName: 'AlertBxt',
  webDir: 'www',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      showSpinner: false,
      backgroundColor: '#ffffff'
    }
  }
};

export default config;

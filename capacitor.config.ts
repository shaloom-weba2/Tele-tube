import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.teletube.app',
  appName: 'TeleTube',
  webDir: 'dist',
  server: {
    url: 'https://ais-dev-xrybjigagaxtr43yuykh7k-33790480443.europe-west1.run.app',
    cleartext: true
  }
};

export default config;

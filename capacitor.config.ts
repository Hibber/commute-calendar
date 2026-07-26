import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.travis.commute',
  appName: 'commute-calendar',
  webDir: 'out',
  server: {
    url: 'https://schedule.triddle.dev',
    cleartext: true
  }
};

export default config;

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chamanagro.app',
  appName: 'Chamán',
  webDir: 'dist/browser',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    EdgeToEdge: {
      backgroundColor: '#000000',
    },
  },
  ios: {
    // Configuraciones específicas para iOS
    contentInset: 'automatic',
    scrollEnabled: true,
  },
};

export default config;

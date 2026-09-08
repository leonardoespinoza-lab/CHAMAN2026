import { CapacitorConfig } from '@capacitor/cli';
import { resolveNativeIdentity } from './scripts/native-identity.cjs';

const config: CapacitorConfig = {
  ...resolveNativeIdentity(),
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

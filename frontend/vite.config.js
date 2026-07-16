import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Keep Sentry out of react-vendor; loaded only when VITE_SENTRY_DSN is set
          if (id.includes('@sentry')) return 'sentry';
          if (id.includes('hls.js')) return 'hls';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('socket.io-client')) return 'socket';
          if (id.includes('livekit-client')) return 'livekit';
          if (id.includes('@emoji-mart')) return 'emoji';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.manus.computer'],
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: ['.manus.computer'],
  },
});

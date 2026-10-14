import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    watch: {
      // Polling keeps HMR responsive when the project is on a synced or
      // virtualized Windows filesystem where native file events can be missed.
      usePolling: true,
      interval: 500,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
});

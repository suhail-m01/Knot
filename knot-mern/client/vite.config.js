import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only ever talks to relative URLs (/api, /socket.io). Vite forwards them to the
// API server on the machine running Vite, so no backend address is ever shipped to the browser.
const API_TARGET = process.env.API_URL || 'http://localhost:5000';

const proxy = {
  '/api': { target: API_TARGET, changeOrigin: true },
  '/socket.io': { target: API_TARGET, changeOrigin: true, ws: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
});

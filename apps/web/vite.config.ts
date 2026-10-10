import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // changeOrigin: false keeps the Host header as the web origin, so the
      // httpOnly refresh-token cookie is set for (and sent back to) it.
      '/api': { target: API_TARGET, changeOrigin: false },
      '/mock-gateway': { target: API_TARGET, changeOrigin: false },
    },
  },
});

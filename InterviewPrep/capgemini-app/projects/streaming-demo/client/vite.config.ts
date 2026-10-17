import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5185,
    strictPort: true,
    // Same origin for the browser: /api (HTTP, SSE and the WebSocket) is proxied to FastAPI, so no CORS is needed.
    proxy: { '/api': { target: 'http://localhost:8010', ws: true } },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});

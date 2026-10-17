import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { hubApi } from './server/hub-api';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // The portfolio folder holds every app; .hub/ keeps the PIDs and logs of apps the hub started.
    hubApi({ portfolio: fileURLToPath(new URL('..', import.meta.url)), stateDir: `${here}.hub` }),
  ],
  server: { port: 5180, strictPort: true, watch: { ignored: ['**/.hub/**'] } },
  preview: { port: 5180, strictPort: true },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

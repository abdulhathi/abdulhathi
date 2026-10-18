import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { wordsPlugin } from './server/words';

export default defineConfig({
  plugins: [
    react(),
    // Select-a-word popup: translate (MyMemory) and explain (Claude), served by the dev server.
    wordsPlugin({ header: 'x-auth-lab' }),
  ],
  // Relative asset paths, so the build works from any folder or a GitHub Pages subpath.
  base: './',
  // The bundle carries every chapter and every tested snippet file, by design.
  build: { chunkSizeWarningLimit: 4000 },
  server: { watch: { ignored: ['**/snippets/**/node_modules/**', '**/snippets/.venv/**', '**/snippets/**/bin/**', '**/snippets/**/obj/**'] } },
  test: {
    // snippets/ holds each stack's own test suites; scripts/verify.mjs runs those.
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20_000,
  },
});

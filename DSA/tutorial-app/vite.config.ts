import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from any folder or a GitHub Pages subpath.
  base: './',
  // The main bundle carries every chapter's problem data and the LeetCode snapshot (about 680 kB gzipped),
  // so the tracker, drill and search work offline; chapter bodies load on demand.
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

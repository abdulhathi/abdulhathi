import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from any folder or a GitHub Pages subpath.
  base: './',
  // The bundle carries every chapter and every tested project file (about 500 kB gzipped), by design.
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    // snippets/ holds the practice projects' own node:test suites; they are shown, not run here.
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

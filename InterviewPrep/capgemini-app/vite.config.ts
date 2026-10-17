import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from any folder or a GitHub Pages subpath.
  base: './',
  // Every chapter's Markdown is bundled up front so the drill and mock interview work offline.
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { evaluatorPlugin } from './server/evaluate';
import { runPlugin } from './server/run-api';

export default defineConfig(({ mode }) => {
  // ANTHROPIC_API_KEY may live in .env.local; an `ant auth login` profile works without it.
  const env = loadEnv(mode, process.cwd(), 'ANTHROPIC_');
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  return {
    plugins: [
      react(),
      evaluatorPlugin(fileURLToPath(new URL('./content', import.meta.url))),
      runPlugin(fileURLToPath(new URL('.', import.meta.url))),
    ],
    // Runs write to .runs/ and exercises are data: neither should reload the page.
    server: { watch: { ignored: ['**/.runs/**', '**/.venv/**'] } },
    // Relative asset paths, so the build works from any folder or a GitHub Pages subpath.
    base: './',
    // Every chapter's Markdown is bundled up front so the drill and mock interview work offline.
    build: { chunkSizeWarningLimit: 5000 },
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Some tests render all 84 chapters or start real processes; leave room for a busy machine.
      testTimeout: 20_000,
    },
  };
});

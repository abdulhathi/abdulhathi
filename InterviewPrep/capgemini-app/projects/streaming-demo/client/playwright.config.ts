import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the real backend and the Vite dev server, in the Chrome already installed on this
// machine (channel: 'chrome'), so no browser download is needed. Playwright starts both servers and stops them.
const python = process.env.PYTHON ?? '../../../.venv/bin/python'; // the lab's virtual environment

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5185', trace: 'retain-on-failure' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port 8010`,
      cwd: '../backend',
      url: 'http://localhost:8010/docs',
      reuseExistingServer: !process.env.CI,
      env: { DEMO_TOKEN_DELAY: '0.01', DEMO_TOOL_DELAY: '0.1', DEMO_APPROVAL_TIMEOUT: '60' },
    },
    { command: 'npm run dev', url: 'http://localhost:5185', reuseExistingServer: !process.env.CI },
  ],
});

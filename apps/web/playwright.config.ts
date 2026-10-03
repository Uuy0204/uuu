import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4321', trace: 'retain-on-failure' },
  projects: [
    ...[320, 375, 390, 430].map((width) => ({
      name: `android-chrome-${width}`, use: { ...devices['Pixel 7'], viewport: { width, height: 800 } },
    })),
    { name: 'iphone-safari', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node ../server/dist/index.js',
    url: 'http://127.0.0.1:4321/health',
    env: { PORT: '4321' },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

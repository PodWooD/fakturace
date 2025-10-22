// Playwright configuration for Fakturace testing
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './',
  testMatch: '**/*-playwright.spec.js',

  // Run tests in headed mode (visible browser) by default
  use: {
    headless: false,  // Show browser window
    slowMo: 500,      // Slow down by 500ms per action (easier to follow)
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Test timeout
  timeout: 60000,  // 60 seconds per test

  // Reporter
  reporter: [
    ['list'],  // Show test progress in console
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],

  // Projects (browsers to test)
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],

  // Web server (if needed - uncomment if you want Playwright to start your services)
  // webServer: {
  //   command: 'npm run dev',
  //   port: 3030,
  //   timeout: 120000,
  //   reuseExistingServer: true,
  // },
});

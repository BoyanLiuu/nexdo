import { defineConfig, devices } from "@playwright/test";

const PORT = 3133;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  // Runs before anything else: these tests write, so they must not be pointed at
  // a database holding real accounts. See tests/guard-database.ts.
  globalSetup: "./tests/guard-database.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry locally. These tests drive a real database over a real network, so
  // a rare timing flake is not the same as a defect — but anything that fails
  // twice is worth looking at.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["html", { open: "never" }]],
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `next build && next start -H 127.0.0.1 -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

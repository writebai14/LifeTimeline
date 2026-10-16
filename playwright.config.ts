import { defineConfig } from "@playwright/test";
// Readiness probes must reach the local fixture, even on hosts with an HTTP proxy.
process.env.NO_PROXY = [
  process.env.NO_PROXY,
  process.env.no_proxy,
  "localhost",
]
  .filter(Boolean)
  .join(",");
process.env.no_proxy = process.env.NO_PROXY;
export default defineConfig({
  testDir: "test/browser",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5189",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx test/browser-server.ts",
    url: "http://localhost:5189/health/ready",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["boutique.spec.ts", "frameworks.spec.ts"],
  outputDir: "../.artifacts/example-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4390",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium" }],
  webServer: [
    {
      command:
        "pnpm --filter example-react build && pnpm --filter example-react exec vite preview --host 127.0.0.1 --port 4390 --strictPort",
      cwd: "..",
      url: "http://127.0.0.1:4390",
      reuseExistingServer: process.env.CI === undefined,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter example-vue build && pnpm --filter example-vue exec vite preview --host 127.0.0.1 --port 4391 --strictPort",
      cwd: "..",
      url: "http://127.0.0.1:4391",
      reuseExistingServer: process.env.CI === undefined,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter example-solid build && pnpm --filter example-solid exec vite preview --host 127.0.0.1 --port 4392 --strictPort",
      cwd: "..",
      url: "http://127.0.0.1:4392",
      reuseExistingServer: process.env.CI === undefined,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter example-svelte build && pnpm --filter example-svelte exec vite preview --host 127.0.0.1 --port 4393 --strictPort",
      cwd: "..",
      url: "http://127.0.0.1:4393",
      reuseExistingServer: process.env.CI === undefined,
      timeout: 120_000,
    },
  ],
});

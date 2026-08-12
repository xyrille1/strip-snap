import { defineConfig, devices } from "@playwright/test";

/**
 * Narrowly-scoped smoke coverage, not a full visual-regression suite — see
 * tests/e2e/README.md. `webServer` only backs the overflow-check spec
 * (routes reachable without a live session/camera/Supabase); the
 * StripEditor export-dimension spec loads a static fixture directly and
 * doesn't need the app server at all.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
    // Lets overflow-check.spec.ts navigate with relative paths (page.goto("/")
    // etc.) — required by Playwright, must match webServer's port below.
    baseURL: "http://localhost:3100",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-dpr2",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 2 },
      testMatch: /strip-editor-export\.spec\.ts/,
    },
  ],
  webServer: {
    // A production server (build + start), not `next dev`: the dev server's
    // request handling logs a benign but noisy `Error: aborted`/ECONNRESET
    // uncaughtException every time a page navigates away or a parallel
    // worker tears down mid-request — harmless (tests still pass either
    // way), but real errors shouldn't have to be picked out of that noise.
    // `next start` doesn't have this dev-only behavior. Explicit port: 3000
    // is often already occupied by an unrelated local process, and next's
    // auto-fallback-to-next-port behavior would otherwise desync from this
    // config's `url`.
    command: "npm run build && npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    // Generous enough to cover a full production build, not just server boot.
    timeout: 300_000,
  },
});

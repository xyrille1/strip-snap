import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Node/Vitest doesn't set the `react-server` export condition Next.js's
      // bundler uses to no-op this package, so it throws on import outside Next.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // tests/e2e is Playwright's testDir (see playwright.config.ts, `npm run
    // test:e2e`) — its specs call Playwright's test()/beforeAll(), which
    // throws when picked up by Vitest's own runner instead.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    // Integration tests share one local Supabase (Docker) stack across many
    // concurrent test files; under load (esp. Docker Desktop on Windows)
    // round-trips that take <150ms in isolation can exceed the 5s default
    // when dozens of files hit it at once. 20s gives real headroom without
    // masking an actually-hung request.
    testTimeout: 20000,
  },
});

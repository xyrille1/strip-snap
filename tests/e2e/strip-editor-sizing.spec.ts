import { test, expect } from "@playwright/test";
import { startFixtureServer } from "./fixture-server";

/**
 * Verifies the fluid on-screen sizing in components/booth/StripEditor.tsx's
 * sizing effect actually grows the canvas with available space, rather than
 * staying pinned near a fixed size — the thing the old two-breakpoint
 * max-h/max-w scheme couldn't do. Not DPR-specific, so this only runs under
 * the default `chromium` project (see playwright.config.ts's `testMatch` on
 * `chromium-dpr2`, scoped to strip-editor-export.spec.ts only).
 */
let server: Awaited<ReturnType<typeof startFixtureServer>>;

test.beforeAll(async () => {
  server = await startFixtureServer();
});

test.afterAll(async () => {
  await server.close();
});

test("canvas display size grows on a wide/tall viewport vs. a narrow one", async ({ page }) => {
  const fixtureUrl = `${server.baseUrl}/tests/e2e/fixtures/strip-editor-sizing.html`;

  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => (window as unknown as { __fabricReady?: boolean }).__fabricReady === true);
  const mobile = await page.evaluate(
    () => (window as unknown as { __lastComputed: { displayWidth: number; isRowLayout: boolean } }).__lastComputed
  );
  expect(mobile.isRowLayout).toBe(false);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150); // let the ResizeObserver callback settle
  const laptop = await page.evaluate(
    () => (window as unknown as { __lastComputed: { displayWidth: number; isRowLayout: boolean } }).__lastComputed
  );
  expect(laptop.isRowLayout).toBe(true);
  expect(laptop.displayWidth).toBeGreaterThan(mobile.displayWidth);
});

import { test, expect } from "@playwright/test";
import { startFixtureServer } from "./fixture-server";

/**
 * Loads tests/e2e/fixtures/strip-editor-sizing.html — a faithful replica of
 * components/booth/StripEditor.tsx's Fabric canvas setup and fluid-sizing
 * effect, standing in for the real component so this can run without a live
 * session/Supabase/camera flow.
 *
 * Guards the one thing this responsiveness pass changed that unit tests
 * structurally can't verify (no real Canvas/Fabric rendering in jsdom):
 * `enableRetinaScaling: true` doesn't change the exported PNG's pixel
 * dimensions — verified at both DPR 1 (default `chromium` project) and DPR 2
 * (the `chromium-dpr2` project in playwright.config.ts, which only targets
 * this file — see tests/e2e/strip-editor-sizing.spec.ts for the on-screen
 * sizing check, which isn't DPR-specific and doesn't need to run twice).
 */
let server: Awaited<ReturnType<typeof startFixtureServer>>;

test.beforeAll(async () => {
  server = await startFixtureServer();
});

test.afterAll(async () => {
  await server.close();
});

test("exported strip image dimensions match the fixed backstore size at this device's DPR", async ({
  page,
}) => {
  await page.goto(`${server.baseUrl}/tests/e2e/fixtures/strip-editor-sizing.html`);
  await page.waitForFunction(() => (window as unknown as { __fabricReady?: boolean }).__fabricReady === true);

  const expected = await page.evaluate(
    () => (window as unknown as { __canvasExpected: { width: number; height: number } }).__canvasExpected
  );
  const actual = await page.evaluate(() =>
    (window as unknown as { __exportCheck: () => Promise<{ width: number; height: number }> }).__exportCheck()
  );

  expect(actual).toEqual(expected);
});

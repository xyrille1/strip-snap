import { test, expect } from "@playwright/test";

/**
 * Scoped to routes reachable without a live session/camera/Supabase state —
 * the rest of the booth flow (waiting/capture/preview/style/generate/output)
 * needs a real session + Realtime + camera permissions to drive automatically
 * and is covered by manual QA instead (see the responsiveness plan's
 * verification matrix). Asserts no horizontal scroll appears at any matrix
 * width — app/globals.css's `overflow-x: hidden` on html/body is a defensive
 * guard, not something that should ever actually be "doing work"; if a page
 * needs it to avoid a visible scrollbar, that's a layout bug to fix, not
 * something this test should treat as passing.
 */
const ROUTES = ["/", "/session/new"];

const VIEWPORTS = [
  { name: "phone-floor", width: 320, height: 568 },
  { name: "phone-360", width: 360, height: 740 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
];

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route} has no horizontal overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
}

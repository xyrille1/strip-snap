import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

/**
 * Minimal static server rooted at the repo root, so fixture HTML files under
 * tests/e2e/fixtures/ can use relative ES module imports into node_modules
 * (e.g. fabric) without a bundler. Needed because file:// navigation hits
 * Chromium's CORS policy for cross-origin module fetches.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".map": "application/json",
};

export function startFixtureServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const filePath = path.join(REPO_ROOT, decodeURIComponent((req.url ?? "/").split("?")[0]));
    // A bare `startsWith(REPO_ROOT)` is bypassable by a sibling directory
    // whose name happens to share the same prefix (e.g. `strip-snap-secrets`)
    // — require the repo root's own path separator as a boundary.
    const isInsideRepoRoot = filePath === REPO_ROOT || filePath.startsWith(REPO_ROOT + path.sep);
    if (!isInsideRepoRoot || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

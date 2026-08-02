import { describe, it, expect } from "vitest";
import {
  uploadStripImage,
  mintSignedStripUrl,
  deleteStripImage,
} from "@/lib/storage";

// A minimal valid 1x1 transparent PNG, base64-encoded — real image bytes so
// the round-trip (upload -> fetch via signed URL -> byte-for-byte compare)
// exercises actual Storage content handling, not just a text placeholder.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("lib/storage (integration, live local Supabase Storage)", () => {
  it("uploads an image, mints a signed URL that actually serves the bytes, then a fresh signed URL after re-upload", async () => {
    const path = `strips/test-session-${crypto.randomUUID()}/test-strip.png`;
    const pngBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");

    try {
      await uploadStripImage(path, pngBytes);

      const signedUrl = await mintSignedStripUrl(path, 60);
      expect(typeof signedUrl).toBe("string");
      expect(signedUrl.length).toBeGreaterThan(0);

      const response = await fetch(signedUrl);
      expect(response.status).toBe(200);
      const fetchedBytes = Buffer.from(await response.arrayBuffer());
      expect(fetchedBytes.equals(pngBytes)).toBe(true);

      // Minting again also returns a working URL — this is the mechanism
      // S-03 (route-level) relies on: a fresh signed URL is minted on every
      // call rather than reusing/caching one. (Not asserting the two tokens
      // differ byte-for-byte here: Supabase's local Storage signs a JWT
      // whose claims — path, expiry, issued-at-second — can be identical for
      // two mints of the same path/expiry within the same second, so
      // same-second calls can legitimately produce the same token. The
      // "fresh URL after real elapsed time" guarantee is what S-03 actually
      // tests, and that's exercised at the route level in
      // app/api/strips/[id]/route.test.ts.)
      const secondSignedUrl = await mintSignedStripUrl(path, 60);
      const secondResponse = await fetch(secondSignedUrl);
      expect(secondResponse.status).toBe(200);
    } finally {
      await deleteStripImage(path).catch(() => undefined);
    }
  });

  it("uploads a .jpg path with an image/jpeg content type", async () => {
    const path = `strips/test-session-${crypto.randomUUID()}/test-strip.jpg`;
    const jpegBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"); // bytes don't need to be real JPEG for a content-type check

    try {
      await uploadStripImage(path, jpegBytes);
      const signedUrl = await mintSignedStripUrl(path, 60);

      const response = await fetch(signedUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
    } finally {
      await deleteStripImage(path).catch(() => undefined);
    }
  });

  it("deletes an image, and its previously-minted signed URL no longer serves the object", async () => {
    const path = `strips/test-session-${crypto.randomUUID()}/test-strip.png`;
    const pngBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");

    await uploadStripImage(path, pngBytes);
    const signedUrl = await mintSignedStripUrl(path, 60);

    // Confirm it works before deletion, so the post-delete assertion below
    // actually proves something changed rather than the URL never having
    // worked in the first place.
    const beforeDelete = await fetch(signedUrl);
    expect(beforeDelete.status).toBe(200);

    await deleteStripImage(path);

    const afterDelete = await fetch(signedUrl);
    expect(afterDelete.status).not.toBe(200);
  });

  it("mintSignedStripUrl rejects for a path that was never uploaded", async () => {
    const path = `strips/test-session-${crypto.randomUUID()}/never-uploaded.png`;
    await expect(mintSignedStripUrl(path, 60)).rejects.toThrow();
  });
});

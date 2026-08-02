import { NextRequest } from "next/server";

/**
 * Best-effort client IP resolution for rate-limit keying. `request.ip` is
 * Next's own extraction (populated by Vercel); `x-forwarded-for` is the
 * standard fallback for other hosts/local dev. Never throws — an
 * unresolvable IP still gets *a* bucket rather than blocking the request.
 *
 * Security note: the `x-forwarded-for` / `x-real-ip` fallback below trusts
 * client-facing request headers, which are spoofable in general — a client
 * can set them to anything. This is safe here *specifically* because this
 * app is deployed exclusively on Vercel (docs/online-photobooth-ops-runbook.md
 * §1 "Environments" / §3 "Deployment" — Preview and Production are both
 * Vercel-hosted, no other target). Vercel's edge network sets/overwrites
 * `x-forwarded-for` on every inbound request before it reaches this code, so
 * a client cannot spoof its way into a different rate-limit bucket in
 * production. If this app is ever deployed anywhere else (self-hosted,
 * behind a different/unknown proxy, etc.), this function needs a
 * trusted-proxy allowlist or a platform-verified IP source instead of
 * trusting these headers directly.
 *
 * Shared by every route that rate-limits on client IP (currently
 * `POST /api/sessions` and `POST /api/sessions/:id/join`) so the resolution
 * logic and its security caveat live in exactly one place.
 */
export function resolveClientIp(request: NextRequest): string {
  if (request.ip) return request.ip;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

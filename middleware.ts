import { NextResponse } from "next/server";

/**
 * Pass-through for now. Becomes `clerkMiddleware()` once `@clerk/nextjs` is
 * installed (Step 4 Item 2) — its real job there is just exposing `auth()`;
 * MVP scope has no account-only pages, so the actual authorization check
 * lives in the `/upgrade` route handler, not here.
 */
export function middleware() {
  return NextResponse.next();
}

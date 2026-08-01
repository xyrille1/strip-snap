import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * MVP scope has no account-only pages, so this middleware's only real job is
 * making `auth()` available app-wide — it does NOT hard-redirect any route.
 * The actual authorization decision (401 if not signed in) lives in the
 * `/upgrade` route handler itself, since F-21/F-22 require an inline
 * sign-in prompt mid-flow, not a redirect-away.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

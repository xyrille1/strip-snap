import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/webhooks/clerk — Clerk `user.created` / `user.updated` /
 * `user.deleted` webhook.
 * Real implementation (Step 4 Item 2): once `@clerk/nextjs` (and svix) is
 * installed, verify the request signature with CLERK_WEBHOOK_SECRET, then
 * route `user.created`/`user.updated` to lib/db/appUsers.ts#getOrCreateByClerkId
 * and `user.deleted` to #softDeleteByClerkId. Neither function has a caller yet.
 */
export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    { received: false, note: "not implemented" },
    { status: 501 }
  );
}

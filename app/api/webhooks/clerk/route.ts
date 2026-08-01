import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { getOrCreateByClerkId, softDeleteByClerkId } from "@/lib/db/appUsers";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
  };
}

/**
 * POST /api/webhooks/clerk — Clerk `user.created` / `user.updated` /
 * `user.deleted` webhook.
 *
 * Verifies the request signature with svix + CLERK_WEBHOOK_SECRET before
 * trusting the payload (Clerk signs every webhook delivery; an unverified
 * body could be spoofed by anyone who knows this URL). `user.created` and
 * `user.updated` both route to `getOrCreateByClerkId` — idempotent, so it's
 * safe to call on every update too, not just first creation.
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhooks/clerk] CLERK_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { received: false, error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { received: false, error: "Missing svix headers" },
      { status: 400 }
    );
  }

  const body = await request.text();

  let event: ClerkWebhookEvent;
  try {
    const webhook = new Webhook(webhookSecret);
    event = webhook.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("[webhooks/clerk] signature verification failed", err);
    return NextResponse.json(
      { received: false, error: "Invalid signature" },
      { status: 400 }
    );
  }

  const clerkId = event.data.id;

  switch (event.type) {
    case "user.created":
    case "user.updated":
      await getOrCreateByClerkId(clerkId);
      break;
    case "user.deleted":
      await softDeleteByClerkId(clerkId);
      break;
    default:
      // Unhandled event types are acknowledged, not errors — Clerk sends
      // many event types this app doesn't care about.
      break;
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

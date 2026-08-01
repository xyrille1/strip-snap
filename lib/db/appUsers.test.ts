import { describe, it, expect, afterEach } from "vitest";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrCreateByClerkId, softDeleteByClerkId, getById } from "@/lib/db/appUsers";

describe("lib/db/appUsers (integration, live local Supabase)", () => {
  let createdId: string | null = null;

  afterEach(async () => {
    if (createdId) {
      const supabase = createServiceRoleClient();
      await supabase.from("app_users").delete().eq("id", createdId);
      createdId = null;
    }
  });

  it("creates a new row on first call, then returns the existing row on a second call", async () => {
    const clerkId = `clerk_test_${crypto.randomUUID()}`;

    const created = await getOrCreateByClerkId(clerkId);
    createdId = created.id;

    expect(created.clerk_id).toBe(clerkId);
    expect(created.deleted_at).toBeNull();

    const second = await getOrCreateByClerkId(clerkId);

    expect(second.id).toBe(created.id);
    expect(second.clerk_id).toBe(clerkId);
  });

  it("soft-deletes a user by setting deleted_at", async () => {
    const clerkId = `clerk_test_${crypto.randomUUID()}`;
    const created = await getOrCreateByClerkId(clerkId);
    createdId = created.id;

    expect(created.deleted_at).toBeNull();

    await softDeleteByClerkId(clerkId);

    const fetched = await getById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.deleted_at).not.toBeNull();
  });

  it("getById returns null for a non-existent id", async () => {
    const fetched = await getById("00000000-0000-0000-0000-000000000000");
    expect(fetched).toBeNull();
  });
});

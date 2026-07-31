import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/strips/:id — fetch a strip for share/download/print (TRD §5).
 * Real implementation (Step 4 Item 8): lib/db/strips.ts#getStripById -> mint
 * a fresh 5-15 min signed URL on every call (backend-schema §5) via a shared
 * helper also used directly by Server Components, avoiding an internal HTTP hop.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  void request;
  return NextResponse.json(
    {
      id: params.id,
      sessionId: "00000000-0000-0000-0000-000000000000",
      stylePreset: "classic_bw",
      signedUrl: "",
      createdAt: new Date(0).toISOString(),
    },
    { status: 501 }
  );
}

// Usage tracking endpoint — fire-and-forget POST used by client-side tool
// components (e.g. Merge PDF, Split PDF, Compress PDF) to record a `UsageEvent`
// in the Prisma DB. The AI tool routes (`/api/ai/*`) already insert their own
// events server-side; this route is for the pure-client pdf-lib tools so their
// usage shows up in the dashboard "trending tools" widget.
//
// Contract:
//   POST /api/analytics/track
//   { toolId: string, success: boolean, fileSizeBytes?: number, durationMs?: number, sessionId?: string }
//   → 200 { ok: true }
//
// The endpoint ALWAYS returns 200 (best-effort analytics). Validation failures
// and DB errors are logged but never surface as 4xx/5xx to the client — the
// caller fire-and-forgets this request and a failure must not break the user's
// tool flow.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getToolById, type ToolId } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TrackBody {
  toolId?: unknown;
  success?: unknown;
  fileSizeBytes?: unknown;
  durationMs?: unknown;
  sessionId?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as TrackBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, reason: "invalid-body" });
    }

    const toolIdRaw = body.toolId;
    if (typeof toolIdRaw !== "string" || toolIdRaw.trim().length === 0) {
      return NextResponse.json({ ok: false, reason: "missing-toolId" });
    }

    // Reject unknown toolIds — keeps the trending list clean.
    const tool = getToolById(toolIdRaw as ToolId);
    if (!tool) {
      return NextResponse.json({ ok: false, reason: "unknown-toolId" });
    }

    const success = body.success === true; // default false if anything else
    const fileSizeBytes =
      typeof body.fileSizeBytes === "number" &&
      Number.isFinite(body.fileSizeBytes) &&
      body.fileSizeBytes >= 0
        ? Math.min(Math.floor(body.fileSizeBytes), Number.MAX_SAFE_INTEGER)
        : null;
    const durationMs =
      typeof body.durationMs === "number" &&
      Number.isFinite(body.durationMs) &&
      body.durationMs >= 0
        ? Math.min(Math.floor(body.durationMs), Number.MAX_SAFE_INTEGER)
        : null;
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length <= 200
        ? body.sessionId
        : null;

    try {
      await db.usageEvent.create({
        data: {
          toolId: tool.id,
          success,
          fileSizeBytes: fileSizeBytes ?? undefined,
          durationMs: durationMs ?? undefined,
          sessionId: sessionId ?? undefined,
        },
      });
    } catch (dbErr) {
      // DB issue — log and move on. The client fire-and-forgets anyway.
      console.warn("[analytics/track] insert failed:", dbErr);
      return NextResponse.json({ ok: false, reason: "db-error" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[analytics/track] unexpected error:", err);
    return NextResponse.json({ ok: false, reason: "unexpected" });
  }
}

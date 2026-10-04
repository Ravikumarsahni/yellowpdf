// Client-side analytics helper.
//
// `trackUsage` is a fire-and-forget POST to /api/analytics/track. It is meant
// to be called from inside client-side tool components (e.g. after a Merge PDF
// finishes, after a Compress PDF download starts) so that pure-client tools
// (which never hit a server route) still record a UsageEvent row in the Prisma
// DB. The AI tool routes already insert their own events server-side.
//
// The helper intentionally swallows all errors — analytics must NEVER block
// the user's tool flow or surface a toast. Use `void trackUsage({...})` from
// the caller.

import type { ToolId } from "@/lib/tools";

export interface TrackUsageInput {
  toolId: ToolId;
  success: boolean;
  fileSizeBytes?: number;
  durationMs?: number;
  sessionId?: string;
}

/**
 * Fire-and-forget POST to /api/analytics/track.
 *
 * Safe to call from any client component. Returns a Promise that the caller
 * can `void` (or `.catch(() => {})`) — internally all rejections are caught
 * so unhandled-rejection handlers never fire.
 */
export function trackUsage(input: TrackUsageInput): Promise<void> {
  // Bail on SSR — no client to track from.
  if (typeof window === "undefined") return Promise.resolve();

  const body: TrackUsageInput = {
    toolId: input.toolId,
    success: input.success,
    fileSizeBytes: input.fileSizeBytes,
    durationMs: input.durationMs,
    sessionId: input.sessionId,
  };

  return fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // `keepalive: true` lets the request survive page unload/navigation so we
    // don't lose events when the user clicks a Download button and bounces.
    keepalive: true,
    // Use a short timeout (via AbortController) so a stuck backend never
    // hangs the page. We never surface errors, so the timeout is silent.
    signal: AbortSignal.timeout?.(4000) ?? undefined,
  })
    .then(() => undefined)
    .catch(() => undefined);
}

// Live platform analytics endpoint.
//
// Returns aggregate usage statistics pulled from the Prisma `UsageEvent` table.
// This powers the dashboard "Live platform activity" widget — the data behind
// the "Built for 100k+ users" claim.
//
// Every query is wrapped in try/catch. If the database is empty or temporarily
// unavailable (e.g. locked, schema drift), the route returns zeros and empty
// arrays with HTTP 200 — never 500 — so the dashboard never breaks.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getToolById, type ToolId } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface TrendingTool {
  toolId: string;
  title: string;
  count: number;
  weekDeltaPct: number;
}

export interface RecentActivity {
  toolId: string;
  title: string;
  success: boolean;
  durationMs: number | null;
  createdAt: string; // ISO
}

export interface UsageStats {
  totalEvents: number;
  successfulEvents: number;
  last24h: number;
  trendingTools: TrendingTool[];
  recentActivity: RecentActivity[];
}

/** Resolve a toolId to its human-readable title (null = unknown toolId). */
function resolveTitle(toolId: string): string | null {
  const tool = getToolById(toolId as ToolId);
  if (!tool) return null;
  return tool.title;
}

/** Safe Prisma wrapper — returns null on failure instead of throwing. */
async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    console.warn("[analytics/usage] query failed:", err);
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * DAY);
  const fourteenDaysAgo = new Date(now - 14 * DAY);
  const twentyFourHoursAgo = new Date(now - DAY);

  // Run independent queries in parallel — any failure is non-fatal.
  const [
    totalEvents,
    successfulEvents,
    last24h,
    trendingRaw,
    previousRaw,
    recentRaw,
  ] = await Promise.all([
    safe(db.usageEvent.count()),
    safe(db.usageEvent.count({ where: { success: true } })),
    safe(
      db.usageEvent.count({ where: { createdAt: { gt: twentyFourHoursAgo } } }),
    ),
    safe(
      db.usageEvent.groupBy({
        by: ["toolId"],
        where: { createdAt: { gt: sevenDaysAgo } },
        _count: { _all: true },
      }),
    ),
    safe(
      db.usageEvent.groupBy({
        by: ["toolId"],
        where: {
          createdAt: {
            gt: fourteenDaysAgo,
            lte: sevenDaysAgo,
          },
        },
        _count: { _all: true },
      }),
    ),
    safe(
      db.usageEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          toolId: true,
          success: true,
          durationMs: true,
          createdAt: true,
        },
      }),
    ),
  ]);

  // Build a { toolId → previous 7-day count } lookup.
  const previousCountMap = new Map<string, number>();
  if (Array.isArray(previousRaw)) {
    for (const row of previousRaw) {
      previousCountMap.set(row.toolId, row._count._all);
    }
  }

  // Sort the trending groups by count desc, take top 6, resolve titles,
  // drop unknown toolIds (don't surface garbage in the UI), compute the
  // week-over-week delta percentage.
  const trendingTools: TrendingTool[] = Array.isArray(trendingRaw)
    ? [...trendingRaw]
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 6)
        .map((row) => {
          const title = resolveTitle(row.toolId);
          if (!title) return null;
          const count = row._count._all;
          const previous = previousCountMap.get(row.toolId) ?? 0;
          const denominator = Math.max(previous, 1);
          const weekDeltaPct = Math.round(
            ((count - previous) / denominator) * 100,
          );
          return { toolId: row.toolId, title, count, weekDeltaPct };
        })
        .filter((x): x is TrendingTool => x !== null)
    : [];

  // Recent activity — last 8 events with title resolution.
  const recentActivity: RecentActivity[] = Array.isArray(recentRaw)
    ? recentRaw.map((row) => {
        const title = resolveTitle(row.toolId) ?? row.toolId;
        return {
          toolId: row.toolId,
          title,
          success: row.success,
          durationMs: row.durationMs,
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : new Date(row.createdAt).toISOString(),
        };
      })
    : [];

  const stats: UsageStats = {
    totalEvents: totalEvents ?? 0,
    successfulEvents: successfulEvents ?? 0,
    last24h: last24h ?? 0,
    trendingTools,
    recentActivity,
  };

  // Cache-busting headers — the widget polls every 30s, so always serve fresh.
  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

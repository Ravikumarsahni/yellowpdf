"use client";

// Live usage analytics widget for the YellowPDF dashboard.
//
// Two cards side-by-side on desktop (stacked on mobile):
//   - Left: 3 big stat tiles (Total ops / Success rate / Last 24h) with
//     pulsing "Live" indicator and yellow accent border.
//   - Right: "Trending tools this week" — 6 ranked rows with a thin bar chart
//     + week-over-week delta chip, then a recent-activity feed of the latest
//     3 events.
//
// Fetches /api/analytics/usage every 30s via TanStack Query. The widget
// gracefully handles loading (skeleton), error (small red pill — never blocks
// the rest of the dashboard), and empty/zero states.

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── shared types (kept in sync with /api/analytics/usage) ──────────────────

interface TrendingTool {
  toolId: string;
  title: string;
  count: number;
  weekDeltaPct: number;
}

interface RecentActivity {
  toolId: string;
  title: string;
  success: boolean;
  durationMs: number | null;
  createdAt: string; // ISO
}

interface UsageStats {
  totalEvents: number;
  successfulEvents: number;
  last24h: number;
  trendingTools: TrendingTool[];
  recentActivity: RecentActivity[];
}

const EMPTY_STATS: UsageStats = {
  totalEvents: 0,
  successfulEvents: 0,
  last24h: 0,
  trendingTools: [],
  recentActivity: [],
};

// ── Query client (module-scoped singleton — survives re-renders) ──────────
//
// The root layout doesn't include a QueryClientProvider (and is off-limits),
// so the widget mounts its own provider with a module-scoped client. This
// keeps the analytics query fully self-contained.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

async function fetchUsage(): Promise<UsageStats> {
  const res = await fetch("/api/analytics/usage", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`usage fetch failed: ${res.status}`);
  return (await res.json()) as UsageStats;
}

export function UsageWidget() {
  return (
    <QueryClientProvider client={queryClient}>
      <UsageWidgetInner />
    </QueryClientProvider>
  );
}

function UsageWidgetInner() {
  const { data, isLoading, isError } = useQuery<UsageStats>({
    queryKey: ["analytics", "usage"],
    queryFn: fetchUsage,
    refetchInterval: 30_000,
  });

  const stats = data ?? EMPTY_STATS;
  const successRate =
    stats.totalEvents > 0
      ? Math.round((stats.successfulEvents / stats.totalEvents) * 100)
      : null;

  return (
    <section
      aria-label="Live usage analytics"
      className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
    >
      {/* Left: 3 big stat tiles */}
      <Card className="border-l-4 border-l-primary p-5 md:p-6 gap-4">
        <WidgetHeader
          title="Live platform activity"
          subtitle="Real operations across all users"
        />
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            icon={<TrendingUp className="h-4 w-4" />}
            label="Total ops"
            value={
              isLoading ? null : <CountUp value={stats.totalEvents} />
            }
            loading={isLoading}
          />
          <StatTile
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Success rate"
            value={
              isLoading
                ? null
                : successRate === null
                  ? "—"
                  : (
                    <>
                      {successRate}
                      <span className="text-base font-bold">%</span>
                    </>
                  )
            }
            loading={isLoading}
          />
          <StatTile
            icon={<Activity className="h-4 w-4" />}
            label="Last 24h"
            value={isLoading ? null : <CountUp value={stats.last24h} />}
            loading={isLoading}
          />
        </div>
        {isError && <ErrorPill />}
        <p className="text-[11px] text-muted-foreground">
          Counts come from anonymous, opt-in tool usage events stored in the
          YellowPDF database. Auto-refreshes every 30s.
        </p>
      </Card>

      {/* Right: trending tools + recent activity */}
      <Card className="border-l-4 border-l-primary p-5 md:p-6 gap-4">
        <WidgetHeader
          title="Trending tools this week"
          subtitle="Top 6 by last-7-day count"
        />

        {isLoading ? (
          <TrendingSkeleton />
        ) : stats.trendingTools.length === 0 ? (
          <EmptyTrending />
        ) : (
          <TrendingList tools={stats.trendingTools} />
        )}

        {/* Recent activity feed */}
        <div className="mt-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Recent activity
          </p>
          {isLoading ? (
            <RecentSkeleton />
          ) : stats.recentActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No recent activity yet.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-44 overflow-y-auto scroll-soft pr-1">
              {stats.recentActivity.slice(0, 3).map((ev, i) => (
                <RecentRow key={`${ev.createdAt}-${i}`} event={ev} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}

// ── subcomponents ──────────────────────────────────────────────────────────

function WidgetHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-secondary/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-yellow-deep" />
        </span>
        Live
      </span>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-primary">{icon}</div>
      <div className="text-3xl font-extrabold tabular-nums leading-none tracking-tight min-h-[1.75rem]">
        {loading ? (
          <Skeleton className="h-7 w-12 rounded" />
        ) : value === null ? (
          "—"
        ) : (
          value
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight">
        {label}
      </p>
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  // Format with thousands separators (en-US style).
  const formatted = value.toLocaleString("en-US");
  return <>{formatted}</>;
}

function TrendingList({ tools }: { tools: TrendingTool[] }) {
  const maxCount = tools.reduce((max, t) => Math.max(max, t.count), 0);
  return (
    <ul className="space-y-2.5">
      {tools.map((tool, idx) => {
        const pct = maxCount > 0 ? (tool.count / maxCount) * 100 : 0;
        return (
          <li
            key={tool.toolId}
            className="flex items-center gap-3"
            aria-label={`Rank ${idx + 1}: ${tool.title} with ${tool.count} uses`}
          >
            <span className="grid place-items-center h-6 w-6 shrink-0 rounded-full bg-secondary text-[11px] font-bold text-foreground/80">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold truncate">{tool.title}</p>
                <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                  {tool.count.toLocaleString("en-US")}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/40 transition-all"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              </div>
            </div>
            <DeltaChip pct={tool.weekDeltaPct} />
          </li>
        );
      })}
    </ul>
  );
}

function DeltaChip({ pct }: { pct: number }) {
  const cls =
    pct > 0
      ? "bg-emerald-100 text-emerald-700"
      : pct < 0
        ? "bg-rose-100 text-rose-700"
        : "bg-secondary text-muted-foreground";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "—";
  const sign = pct > 0 ? "+" : "";
  return (
    <span
      className={cn(
        "shrink-0 px-1.5 py-0 rounded-full text-[10px] font-semibold tabular-nums",
        cls,
      )}
      aria-label={`Week over week change: ${sign}${pct}%`}
    >
      {arrow} {Math.abs(pct)}%
    </span>
  );
}

function RecentRow({ event }: { event: RecentActivity }) {
  const ts = Date.parse(event.createdAt);
  const rel = Number.isFinite(ts) ? formatDate(ts) : "";
  return (
    <li className="flex items-center gap-2 text-xs">
      {event.success ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      ) : (
        <X className="h-3.5 w-3.5 text-rose-600 shrink-0" />
      )}
      <span className="font-medium truncate flex-1">{event.title}</span>
      <span className="text-muted-foreground shrink-0">{rel}</span>
    </li>
  );
}

function TrendingSkeleton() {
  return (
    <ul className="space-y-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-1.5 w-full rounded" />
          </div>
          <Skeleton className="h-4 w-10 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

function RecentSkeleton() {
  return (
    <ul className="space-y-1.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
          <Skeleton className="h-3 w-32 rounded" />
          <Skeleton className="h-3 w-10 rounded ml-auto" />
        </li>
      ))}
    </ul>
  );
}

function EmptyTrending() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-center">
      <Sparkles className="h-5 w-5 text-primary/60 mx-auto mb-1.5" />
      <p className="text-xs font-medium">No trending data yet</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        As users run tools, the leaderboard will populate here automatically.
      </p>
    </div>
  );
}

function ErrorPill() {
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-medium text-rose-700">
      <AlertCircle className="h-3 w-3" />
      Couldn&apos;t load live stats
    </span>
  );
}

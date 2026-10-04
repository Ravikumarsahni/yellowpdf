"use client";

import { useMemo } from "react";
import {
  CATEGORIES,
  TOOLS,
  getToolsByCategory,
  type Tool,
} from "@/lib/tools";
import { useAppStore } from "@/lib/store";
import { Hero } from "./hero";
import { ToolCard } from "./tool-card";
import { Sparkles, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Pre-computed "Start with" popular tools list (module-level — no runtime cost
// per render, and avoids the React Compiler manual-memoization lint error).
const START_WITH_TOOLS: Tool[] = (() => {
  const popular = TOOLS.filter((t) => t.badge === "popular").slice(0, 4);
  if (popular.length >= 4) return popular;
  const preferredIds = [
    "edit-pdf",
    "sign-pdf",
    "merge-pdf",
    "compress-pdf",
    "split-pdf",
    "images-to-pdf",
    "scan-document",
    "pdf-to-word",
  ];
  const seen = new Set(popular.map((t) => t.id));
  const out = [...popular];
  for (const id of preferredIds) {
    if (out.length >= 8) break;
    if (seen.has(id)) continue;
    const tool = TOOLS.find((t) => t.id === id);
    if (tool) {
      out.push(tool);
      seen.add(id);
    }
  }
  return out.slice(0, 8);
})();

export function DashboardView() {
  const activeCategoryId = useAppStore((s) => s.activeCategoryId);
  const setCategory = useAppStore((s) => s.setCategory);
  const openTool = useAppStore((s) => s.openTool);

  // When a category is selected, show only that category.
  const visibleCategories = useMemo(
    () =>
      activeCategoryId
        ? CATEGORIES.filter((c) => c.id === activeCategoryId)
        : CATEGORIES,
    [activeCategoryId],
  );

  return (
    <div>
      <Hero />

      <div className="px-6 md:px-10 py-8 max-w-6xl mx-auto">
        {activeCategoryId && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Category</p>
              <h2 className="text-2xl font-bold tracking-tight">
                {CATEGORIES.find((c) => c.id === activeCategoryId)?.label}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {CATEGORIES.find((c) => c.id === activeCategoryId)?.description}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCategory(null)}
            >
              Back to all
            </Button>
          </div>
        )}

        {/* Start with — popular tools */}
        {!activeCategoryId && (
          <section className="mb-12">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Start with
              </h3>
              <span className="text-xs text-muted-foreground">
                Most popular this week
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {START_WITH_TOOLS.map((t) => (
                <ToolCard key={t.id} tool={t} />
              ))}
            </div>
          </section>
        )}

        {/* All categories */}
        {visibleCategories.map((cat) => {
          const tools = getToolsByCategory(cat.id);
          if (tools.length === 0) return null;
          const Icon = cat.icon;
          return (
            <section key={cat.id} className="mb-12">
              <div className="flex items-baseline justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="grid place-items-center h-8 w-8 rounded-lg bg-secondary text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{cat.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {cat.description}
                    </p>
                  </div>
                </div>
                {!activeCategoryId && (
                  <button
                    onClick={() => setCategory(cat.id)}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    See all {tools.length}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {tools.map((t) => (
                  <ToolCard key={t.id} tool={t} />
                ))}
              </div>
            </section>
          );
        })}

        {/* CTA strip */}
        {!activeCategoryId && (
          <section className="rounded-2xl bg-brand-gradient border border-primary/30 p-6 md:p-8 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-xs font-medium mb-3">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Why YellowPDF?
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Built for{" "}
              <span className="text-primary">100k+ concurrent users</span> with
              pure client-side processing
            </h2>
            <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
              No file uploads, no server bottlenecks, no per-user cost. Every
              operation runs in your browser, so the platform scales to
              100,000+ simultaneous visitors without breaking a sweat.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button onClick={() => openTool("merge-pdf")}>
                Try Merge PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => openTool("ai-summarize")}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Try AI Summarize
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

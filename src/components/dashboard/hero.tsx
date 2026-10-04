"use client";

import { Search, Sparkles, ShieldCheck, Zap, Globe } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Hero() {
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setCategory = useAppStore((s) => s.setCategory);
  const setView = useAppStore((s) => s.setView);

  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Soft brand gradient backdrop */}
      <div className="absolute inset-0 bg-brand-gradient" />
      <div className="absolute inset-0 bg-dots opacity-60" />

      <div className="relative px-6 md:px-10 py-10 md:py-14 max-w-6xl mx-auto">
        <div className="flex flex-col-reverse lg:flex-row gap-8 items-start">
          {/* Headline column */}
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/70 backdrop-blur px-3 py-1 text-xs font-medium text-foreground/80 mb-5 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Free forever · No watermark · No sign-up
            </div>

            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-balance">
              Free Online PDF Editor
              <br />
              <span className="text-primary">Without Watermark</span>
            </h1>

            <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl text-pretty">
              Edit, merge, split, compress, and convert PDFs instantly in your
              browser.{" "}
              <strong className="font-semibold text-foreground">
                100% free, no watermark, no sign-up required
              </strong>{" "}
              — your files never leave your device. Works offline.
            </p>

            {/* Big search trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className="mt-6 w-full max-w-xl flex items-center gap-3 rounded-xl border border-border bg-background/80 backdrop-blur px-4 py-3 text-sm text-muted-foreground shadow-sm hover:border-primary/60 hover:shadow-md transition-all"
            >
              <Search className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left">
                Search 40+ tools — merge, compress, sign, AI summarize…
              </span>
              <kbd className="hidden sm:inline-flex h-6 items-center gap-0.5 rounded border border-border bg-background px-2 font-mono text-[11px] font-medium text-muted-foreground">
                Ctrl K
              </kbd>
            </button>

            {/* Trust strip */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                100% client-side — files never uploaded
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-primary" />
                Built for 100k+ concurrent users
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-primary" />
                Works in any modern browser
              </span>
            </div>
          </div>

          {/* Sponsored panel */}
          <SponsoredPanel />
        </div>
      </div>
    </section>
  );
}

function SponsoredPanel() {
  return (
    <aside className="w-full lg:w-72 shrink-0 rounded-2xl border border-border bg-background/80 backdrop-blur p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sponsored
        </span>
        <a
          href="#"
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
        >
          Advertise here ↗
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {/* Filled sponsor card */}
        <div className="aspect-square rounded-lg border border-primary/30 bg-brand-gradient p-3 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="grid place-items-center h-9 w-9 rounded-xl bg-primary text-primary-foreground mb-2 shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-[11px] font-bold leading-tight">AgentsKit</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">AI Agents</p>
        </div>

        {/* Placeholder slots */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-square rounded-lg border-2 border-dashed border-border bg-background/40 grid place-items-center text-center hover:border-primary/60 hover:bg-secondary/50 transition-colors cursor-pointer"
          >
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <div className="grid place-items-center h-7 w-7 rounded-full border border-dashed border-muted-foreground/40">
                +
              </div>
              <p className="text-[10px] font-medium">Your logo here</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

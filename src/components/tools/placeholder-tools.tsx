"use client";

import { Sparkles, Wrench, ArrowRight } from "lucide-react";
import { ToolShell, type ProcessStatus } from "./tool-shell";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import type { Tool } from "@/lib/tools";

/** Fallback for tools whose UI is being built. */
export function ComingSoonTool({ tool }: { tool: Tool }) {
  const setView = useAppStore((s) => s.setView);
  const setCategory = useAppStore((s) => s.setCategory);

  return (
    <ToolShell tool={tool} status="idle">
      <div className="rounded-xl bg-secondary/60 p-6 text-center">
        <div className="grid place-items-center h-14 w-14 rounded-xl bg-primary/10 text-primary mx-auto mb-3">
          <Wrench className="h-7 w-7" />
        </div>
        <p className="font-semibold">This tool is being built</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          We&apos;re rolling out YellowPDF tools in waves. The page-management,
          edit-annotate, AI, and conversion tools are live now — try one of
          those while we finish this one.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              useAppStore.getState().openTool("merge-pdf");
            }}
          >
            Try Merge PDF
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCategory(null);
              setView("dashboard");
            }}
          >
            Back to all tools
          </Button>
        </div>
      </div>
    </ToolShell>
  );
}

/** Used while a real tool component is mid-construction. */
export function ConstructingTool({ tool }: { tool: Tool }) {
  const status: ProcessStatus = "processing";
  return (
    <ToolShell
      tool={tool}
      status={status}
      statusMessage="Building this tool…"
    >
      <div className="grid place-items-center py-8 text-muted-foreground">
        <Sparkles className="h-8 w-8 animate-brand-pulse text-primary" />
      </div>
    </ToolShell>
  );
}

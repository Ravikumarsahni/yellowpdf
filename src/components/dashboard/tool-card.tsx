"use client";

import { cn } from "@/lib/utils";
import type { Tool, ToolBadge } from "@/lib/tools";
import { useAppStore } from "@/lib/store";

export function ToolCard({
  tool,
  className,
}: {
  tool: Tool;
  className?: string;
}) {
  const openTool = useAppStore((s) => s.openTool);
  const activeToolId = useAppStore((s) => s.activeToolId);
  const Icon = tool.icon;
  const isActive = activeToolId === tool.id;

  return (
    <button
      onClick={() => openTool(tool.id)}
      className={cn(
        "tool-card group relative text-left rounded-xl border bg-card p-4 flex flex-col gap-3 h-32 md:h-36",
        "border-border hover:border-primary/50 hover:shadow-md hover:bg-accent/40",
        isActive && "border-primary ring-2 ring-primary/30 bg-accent/40",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="grid place-items-center h-10 w-10 rounded-lg bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        {tool.badge && <BadgePill badge={tool.badge} />}
      </div>
      <div className="mt-auto">
        <p className="font-semibold text-sm leading-tight">{tool.title}</p>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
          {tool.description}
        </p>
      </div>
    </button>
  );
}

function BadgePill({ badge }: { badge: ToolBadge }) {
  const styles: Record<ToolBadge, string> = {
    new: "bg-emerald-100 text-emerald-700",
    popular: "bg-primary/20 text-amber-700",
    ai: "bg-violet-100 text-violet-700",
    beta: "bg-blue-100 text-blue-700",
  };
  const labels: Record<ToolBadge, string> = {
    new: "New",
    popular: "Hot",
    ai: "AI",
    beta: "Beta",
  };
  return (
    <span
      className={cn(
        "px-1.5 py-0 rounded-full text-[9px] font-semibold uppercase tracking-wide leading-tight",
        styles[badge],
      )}
    >
      {labels[badge]}
    </span>
  );
}

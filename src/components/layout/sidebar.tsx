"use client";

import {
  LayoutDashboard,
  Clock,
  Star,
  Search,
  Megaphone,
  Heart,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Info,
  Menu,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  CATEGORIES,
  getToolsByCategory,
  type ToolBadge,
} from "@/lib/tools";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

export function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const openTool = useAppStore((s) => s.openTool);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeCategoryId = useAppStore((s) => s.activeCategoryId);
  const setCategory = useAppStore((s) => s.setCategory);

  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(CATEGORIES.map((c) => c.id)),
  );

  const toggleCat = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCategoryClick = (id: string) => {
    toggleCat(id);
    setCategory(activeCategoryId === id ? null : (id as never));
    setView("dashboard");
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-72",
      )}
    >
      {/* Brand row */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border shrink-0">
        <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground font-black text-sm shadow-sm">
          Y
        </div>
        {!collapsed && (
          <span className="font-extrabold tracking-tight text-[15px]">
            Yellow<span className="text-primary">PDF</span>
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Search trigger */}
      <div className="p-3 shrink-0">
        <button
          onClick={() => setSearchOpen(true)}
          className={cn(
            "w-full flex items-center gap-2 rounded-lg border border-sidebar-border bg-background/60 hover:bg-background hover:border-primary/50 px-3 py-2 text-sm text-muted-foreground transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search tools</span>
              <kbd className="hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-sidebar-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                Ctrl K
              </kbd>
            </>
          )}
        </button>
      </div>

      <ScrollArea className="flex-1 scroll-soft">
        <nav className="px-2 pb-4 space-y-0.5">
          <SidebarItem
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboard"
            active={view === "dashboard" && !activeCategoryId}
            collapsed={collapsed}
            onClick={() => {
              setCategory(null);
              setView("dashboard");
            }}
          />
          <SidebarItem
            icon={<Clock className="h-4 w-4" />}
            label="Recent files"
            active={view === "recent"}
            collapsed={collapsed}
            onClick={() => setView("recent")}
          />
          <SidebarItem
            icon={<Star className="h-4 w-4" />}
            label="Starred"
            active={view === "starred"}
            collapsed={collapsed}
            onClick={() => setView("starred")}
          />

          {!collapsed && (
            <p className="px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tools
            </p>
          )}
          {collapsed && <div className="h-4" />}

          {CATEGORIES.map((cat) => {
            const count = getToolsByCategory(cat.id).length;
            const isExpanded = expanded.has(cat.id);
            const isActive =
              activeCategoryId === cat.id && view === "dashboard";
            const Icon = cat.icon;
            return (
              <div key={cat.id}>
                <button
                  onClick={() => handleCategoryClick(cat.id)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive &&
                      "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                    collapsed && "justify-center px-0",
                  )}
                  title={collapsed ? cat.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">
                        {cat.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {count}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
                    </>
                  )}
                </button>

                {!collapsed && isExpanded && (
                  <div className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5 my-0.5">
                    {getToolsByCategory(cat.id).map((t) => {
                      const ToolIcon = t.icon;
                      return (
                        <ToolListButton key={t.id} tool={t} ToolIcon={ToolIcon} />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {!collapsed && (
            <p className="px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Resources
            </p>
          )}
          {collapsed && <div className="h-4" />}
          <SidebarItem
            icon={<BookOpen className="h-4 w-4" />}
            label="Technical Blog"
            active={view === "blog"}
            collapsed={collapsed}
            onClick={() => openTool("blog")}
          />
          <SidebarItem
            icon={<Info className="h-4 w-4" />}
            label="About YellowPDF"
            active={view === "about"}
            collapsed={collapsed}
            onClick={() => openTool("about")}
          />
        </nav>
      </ScrollArea>

      {/* Footer actions */}
      <div className="border-t border-sidebar-border p-2 space-y-0.5 shrink-0">
        <SidebarItem
          icon={<Megaphone className="h-4 w-4" />}
          label="Sponsor a slot"
          collapsed={collapsed}
          onClick={() => setView("about")}
        />
        <SidebarItem
          icon={<Heart className="h-4 w-4 text-destructive" />}
          label="Donate"
          collapsed={collapsed}
          onClick={() => setView("feedback")}
          customLabelClass="text-destructive"
        />
      </div>
    </aside>
  );
}

// Separate client component so each tool button can subscribe to its own
// active state without re-rendering the whole sidebar.
function ToolListButton({
  tool,
  ToolIcon,
}: {
  tool: ReturnType<typeof getToolsByCategory>[number];
  ToolIcon: React.ComponentType<{ className?: string }>;
}) {
  const activeToolId = useAppStore((s) => s.activeToolId);
  const openTool = useAppStore((s) => s.openTool);
  const isActive = activeToolId === tool.id;
  return (
    <button
      onClick={() => openTool(tool.id)}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive &&
          "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
      )}
    >
      <ToolIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-left truncate">{tool.title}</span>
      {tool.badge && <BadgePill badge={tool.badge} />}
    </button>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
  customLabelClass,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
  customLabelClass?: string;
}) {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active &&
          "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
        collapsed && "justify-center px-0",
        customLabelClass,
      )}
      title={collapsed ? label : undefined}
    >
      {icon}
      {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
    </button>
  );

  if (!collapsed) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function BadgePill({ badge }: { badge: ToolBadge }) {
  const styles: Record<ToolBadge, string> = {
    new: "bg-emerald-100 text-emerald-700",
    popular: "bg-primary/15 text-amber-700",
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



"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Clock,
  Star,
  BookOpen,
  Info,
  Search as SearchIcon,
  CornerDownLeft,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  searchTools,
  CATEGORIES,
  getToolsByCategory,
  type Tool,
} from "@/lib/tools";
import { cn } from "@/lib/utils";

export function SearchPalette() {
  const open = useAppStore((s) => s.searchOpen);
  const setOpen = useAppStore((s) => s.setSearchOpen);
  const openTool = useAppStore((s) => s.openTool);
  const setView = useAppStore((s) => s.setView);
  const setCategory = useAppStore((s) => s.setCategory);

  // Bind Ctrl/Cmd+K to toggle.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useAppStore.getState().searchOpen);
      }
      if (e.key === "Escape" && useAppStore.getState().searchOpen) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  const handleSelectTool = (tool: Tool) => {
    openTool(tool.id);
    setOpen(false);
  };

  const handleSelectView = (view: "dashboard" | "recent" | "starred") => {
    setCategory(null);
    setView(view);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-2xl overflow-hidden rounded-xl border-border bg-popover">
        <DialogHeader className="sr-only">
          <DialogTitle>Search tools</DialogTitle>
          <DialogDescription>
            Search the YellowPDF catalog and jump to any tool instantly.
          </DialogDescription>
        </DialogHeader>
        <Command className="bg-popover" loop>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <SearchIcon className="h-4 w-4 text-muted-foreground" />
            <CommandInput
              placeholder="Search 40+ tools — merge, compress, sign, AI summarize…"
              className="h-12 flex-1 bg-transparent border-0 focus-visible:ring-0 text-sm"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>
          <CommandList className="max-h-[420px] scroll-soft">
            <CommandEmpty>
              <div className="py-10 text-center text-sm text-muted-foreground">
                <p>No tools matched your search.</p>
                <p className="text-xs mt-1">Try &quot;merge&quot;, &quot;compress&quot;, or &quot;sign&quot;.</p>
              </div>
            </CommandEmpty>

            <CommandGroup heading="Quick actions">
              <CommandItem
                onSelect={() => handleSelectView("dashboard")}
                className="cursor-pointer"
              >
                <LayoutDashboard className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Go to Dashboard</span>
              </CommandItem>
              <CommandItem
                onSelect={() => handleSelectView("recent")}
                className="cursor-pointer"
              >
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Open Recent files</span>
              </CommandItem>
              <CommandItem
                onSelect={() => handleSelectView("starred")}
                className="cursor-pointer"
              >
                <Star className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Open Starred files</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  openTool("blog");
                  setOpen(false);
                }}
                className="cursor-pointer"
              >
                <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Read Technical Blog</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  openTool("about");
                  setOpen(false);
                }}
                className="cursor-pointer"
              >
                <Info className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>About YellowPDF</span>
              </CommandItem>
            </CommandGroup>

            <DynamicResults onSelectTool={handleSelectTool} />

            <CommandSeparator />
            <CommandGroup heading="Browse by category">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                return (
                  <CommandItem
                    key={c.id}
                    onSelect={() => {
                      setCategory(c.id);
                      setView("dashboard");
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{c.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {getToolsByCategory(c.id).length} tools
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          <div className="border-t border-border bg-background/50 px-3 py-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> Select
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1 font-mono">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span className="ml-auto inline-flex items-center gap-1">
              Powered by{" "}
              <span className="font-semibold text-foreground">YellowPDF</span>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lazy search results group — recomputes only when the input changes, using
 * the cmdk useState pattern.
 */
function DynamicResults({
  onSelectTool,
}: {
  onSelectTool: (t: Tool) => void;
}) {
  // cmdk exposes the search query via a custom state hook.
  const [query, setQuery] = React.useState("");
  // Listen to cmdk input events.
  React.useEffect(() => {
    const input = document.querySelector(
      "[cmdk-input]",
    ) as HTMLInputElement | null;
    if (!input) return;
    const onInput = () => setQuery(input.value || "");
    input.addEventListener("input", onInput);
    setQuery(input.value || "");
    return () => input.removeEventListener("input", onInput);
  }, []);

  const results = React.useMemo(() => searchTools(query, 12), [query]);
  if (!query || results.length === 0) return null;

  return (
    <CommandGroup heading={`Tools (${results.length})`}>
      {results.map((t) => {
        const Icon = t.icon;
        return (
          <CommandItem
            key={t.id}
            value={`${t.title} ${t.description}`}
            onSelect={() => onSelectTool(t)}
            className="cursor-pointer"
          >
            <Icon className="mr-2 h-4 w-4 text-primary" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{t.title}</span>
                {t.badge && (
                  <span
                    className={cn(
                      "px-1.5 py-0 rounded-full text-[9px] font-semibold uppercase leading-tight",
                      t.badge === "new" && "bg-emerald-100 text-emerald-700",
                      t.badge === "popular" && "bg-primary/15 text-amber-700",
                      t.badge === "ai" && "bg-violet-100 text-violet-700",
                      t.badge === "beta" && "bg-blue-100 text-blue-700",
                    )}
                  >
                    {t.badge === "popular" ? "Hot" : t.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {t.description}
              </p>
            </div>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

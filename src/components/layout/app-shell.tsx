"use client";

import { Search, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { SearchPalette } from "./search-palette";
import { Footer } from "./footer";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CATEGORIES, getToolsByCategory } from "@/lib/tools";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1 w-full">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <MobileTopBar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
      <Footer />
      <SearchPalette />
    </div>
  );
}

function MobileTopBar() {
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const openTool = useAppStore((s) => s.openTool);
  const setView = useAppStore((s) => s.setView);
  const setCategory = useAppStore((s) => s.setCategory);

  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="px-4 h-14 border-b border-sidebar-border flex flex-row items-center bg-sidebar">
            <SheetTitle className="font-extrabold">
              Yellow<span className="text-primary">PDF</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-[calc(100%-3.5rem)] overflow-y-auto scroll-soft p-2 bg-sidebar">
            <button
              onClick={() => {
                setCategory(null);
                setView("dashboard");
                setMobileOpen(false);
              }}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                setView("recent");
                setMobileOpen(false);
              }}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
            >
              Recent files
            </button>
            <button
              onClick={() => {
                setView("starred");
                setMobileOpen(false);
              }}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
            >
              Starred
            </button>
            <div className="my-2 h-px bg-sidebar-border" />
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="mb-2">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {cat.label}
                </p>
                {getToolsByCategory(cat.id).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        openTool(t.id);
                        setMobileOpen(false);
                      }}
                      className="w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] hover:bg-sidebar-accent"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{t.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-1.5">
        <div className="grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground font-black text-xs">
          Y
        </div>
        <span className="font-extrabold text-sm">
          Yellow<span className="text-primary">PDF</span>
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="ml-auto gap-2 text-muted-foreground"
        onClick={() => setSearchOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline-flex h-4 items-center rounded border border-border bg-background px-1 font-mono text-[9px]">
          ⌘K
        </kbd>
      </Button>
    </header>
  );
}

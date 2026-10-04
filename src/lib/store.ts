// Zustand store for YellowPDF app UI state.
//
// We avoid the zustand `persist` middleware on purpose: it would hydrate state
// during SSR/Hydration and cause mismatches. Instead, the store starts empty
// (server + first client render agree), and `hydrateFromStorage()` is called
// inside a `useEffect` on the main page to load persisted data after mount.

import { create } from "zustand";
import type { ToolId, ToolCategory } from "./tools";
import { uid } from "./format";

export type ViewId =
  | "dashboard"
  | "recent"
  | "starred"
  | "tool"
  | "blog"
  | "about"
  | "feedback";

export interface RecentFile {
  id: string;
  name: string;
  toolId: ToolId;
  size: number;
  /** Epoch milliseconds. */
  createdAt: number;
  starred: boolean;
}

interface AppState {
  // ── navigation ──────────────────────────────────────────────────────────
  view: ViewId;
  activeToolId: ToolId | null;
  activeCategoryId: ToolCategory | null;
  searchOpen: boolean;
  sidebarCollapsed: boolean;

  // ── recent files ─────────────────────────────────────────────────────────
  recentFiles: RecentFile[];

  // ── actions ──────────────────────────────────────────────────────────────
  setView: (v: ViewId) => void;
  openTool: (id: ToolId) => void;
  setCategory: (c: ToolCategory | null) => void;
  toggleStar: (fileId: string) => void;
  addRecent: (file: Omit<RecentFile, "id" | "createdAt" | "starred">) => void;
  clearRecent: () => void;
  setSearchOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  /** Reset transient view state (used after hydration). */
  hydrateFromStorage: () => void;
}

const STORAGE_KEY = "yellowpdf:store:v1";

interface PersistedShape {
  recentFiles: RecentFile[];
  sidebarCollapsed: boolean;
}

function readPersisted(): PersistedShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
    };
  } catch {
    // Corrupted storage — fall back to defaults.
    return null;
  }
}

function writePersisted(state: PersistedShape): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled — silently ignore.
  }
}

const MAX_RECENT = 50;

export const useAppStore = create<AppState>((set, get) => ({
  view: "dashboard",
  activeToolId: null,
  activeCategoryId: null,
  searchOpen: false,
  sidebarCollapsed: false,
  recentFiles: [],

  setView: (v) =>
    set((s) => ({
      view: v,
      // Clear the active tool/category when leaving the tool view so the
      // dashboard renders fresh the next time.
      activeToolId: v === "tool" ? s.activeToolId : null,
      activeCategoryId: v === "tool" ? s.activeCategoryId : null,
    })),

  openTool: (id) =>
    set(() => ({
      view: "tool",
      activeToolId: id,
      // We don't change `activeCategoryId` here: the sidebar should keep its
      // current category highlighted even when a tool is open.
    })),

  setCategory: (c) => set(() => ({ activeCategoryId: c })),

  toggleStar: (fileId) => {
    const updated = get().recentFiles.map((f) =>
      f.id === fileId ? { ...f, starred: !f.starred } : f,
    );
    set({ recentFiles: updated });
    writePersisted({
      recentFiles: updated,
      sidebarCollapsed: get().sidebarCollapsed,
    });
  },

  addRecent: (file) => {
    const entry: RecentFile = {
      id: uid(),
      name: file.name,
      toolId: file.toolId,
      size: file.size,
      createdAt: Date.now(),
      starred: false,
    };
    // Newest first, de-dup by (name + toolId), cap at MAX_RECENT.
    const dedupKey = (f: RecentFile) => `${f.toolId}:${f.name}`;
    const existing = get().recentFiles.filter(
      (f) => dedupKey(f) !== dedupKey(entry),
    );
    const updated = [entry, ...existing].slice(0, MAX_RECENT);
    set({ recentFiles: updated });
    writePersisted({
      recentFiles: updated,
      sidebarCollapsed: get().sidebarCollapsed,
    });
  },

  clearRecent: () => {
    set({ recentFiles: [] });
    writePersisted({
      recentFiles: [],
      sidebarCollapsed: get().sidebarCollapsed,
    });
  },

  setSearchOpen: (open) => set(() => ({ searchOpen: open })),

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    set({ sidebarCollapsed: next });
    writePersisted({
      recentFiles: get().recentFiles,
      sidebarCollapsed: next,
    });
  },

  hydrateFromStorage: () => {
    const persisted = readPersisted();
    if (!persisted) return;
    set(() => ({
      recentFiles: persisted.recentFiles,
      sidebarCollapsed: persisted.sidebarCollapsed,
    }));
  },
}));

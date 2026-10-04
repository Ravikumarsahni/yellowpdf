"use client";

import { useState } from "react";
import {
  Clock,
  Star,
  Trash2,
  File as FileIcon,
  Search as SearchIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getToolById } from "@/lib/tools";
import { formatDate, formatBytes, cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RecentFile {
  id: string;
  name: string;
  toolId: string;
  size: number;
  createdAt: number;
  starred: boolean;
}

export function RecentView({ starredOnly = false }: { starredOnly?: boolean }) {
  const recentFiles = useAppStore((s) => s.recentFiles);
  const openTool = useAppStore((s) => s.openTool);
  const toggleStar = useAppStore((s) => s.toggleStar);
  const clearRecent = useAppStore((s) => s.clearRecent);
  const [query, setQuery] = useState("");

  const filtered = (starredOnly
    ? recentFiles.filter((f) => f.starred)
    : recentFiles
  ).filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            {starredOnly ? (
              <Star className="h-5 w-5 text-primary" />
            ) : (
              <Clock className="h-5 w-5 text-primary" />
            )}
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {starredOnly ? "Starred files" : "Recent files"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {starredOnly
              ? "Pinned files you come back to often."
              : "Files you've processed in this browser. Nothing is uploaded — these are just shortcuts."}
          </p>
        </div>
        {!starredOnly && recentFiles.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearRecent}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Clear all
          </Button>
        )}
      </div>

      {/* Search filter */}
      {recentFiles.length > 0 && (
        <div className="relative mb-5">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            className="pl-9 max-w-sm"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState starredOnly={starredOnly} />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((file) => (
            <RecentFileRow
              key={file.id}
              file={file}
              onOpen={() => openTool(file.toolId as never)}
              onToggleStar={() => toggleStar(file.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentFileRow({
  file,
  onOpen,
  onToggleStar,
}: {
  file: RecentFile;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  const tool = getToolById(file.toolId as never);
  const Icon = tool?.icon ?? FileIcon;
  return (
    <li className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="grid place-items-center h-10 w-10 rounded-lg bg-secondary text-primary shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {tool?.title ?? "Tool"} · {formatBytes(file.size)} ·{" "}
          {formatDate(file.createdAt)}
        </p>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
        onClick={onToggleStar}
        aria-label={file.starred ? "Unstar" : "Star"}
      >
        <Star
          className={cn(
            "h-4 w-4",
            file.starred && "fill-primary text-primary",
          )}
        />
      </Button>
    </li>
  );
}

function EmptyState({ starredOnly }: { starredOnly: boolean }) {
  const setView = useAppStore((s) => s.setView);
  return (
    <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-12 text-center">
      <div className="grid place-items-center h-14 w-14 rounded-xl bg-primary/10 text-primary mx-auto mb-3">
        {starredOnly ? (
          <Star className="h-7 w-7" />
        ) : (
          <Clock className="h-7 w-7" />
        )}
      </div>
      <p className="font-semibold">No {starredOnly ? "starred" : "recent"} files yet</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        {starredOnly
          ? "Star a file from your recent list to keep it pinned here for quick access."
          : "Process a PDF with any tool and it'll show up here as a shortcut so you can re-download or re-run."}
      </p>
      <Button
        className="mt-4"
        onClick={() => {
          setView("dashboard");
        }}
      >
        Browse tools
      </Button>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Download, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import type { Tool } from "@/lib/tools";

export type ProcessStatus = "idle" | "processing" | "done" | "error";

interface ToolShellProps {
  tool: Tool;
  children: ReactNode;
  status?: ProcessStatus;
  statusMessage?: string;
  onReset?: () => void;
  resultUrl?: string | null;
  resultName?: string;
  resultSize?: number;
  onDownload?: () => void;
  customResult?: ReactNode;
}

export function ToolShell({
  tool,
  children,
  status = "idle",
  statusMessage,
  onReset,
  resultUrl,
  resultName,
  resultSize,
  onDownload,
  customResult,
}: ToolShellProps) {
  const setView = useAppStore((s) => s.setView);
  const setCategory = useAppStore((s) => s.setCategory);
  const Icon = tool.icon;

  return (
    <div className="px-6 md:px-10 py-8 max-w-4xl mx-auto">
      {/* Breadcrumb / back */}
      <button
        onClick={() => {
          setCategory(null);
          setView("dashboard");
        }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all tools
      </button>

      {/* Tool header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="grid place-items-center h-14 w-14 rounded-xl bg-primary/10 text-primary shrink-0 shadow-sm">
          <Icon className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            {tool.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tool.description}
          </p>
        </div>
      </div>

      {/* Main panel */}
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm space-y-5">
        {children}

        {/* Processing status */}
        {status !== "idle" && (
          <StatusBanner
            status={status}
            message={statusMessage}
            resultUrl={resultUrl}
            resultName={resultName}
            resultSize={resultSize}
            onDownload={onDownload}
            onReset={onReset}
            customResult={customResult}
          />
        )}
      </div>

      {/* Privacy note */}
      <p className="mt-4 text-xs text-muted-foreground text-center">
        🔒 Your file is processed entirely in your browser. Nothing is uploaded
        to any server — your privacy is guaranteed.
      </p>
    </div>
  );
}

function StatusBanner({
  status,
  message,
  resultUrl,
  resultName,
  resultSize,
  onDownload,
  onReset,
  customResult,
}: {
  status: ProcessStatus;
  message?: string;
  resultUrl?: string | null;
  resultName?: string;
  resultSize?: number;
  onDownload?: () => void;
  onReset?: () => void;
  customResult?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 flex flex-col gap-3",
        status === "processing" &&
          "border-primary/40 bg-primary/5",
        status === "done" && "border-emerald-300 bg-emerald-50",
        status === "error" && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-2.5">
        {status === "processing" && (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}
        {status === "done" && (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        )}
        {status === "error" && (
          <AlertCircle className="h-5 w-5 text-destructive" />
        )}
        <p className="text-sm font-medium">
          {status === "processing" && (message || "Processing…")}
          {status === "done" && (message || "Done! Your file is ready.")}
          {status === "error" && (message || "Something went wrong.")}
        </p>
      </div>

      {status === "done" && customResult}

      {status === "done" && resultUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onDownload} size="lg">
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
          {resultName && (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{resultName}</p>
              {typeof resultSize === "number" && (
                <p>{formatBytes(resultSize)}</p>
              )}
            </div>
          )}
          {onReset && (
            <Button variant="outline" size="lg" onClick={onReset}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Start over
            </Button>
          )}
        </div>
      )}

      {status === "error" && onReset && (
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

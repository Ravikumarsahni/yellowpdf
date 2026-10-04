"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ListChecks,
  Loader2,
  FileText,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { ToolShell, type ProcessStatus } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { formatBytes } from "@/lib/format";
import type { Tool } from "@/lib/tools";

interface ExtractState {
  status: "idle" | "extracting" | "done" | "error";
  text: string;
  pages: number;
  error: string | null;
}

const INITIAL_EXTRACT: ExtractState = {
  status: "idle",
  text: "",
  pages: 0,
  error: null,
};

export function AiKeypointsTool({ tool }: { tool: Tool }) {
  const addRecent = useAppStore((s) => s.addRecent);

  const [file, setFile] = useState<File | null>(null);
  const [extract, setExtract] = useState<ExtractState>(INITIAL_EXTRACT);

  const [maxPoints, setMaxPoints] = useState<number>(8);
  const [apiState, setApiState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [points, setPoints] = useState<string>("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setExtract({ ...INITIAL_EXTRACT, status: "extracting" });
    setApiState("idle");
    setPoints("");
    setApiError(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { text, pages } = await extractTextFromPdf(bytes);
      if (!text.trim()) {
        setExtract({
          status: "error",
          text: "",
          pages,
          error:
            "No selectable text could be extracted from this PDF. It may be a scanned image — try the OCR tool first.",
        });
        return;
      }
      setExtract({ status: "done", text, pages, error: null });
    } catch (err) {
      setExtract({
        status: "error",
        text: "",
        pages: 0,
        error:
          err instanceof Error ? err.message : "Failed to read the PDF file.",
      });
    }
  }, []);

  const handleResetFile = useCallback(() => {
    setFile(null);
    setExtract(INITIAL_EXTRACT);
    setApiState("idle");
    setPoints("");
    setApiError(null);
  }, []);

  const handleExtract = useCallback(async () => {
    if (!extract.text) return;
    setApiState("loading");
    setApiError(null);
    try {
      const res = await fetch("/api/ai/keypoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extract.text, maxPoints }),
      });
      const data = (await res.json().catch(() => null)) as
        | { points?: string; error?: string }
        | null;
      if (!res.ok || !data?.points) {
        throw new Error(
          data?.error ?? `Request failed with status ${res.status}`,
        );
      }
      setPoints(data.points);
      setApiState("done");
      addRecent({
        name: "key-points.md",
        toolId: "ai-keypoints",
        size: data.points.length,
      });
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to extract key points.",
      );
      setApiState("error");
    }
  }, [extract.text, maxPoints, addRecent]);

  const handleCopy = useCallback(async () => {
    if (!points) return;
    try {
      await navigator.clipboard.writeText(points);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }, [points]);

  const toolStatus: ProcessStatus =
    extract.status === "extracting" || apiState === "loading"
      ? "processing"
      : apiState === "error" || extract.status === "error"
        ? "error"
        : "idle";

  const statusMessage =
    extract.status === "extracting"
      ? "Extracting text from PDF…"
      : apiState === "loading"
        ? "Extracting key points…"
        : undefined;

  return (
    <ToolShell
      tool={tool}
      status={toolStatus}
      statusMessage={statusMessage}
      onReset={file ? handleResetFile : undefined}
    >
      {!file && (
        <FileDropzone
          accept="application/pdf"
          multiple={false}
          onFiles={handleFiles}
          title="Drop a PDF here"
          hint="or click to browse — single PDF file"
        />
      )}

      {file && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid place-items-center h-9 w-9 rounded-md bg-secondary text-primary shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {extract.status === "done"
                    ? ` · ${extract.pages} page${extract.pages === 1 ? "" : "s"} · ${extract.text.length.toLocaleString()} chars extracted`
                    : extract.status === "extracting"
                      ? " · extracting…"
                      : ""}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFile}
              aria-label="Remove file"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Replace
            </Button>
          </div>

          {extract.status === "error" && extract.error && (
            <p className="text-sm text-destructive">{extract.error}</p>
          )}

          {extract.status === "done" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="max-points" className="text-sm font-medium">
                    Number of key points
                  </Label>
                  <span className="text-sm font-semibold text-primary tabular-nums">
                    {maxPoints}
                  </span>
                </div>
                <Slider
                  id="max-points"
                  min={3}
                  max={15}
                  step={1}
                  value={[maxPoints]}
                  onValueChange={(v) =>
                    setMaxPoints(
                      Array.isArray(v) && typeof v[0] === "number"
                        ? v[0]
                        : 8,
                    )
                  }
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>3</span>
                  <span>15</span>
                </div>
              </div>

              <Button
                onClick={handleExtract}
                disabled={apiState === "loading"}
                size="lg"
                className="w-full"
              >
                {apiState === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting…
                  </>
                ) : (
                  <>
                    <ListChecks className="h-4 w-4" />
                    Extract Key Points
                  </>
                )}
              </Button>

              {apiState === "error" && apiError && (
                <p className="text-sm text-destructive">{apiError}</p>
              )}

              {apiState === "done" && points && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-primary" />
                      Key Points
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert [&_ul]:my-1 [&_li]:my-0.5 [&_p]:my-1">
                      <ReactMarkdown>{points}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI-specific privacy note */}
      <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          Only the extracted{" "}
          <strong className="text-foreground">text</strong> is sent to our AI
          backend — your PDF file never leaves your device.
        </p>
      </div>
    </ToolShell>
  );
}

"use client";

import { useCallback, useState } from "react";
import {
  Sparkles,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { formatBytes } from "@/lib/format";
import type { Tool } from "@/lib/tools";

type Length = "short" | "medium" | "long";

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

export function AiSummarizeTool({ tool }: { tool: Tool }) {
  const addRecent = useAppStore((s) => s.addRecent);

  const [file, setFile] = useState<File | null>(null);
  const [extract, setExtract] = useState<ExtractState>(INITIAL_EXTRACT);

  const [length, setLength] = useState<Length>("medium");
  const [apiState, setApiState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [summary, setSummary] = useState<string>("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      setFile(f);
      setExtract({ ...INITIAL_EXTRACT, status: "extracting" });
      setApiState("idle");
      setSummary("");
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
            err instanceof Error
              ? err.message
              : "Failed to read the PDF file.",
        });
      }
    },
    [],
  );

  const handleResetFile = useCallback(() => {
    setFile(null);
    setExtract(INITIAL_EXTRACT);
    setApiState("idle");
    setSummary("");
    setApiError(null);
  }, []);

  const handleSummarize = useCallback(async () => {
    if (!extract.text) return;
    setApiState("loading");
    setApiError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extract.text, length }),
      });
      const data = (await res.json().catch(() => null)) as
        | { summary?: string; error?: string }
        | null;
      if (!res.ok || !data?.summary) {
        throw new Error(
          data?.error ?? `Request failed with status ${res.status}`,
        );
      }
      setSummary(data.summary);
      setApiState("done");
      addRecent({
        name: "summary.txt",
        toolId: "ai-summarize",
        size: data.summary.length,
      });
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to generate summary.",
      );
      setApiState("error");
    }
  }, [extract.text, length, addRecent]);

  const handleCopy = useCallback(async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Silently ignore — clipboard may be blocked in some sandboxed iframes.
    }
  }, [summary]);

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
        ? "Generating summary…"
        : undefined;

  return (
    <ToolShell
      tool={tool}
      status={toolStatus}
      statusMessage={statusMessage}
      onReset={file ? handleResetFile : undefined}
    >
      {/* File picker / extracted-text summary */}
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

          {/* Summarize controls + result */}
          {extract.status === "done" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-medium">Summary length</p>
                <RadioGroup
                  value={length}
                  onValueChange={(v) => setLength(v as Length)}
                  className="grid grid-cols-3 gap-2"
                >
                  {(["short", "medium", "long"] as const).map((opt) => (
                    <Label
                      key={opt}
                      htmlFor={`len-${opt}`}
                      className="flex items-center gap-2 rounded-md border border-border bg-background p-2.5 cursor-pointer hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <RadioGroupItem id={`len-${opt}`} value={opt} />
                      <span className="text-sm capitalize">{opt}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <Button
                onClick={handleSummarize}
                disabled={apiState === "loading"}
                size="lg"
                className="w-full"
              >
                {apiState === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Summarizing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Summarize PDF
                  </>
                )}
              </Button>

              {apiState === "error" && apiError && (
                <p className="text-sm text-destructive">{apiError}</p>
              )}

              {apiState === "done" && summary && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Summary
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
                    <div className="space-y-3 text-sm leading-relaxed">
                      {summary
                        .split(/\n{2,}/)
                        .map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
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

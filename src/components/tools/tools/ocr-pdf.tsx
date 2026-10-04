"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  ScanText,
  Loader2,
  FileText,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  Download,
  AlertTriangle,
  FileImage,
} from "lucide-react";
import { ToolShell, type ProcessStatus } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import {
  renderPdfPagesToImages,
  estimateImagePayloadBytes,
  type RenderedPage,
} from "@/lib/pdf/render-pages";
import { downloadBlob, formatBytes } from "@/lib/format";
import type { Tool } from "@/lib/tools";

/** Above this payload size we slice the array and warn the user. */
const PAYLOAD_CAP_BYTES = 3 * 1024 * 1024; // 3 MB

interface RenderState {
  status: "idle" | "rendering" | "done" | "error";
  pages: RenderedPage[];
  truncated: boolean;
  error: string | null;
}

const INITIAL_RENDER: RenderState = {
  status: "idle",
  pages: [],
  truncated: false,
  error: null,
};

interface OcrResult {
  text: string;
  pages: number;
  chars: number;
}

export function OcrPdfTool({ tool }: { tool: Tool }) {
  const addRecent = useAppStore((s) => s.addRecent);

  const [file, setFile] = useState<File | null>(null);
  const [render, setRender] = useState<RenderState>(INITIAL_RENDER);

  const [apiState, setApiState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [result, setResult] = useState<OcrResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setRender({ ...INITIAL_RENDER, status: "rendering" });
    setApiState("idle");
    setResult(null);
    setApiError(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const all = await renderPdfPagesToImages(bytes);
      if (all.length === 0) {
        setRender({
          status: "error",
          pages: [],
          truncated: false,
          error:
            "This PDF has no renderable pages. The file may be empty or corrupt — try another tool first.",
        });
        return;
      }
      // Cap payload at PAYLOAD_CAP_BYTES. If we exceed it, slice from the top.
      let pages = all;
      let truncated = false;
      const total = estimateImagePayloadBytes(all.map((p) => p.dataUrl));
      if (total > PAYLOAD_CAP_BYTES) {
        // Trim one page at a time until we're under the cap (or only 1 left).
        let kept = all.length;
        while (
          kept > 1 &&
          estimateImagePayloadBytes(
            all.slice(0, kept).map((p) => p.dataUrl),
          ) > PAYLOAD_CAP_BYTES
        ) {
          kept--;
        }
        pages = all.slice(0, kept);
        truncated = true;
      }
      setRender({ status: "done", pages, truncated, error: null });
    } catch (err) {
      setRender({
        status: "error",
        pages: [],
        truncated: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to render PDF page images.",
      });
    }
  }, []);

  const handleResetFile = useCallback(() => {
    setFile(null);
    setRender(INITIAL_RENDER);
    setApiState("idle");
    setResult(null);
    setApiError(null);
  }, []);

  const handleRunOcr = useCallback(async () => {
    if (render.pages.length === 0) return;
    setApiState("loading");
    setApiError(null);
    try {
      const res = await fetch("/api/ai/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: render.pages.map((p) => p.dataUrl) }),
      });
      const data = (await res.json().catch(() => null)) as
        | OcrResult
        | { error?: string }
        | null;
      if (!res.ok || !data || !("text" in data)) {
        const errMsg =
          data && "error" in data && typeof data.error === "string"
            ? data.error
            : `Request failed with status ${res.status}`;
        throw new Error(errMsg);
      }
      setResult(data);
      setApiState("done");
      addRecent({
        name: "ocr-result.txt",
        toolId: "ocr-pdf",
        size: data.chars,
      });
      toast.success(`OCR done — extracted ${data.chars.toLocaleString()} chars from ${data.pages} page${data.pages === 1 ? "" : "s"}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to run OCR.";
      setApiError(msg);
      setApiState("error");
      toast.error(msg);
    }
  }, [render.pages, addRecent]);

  const handleCopy = useCallback(async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Copied extracted text to clipboard.");
    } catch {
      toast.error("Clipboard blocked by your browser — use Download instead.");
    }
  }, [result?.text]);

  const handleDownload = useCallback(() => {
    if (!result?.text) return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    const name = file?.name
      ? file.name.replace(/\.pdf$/i, "") + ".txt"
      : "ocr-result.txt";
    downloadBlob(blob, name);
  }, [result?.text, file?.name]);

  const toolStatus: ProcessStatus =
    render.status === "rendering" || apiState === "loading"
      ? "processing"
      : apiState === "error" || render.status === "error"
        ? "error"
        : "idle";

  const statusMessage =
    render.status === "rendering"
      ? "Extracting page images…"
      : apiState === "loading"
        ? `OCR-ing ${render.pages.length} page${render.pages.length === 1 ? "" : "s"}…`
        : undefined;

  const payloadBytes = estimateImagePayloadBytes(
    render.pages.map((p) => p.dataUrl),
  );

  return (
    <ToolShell
      tool={tool}
      status={toolStatus}
      statusMessage={statusMessage}
      onReset={file ? handleResetFile : undefined}
    >
      {/* File picker */}
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
                  {render.status === "done"
                    ? ` · ${render.pages.length} page${render.pages.length === 1 ? "" : "s"} rendered · ≈${formatBytes(payloadBytes)} upload`
                    : render.status === "rendering"
                      ? " · rendering…"
                      : ""}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFile}
              aria-label="Replace file"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Replace
            </Button>
          </div>

          {render.status === "error" && render.error && (
            <p className="text-sm text-destructive">{render.error}</p>
          )}

          {render.status === "done" && (
            <div className="space-y-4">
              {render.truncated && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <p>
                    Only the first{" "}
                    <strong>{render.pages.length}</strong> page
                    {render.pages.length === 1 ? "" : "s"} will be OCRed for
                    performance. The full PDF is too large to OCR in one pass —
                    split it into smaller chunks first, or use a desktop OCR
                    tool for huge documents.
                  </p>
                </div>
              )}

              <Button
                onClick={handleRunOcr}
                disabled={apiState === "loading"}
                size="lg"
                className="w-full"
                aria-label="Run OCR on rendered page images"
              >
                {apiState === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    OCR-ing {render.pages.length} page
                    {render.pages.length === 1 ? "" : "s"}…
                  </>
                ) : (
                  <>
                    <ScanText className="h-4 w-4" />
                    Run OCR on {render.pages.length} page
                    {render.pages.length === 1 ? "" : "s"}
                  </>
                )}
              </Button>

              {apiState === "error" && apiError && (
                <p className="text-sm text-destructive">{apiError}</p>
              )}

              {apiState === "done" && result && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <ScanText className="h-4 w-4 text-primary" />
                      Extracted text
                      <span className="text-xs font-normal text-muted-foreground">
                        {result.chars.toLocaleString()} chars · {result.pages}{" "}
                        page{result.pages === 1 ? "" : "s"}
                      </span>
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopy}
                        aria-label="Copy extracted text to clipboard"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy text
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        aria-label="Download extracted text as a .txt file"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download .txt
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre
                      className="max-h-96 overflow-y-auto rounded-md bg-secondary/40 p-4 text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words font-mono"
                      aria-label="OCR-extracted text"
                    >
                      {result.text || "(no text was detected in any page)"}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* OCR-specific privacy note — always rendered */}
      <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          Page images are sent to our AI vision backend for OCR. For{" "}
          <strong className="text-foreground">digital PDFs</strong> with
          embedded text, use the AI Summarize / Translate / Chat tools
          instead — they&apos;re faster and never send images.
        </p>
      </div>

      {/* Small footer hint when no file is loaded yet */}
      {!file && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <FileImage className="h-3.5 w-3.5" />
          Tip: best for scanned documents, photographed pages, and
          image-only PDFs that have no selectable text layer.
        </p>
      )}
    </ToolShell>
  );
}

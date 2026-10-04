"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { Download, Wand2, FileImage } from "lucide-react";
import { ToolShell } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { formatBytes } from "@/lib/format";
import type { Tool } from "@/lib/tools";

// Configure the pdf.js worker once. We use the CDN-hosted worker that
// exactly matches the installed version; this is a static asset fetch, not
// a server upload of any user data.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type RenderFormat = "png" | "jpeg";
type ScaleFactor = 1 | 1.5 | 2;

interface RenderedPage {
  url: string;
  blob: Blob;
  filename: string;
  pageNumber: number;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      mime,
      quality,
    );
  });
}

export function PdfToImagesTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<RenderFormat>("png");
  const [quality, setQuality] = useState<number>(0.85);
  const [scale, setScale] = useState<ScaleFactor>(1.5);
  const [status, setStatus] = useState<
    "idle" | "processing" | "done" | "error"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  // Track total bytes for the recent-file entry (sum of all rendered images).
  const totalBytesRef = useRef<number>(0);

  // Revoke all object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const p of pages) URL.revokeObjectURL(p.url);
    };
    // We intentionally only run on unmount — `pages` is captured fresh.
  }, []);

  function handleFiles(newFiles: File[]) {
    const pdfs = newFiles.filter((f) => f.type === "application/pdf");
    if (pdfs.length !== newFiles.length) {
      toast.warning("Some files were skipped (not PDFs).");
    }
    setFiles(pdfs.slice(0, 1));
    if (status === "done" || status === "error") {
      reset();
    }
  }

  function reset() {
    for (const p of pages) URL.revokeObjectURL(p.url);
    setPages([]);
    setStatus("idle");
    setStatusMsg("");
    totalBytesRef.current = 0;
  }

  function fullReset() {
    reset();
    setFiles([]);
  }

  async function convert() {
    const file = files[0];
    if (!file) {
      toast.error("Please select a PDF.");
      return;
    }
    // Clear previous result.
    reset();
    setStatus("processing");
    setStatusMsg("Reading PDF…");
    try {
      const buf = await file.arrayBuffer();
      const uint8 = new Uint8Array(buf);
      const loadingTask = pdfjsLib.getDocument({ data: uint8 });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      const mime = format === "png" ? "image/png" : "image/jpeg";
      const ext = format === "png" ? "png" : "jpg";
      const collected: RenderedPage[] = [];
      let totalBytes = 0;

      for (let i = 1; i <= numPages; i++) {
        setStatusMsg(`Rendering page ${i} of ${numPages}…`);
        // Yield to the browser so the UI can paint progress.
        await new Promise((r) => setTimeout(r, 0));
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        // White background for JPEG (no alpha → would be black otherwise).
        if (format === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;

        const blob = await canvasToBlob(
          canvas,
          mime,
          format === "jpeg" ? quality : undefined,
        );
        const url = URL.createObjectURL(blob);
        collected.push({
          url,
          blob,
          filename: `page-${i}.${ext}`,
          pageNumber: i,
        });
        totalBytes += blob.size;

        // Stream incremental results so the user sees progress visually.
        setPages([...collected]);
        totalBytesRef.current = totalBytes;
      }

      await loadingTask.destroy();

      setStatus("done");
      setStatusMsg(
        `Rendered ${numPages} page${numPages > 1 ? "s" : ""} (${formatBytes(totalBytes)} total).`,
      );
      useAppStore.getState().addRecent({
        name: file.name.replace(/\.pdf$/i, "") + ` → ${numPages} images`,
        toolId: tool.id,
        size: totalBytes,
      });
      toast.success(`Rendered ${numPages} pages to images.`);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMsg(
        err instanceof Error ? err.message : "Failed to render PDF pages.",
      );
      toast.error("Rendering failed. See the error below.");
    }
  }

  function downloadOne(page: RenderedPage) {
    const link = document.createElement("a");
    link.href = page.url;
    link.download = page.filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadAll() {
    if (pages.length === 0) return;
    toast.info(`Downloading ${pages.length} images…`);
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      // Stagger so the browser doesn't drop multi-file downloads.
      await new Promise((r) => setTimeout(r, 250));
      downloadOne(p);
    }
    toast.success("All downloads started.");
  }

  return (
    <ToolShell
      tool={tool}
      status={status}
      statusMessage={statusMsg}
      onReset={fullReset}
      customResult={
        pages.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium">
                {pages.length} image{pages.length > 1 ? "s" : ""} ready
              </p>
              <Button size="sm" onClick={downloadAll}>
                <Download className="h-4 w-4 mr-1.5" />
                Download all
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
              {pages.map((p) => (
                <div
                  key={p.url}
                  className="rounded-lg border border-border bg-background p-2 flex flex-col gap-2"
                >
                  {/* Image rendered to canvas by pdf.js; no alt source available, so use next/image-free path */}
                  <img
                    src={p.url}
                    alt={p.filename}
                    className="w-full h-32 object-contain bg-secondary/30 rounded"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground truncate">
                      <p className="font-medium text-foreground">{p.filename}</p>
                      <p>{formatBytes(p.blob.size)}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 shrink-0"
                      onClick={() => downloadOne(p)}
                      aria-label={`Download ${p.filename}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : undefined
      }
    >
      <FileDropzone
        accept="application/pdf"
        onFiles={handleFiles}
        files={files}
        onRemove={() => setFiles([])}
        title="Drop a PDF here"
        hint="or click to browse — single PDF file"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Output format
          </Label>
          <Select
            value={format}
            onValueChange={(v) => setFormat(v as RenderFormat)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="png">PNG (lossless)</SelectItem>
              <SelectItem value="jpeg">JPEG (smaller)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Render scale
          </Label>
          <Select
            value={String(scale)}
            onValueChange={(v) => setScale(Number(v) as ScaleFactor)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Scale" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1× (faster, smaller)</SelectItem>
              <SelectItem value="1.5">1.5× (balanced)</SelectItem>
              <SelectItem value="2">2× (sharp, large)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {format === "jpeg" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="q-slider"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              JPEG quality
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(quality * 100)}%
            </span>
          </div>
          <Slider
            id="q-slider"
            min={0.3}
            max={0.95}
            step={0.05}
            value={[quality]}
            onValueChange={(v) => setQuality(v[0] ?? 0.85)}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        {pages.length > 0 && (
          <Button variant="outline" onClick={reset}>
            Reset result
          </Button>
        )}
        <Button
          onClick={convert}
          disabled={files.length === 0 || status === "processing"}
        >
          {status === "processing" ? (
            "Rendering…"
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-1.5" />
              Render pages
            </>
          )}
        </Button>
      </div>

      {pages.length === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <FileImage className="h-3.5 w-3.5" />
          Tip: use 2× scale for crisp, zoomable exports — at the cost of larger files.
        </p>
      )}
    </ToolShell>
  );
}

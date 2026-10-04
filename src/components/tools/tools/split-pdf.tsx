"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Scissors, Download } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useAppStore } from "@/lib/store";
import { downloadBlob, formatBytes } from "@/lib/format";
import {
  createPdf,
  loadPdf,
  pdfBlob,
  savePdf,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

interface SplitResult {
  name: string;
  blob: Blob;
  size: number;
}

type Mode = "range" | "at";

/** Parse a list like "1-3, 5, 7-9" into 1-indexed page numbers. */
function parseRangeList(input: string, max: number): number[] | null {
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const part of parts) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      if (a < 1 || b < 1 || a > max || b > max) return null;
      if (a > b) return null;
      for (let i = a; i <= b; i++) out.push(i);
    } else {
      const n = parseInt(part, 10);
      if (!Number.isFinite(n) || n < 1 || n > max) return null;
      out.push(n);
    }
  }
  return out;
}

export function SplitPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>("range");
  const [rangeInput, setRangeInput] = useState("1-3");
  const [atInput, setAtInput] = useState("1");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<SplitResult[]>([]);

  const onFiles = async (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      toast.error("Only PDF files are supported.");
      return;
    }
    setFiles([f]);
    setResults([]);
    setStatus("idle");
    setStatusMessage("");
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await loadPdf(bytes);
      setPageCount(doc.getPageCount());
    } catch (err) {
      console.error(err);
      setPageCount(null);
      toast.error("Could not read this PDF.");
    }
  };

  const onRemove = () => {
    setFiles([]);
    setPageCount(null);
    setResults([]);
    setStatus("idle");
    setStatusMessage("");
  };

  const onProcess = async () => {
    if (files.length === 0) {
      toast.error("Add a PDF first.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Splitting PDF…");
    setResults([]);
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const src = await loadPdf(bytes);
      const total = src.getPageCount();

      const built: SplitResult[] = [];

      if (mode === "range") {
        const pages = parseRangeList(rangeInput, total);
        if (!pages) {
          setStatus("error");
          setStatusMessage(
            `Invalid range. Use formats like "1-3" or "1, 2, 5-7" (max page: ${total}).`,
          );
          toast.error("Invalid page range.");
          return;
        }
        const fresh = await createPdf();
        const indices = pages.map((p) => p - 1);
        const pages2 = await fresh.copyPages(src, indices);
        for (const p of pages2) fresh.addPage(p);
        const outBytes = await savePdf(fresh);
        built.push({
          name: "split-1.pdf",
          blob: pdfBlob(outBytes),
          size: outBytes.length,
        });
      } else {
        const at = parseInt(atInput, 10);
        if (!Number.isFinite(at) || at < 1 || at >= total) {
          setStatus("error");
          setStatusMessage(`Split point must be between 1 and ${total - 1}.`);
          toast.error("Invalid split point.");
          return;
        }
        // First part: pages 1..at (0-indexed 0..at-1)
        const first = await createPdf();
        const firstIdx = Array.from({ length: at }, (_, k) => k);
        const firstPages = await first.copyPages(src, firstIdx);
        for (const p of firstPages) first.addPage(p);
        const firstBytes = await savePdf(first);
        built.push({
          name: "split-1.pdf",
          blob: pdfBlob(firstBytes),
          size: firstBytes.length,
        });
        // Second part: pages at+1..total (0-indexed at..total-1)
        const second = await createPdf();
        const secondIdx = Array.from(
          { length: total - at },
          (_, k) => at + k,
        );
        const secondPages = await second.copyPages(src, secondIdx);
        for (const p of secondPages) second.addPage(p);
        const secondBytes = await savePdf(second);
        built.push({
          name: "split-2.pdf",
          blob: pdfBlob(secondBytes),
          size: secondBytes.length,
        });
      }

      setResults(built);
      setStatus("done");
      setStatusMessage(
        mode === "range"
          ? "Extracted the requested pages."
          : `Split into 2 files at page ${atInput}.`,
      );
      for (const r of built) {
        useAppStore.getState().addRecent({
          name: r.name,
          toolId: tool.id,
          size: r.size,
        });
      }
      toast.success("Split complete!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not split this PDF. Please try a different file.");
      toast.error("Split failed.");
    }
  };

  const onReset = () => {
    setFiles([]);
    setPageCount(null);
    setResults([]);
    setStatus("idle");
    setStatusMessage("");
    setRangeInput("1-3");
    setAtInput("1");
  };

  const onDownload = (r: SplitResult) => {
    downloadBlob(r.blob, r.name);
  };

  return (
    <ToolShell
      tool={tool}
      status={status}
      statusMessage={statusMessage}
      onReset={onReset}
      resultUrl={null}
      customResult={
        status === "done" && results.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {results.length} file{results.length === 1 ? "" : "s"} ready:
            </p>
            <ul className="space-y-2">
              {results.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center gap-3 rounded-md border border-border bg-background p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(r.size)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => onDownload(r)}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : undefined
      }
    >
      <FileDropzone
        accept="application/pdf"
        onFiles={onFiles}
        files={files}
        onRemove={onRemove}
        title="Drop a PDF to split"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <p className="text-xs text-muted-foreground">
          Loaded {pageCount} page{pageCount === 1 ? "" : "s"}.
        </p>
      )}

      <div className="space-y-3">
        <Label>Split mode</Label>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          className="flex flex-col gap-2 sm:flex-row sm:gap-6"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem id="split-mode-range" value="range" />
            <Label htmlFor="split-mode-range" className="cursor-pointer">
              Extract page range
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="split-mode-at" value="at" />
            <Label htmlFor="split-mode-at" className="cursor-pointer">
              Split at page X
            </Label>
          </div>
        </RadioGroup>

        {mode === "range" ? (
          <div className="space-y-1.5">
            <Label htmlFor="split-range-input">Pages to extract</Label>
            <Input
              id="split-range-input"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder='e.g. "1-3" or "1, 2, 5-7"'
              aria-describedby="split-range-hint"
            />
            <p id="split-range-hint" className="text-xs text-muted-foreground">
              Use a single range or comma-separated list. Produces one file
              containing only those pages.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="split-at-input">Split point (page number)</Label>
            <Input
              id="split-at-input"
              type="number"
              min={1}
              value={atInput}
              onChange={(e) => setAtInput(e.target.value)}
              placeholder="e.g. 3"
              aria-describedby="split-at-hint"
            />
            <p id="split-at-hint" className="text-xs text-muted-foreground">
              Produces two files: pages 1..N and pages N+1..end.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length === 0 || status === "processing"}
        >
          <Scissors className="h-4 w-4 mr-1.5" />
          Split PDF
        </Button>
      </div>
    </ToolShell>
  );
}

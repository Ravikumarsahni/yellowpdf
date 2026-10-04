"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { downloadBlob } from "@/lib/format";
import {
  createPdf,
  loadPdf,
  pdfBlob,
  savePdf,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

/** Parse a list like "1-3, 5, 7-9" into a Set of 1-indexed page numbers. */
function parseRangeSet(input: string, max: number): Set<number> | null {
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out = new Set<number>();
  for (const part of parts) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      if (a < 1 || b < 1 || a > max || b > max) return null;
      if (a > b) return null;
      for (let i = a; i <= b; i++) out.add(i);
    } else {
      const n = parseInt(part, 10);
      if (!Number.isFinite(n) || n < 1 || n > max) return null;
      out.add(n);
    }
  }
  return out.size === 0 ? null : out;
}

export function DeletePagesTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pagesInput, setPagesInput] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("deleted-pages.pdf");
  const [resultSize, setResultSize] = useState<number | undefined>();

  const onFiles = async (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      toast.error("Only PDF files are supported.");
      return;
    }
    setFiles([f]);
    setStatus("idle");
    setStatusMessage("");
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setResultBlob(null);
    }
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
    setStatus("idle");
    setStatusMessage("");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
  };

  const onProcess = async () => {
    if (files.length === 0) {
      toast.error("Add a PDF first.");
      return;
    }
    if (pageCount === null) {
      toast.error("PDF not loaded yet.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Removing pages…");
    try {
      const deleteSet = parseRangeSet(pagesInput, pageCount);
      if (!deleteSet) {
        setStatus("error");
        setStatusMessage(
          `Invalid page list. Use formats like "1-3, 5, 7-9" (max page: ${pageCount}).`,
        );
        toast.error("Invalid page list.");
        return;
      }
      if (deleteSet.size === pageCount) {
        setStatus("error");
        setStatusMessage("You can't delete every page — the result would be empty.");
        toast.error("Can't delete every page.");
        return;
      }

      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const src = await loadPdf(bytes);
      const total = src.getPageCount();
      const keepIndices: number[] = [];
      for (let i = 0; i < total; i++) {
        if (!deleteSet.has(i + 1)) keepIndices.push(i);
      }

      const out = await createPdf();
      const copied = await out.copyPages(src, keepIndices);
      for (const p of copied) out.addPage(p);

      const outBytes = await savePdf(out);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(
        `Removed ${deleteSet.size} page${deleteSet.size === 1 ? "" : "s"}. Result has ${keepIndices.length} page${keepIndices.length === 1 ? "" : "s"}.`,
      );
      useAppStore.getState().addRecent({
        name: "deleted-pages.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Pages deleted!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not delete pages from this PDF.");
      toast.error("Delete failed.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
    setPageCount(null);
    setStatus("idle");
    setStatusMessage("");
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
    setPagesInput("");
  };

  const onDownload = () => {
    if (!resultBlob) return;
    downloadBlob(resultBlob, resultName);
  };

  return (
    <ToolShell
      tool={tool}
      status={status}
      statusMessage={statusMessage}
      onReset={onReset}
      resultUrl={resultUrl}
      resultName={resultName}
      resultSize={resultSize}
      onDownload={onDownload}
    >
      <FileDropzone
        accept="application/pdf"
        onFiles={onFiles}
        files={files}
        onRemove={onRemove}
        title="Drop a PDF to delete pages"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <p className="text-xs text-muted-foreground">
          Loaded {pageCount} page{pageCount === 1 ? "" : "s"}.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="delete-pages-input">Pages to delete</Label>
        <Input
          id="delete-pages-input"
          value={pagesInput}
          onChange={(e) => setPagesInput(e.target.value)}
          placeholder='e.g. "1-3, 5, 7-9"'
          aria-describedby="delete-pages-hint"
        />
        <p id="delete-pages-hint" className="text-xs text-muted-foreground">
          Comma-separated list of pages or ranges. Remaining pages are kept in
          their original order.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={
            files.length === 0 ||
            pagesInput.trim().length === 0 ||
            status === "processing"
          }
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete pages
        </Button>
      </div>
    </ToolShell>
  );
}

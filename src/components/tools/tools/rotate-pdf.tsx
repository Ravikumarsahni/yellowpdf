"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
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
import { downloadBlob } from "@/lib/format";
import {
  degrees,
  loadPdf,
  pdfBlob,
  savePdf,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

type Target = "all" | "pages";

const ANGLES = [90, 180, 270] as const;

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

export function RotatePdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [angle, setAngle] = useState<number>(90);
  const [target, setTarget] = useState<Target>("all");
  const [pagesInput, setPagesInput] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("rotated.pdf");
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
    setStatus("processing");
    setStatusMessage("Rotating pages…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const doc = await loadPdf(bytes);
      const total = doc.getPageCount();

      let targetSet: Set<number> | null = null;
      if (target === "pages") {
        const pages = parseRangeList(pagesInput, total);
        if (!pages) {
          setStatus("error");
          setStatusMessage(
            `Invalid page range. Use formats like "1-3" or "1, 2, 5-7" (max page: ${total}).`,
          );
          toast.error("Invalid page range.");
          return;
        }
        targetSet = new Set(pages);
      }

      const pages = doc.getPages();
      for (let i = 0; i < pages.length; i++) {
        if (targetSet && !targetSet.has(i + 1)) continue;
        const page = pages[i];
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + angle) % 360));
      }

      const outBytes = await savePdf(doc);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(
        target === "all"
          ? `Rotated every page by ${angle}°.`
          : `Rotated selected pages by ${angle}°.`,
      );
      useAppStore.getState().addRecent({
        name: "rotated.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Rotation complete!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not rotate this PDF. Please try another file.");
      toast.error("Rotation failed.");
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
        title="Drop a PDF to rotate"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <p className="text-xs text-muted-foreground">
          Loaded {pageCount} page{pageCount === 1 ? "" : "s"}.
        </p>
      )}

      <div className="space-y-3">
        <Label>Rotation angle</Label>
        <RadioGroup
          value={String(angle)}
          onValueChange={(v) => setAngle(parseInt(v, 10))}
          className="grid grid-cols-3 gap-2"
        >
          {ANGLES.map((a) => (
            <Label
              key={a}
              htmlFor={`rotate-${a}`}
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-background p-3 cursor-pointer hover:bg-accent/30"
            >
              <RadioGroupItem id={`rotate-${a}`} value={String(a)} />
              <span className="text-sm font-medium">{a}°</span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <Label>Apply to</Label>
        <RadioGroup
          value={target}
          onValueChange={(v) => setTarget(v as Target)}
          className="flex flex-col gap-2 sm:flex-row sm:gap-6"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem id="rotate-target-all" value="all" />
            <Label htmlFor="rotate-target-all" className="cursor-pointer">
              All pages
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="rotate-target-pages" value="pages" />
            <Label htmlFor="rotate-target-pages" className="cursor-pointer">
              Specific pages
            </Label>
          </div>
        </RadioGroup>

        {target === "pages" && (
          <div className="space-y-1.5">
            <Label htmlFor="rotate-pages-input">Pages to rotate</Label>
            <Input
              id="rotate-pages-input"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              placeholder='e.g. "1-3, 5, 7-9"'
              aria-describedby="rotate-pages-hint"
            />
            <p id="rotate-pages-hint" className="text-xs text-muted-foreground">
              Comma-separated list of pages or ranges. Other pages stay
              unchanged.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length === 0 || status === "processing"}
        >
          <RotateCw className="h-4 w-4 mr-1.5" />
          Rotate PDF
        </Button>
      </div>
    </ToolShell>
  );
}

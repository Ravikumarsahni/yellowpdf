"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Hash } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { downloadBlob } from "@/lib/format";
import {
  degrees,
  loadPdf,
  pdfBlob,
  rgb,
  savePdf,
  StandardFonts,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

type Position = "footer-center" | "footer-right" | "header-right";
type FontSize = "small" | "medium" | "large";

const SIZE_MAP: Record<FontSize, number> = {
  small: 10,
  medium: 14,
  large: 18,
};

const MARGIN = 24; // pt

export function NumberPagesTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [position, setPosition] = useState<Position>("footer-center");
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [start, setStart] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("numbered.pdf");
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
    if (!Number.isFinite(start) || start < 1) {
      toast.error("Starting page must be 1 or greater.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Adding page numbers…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const doc = await loadPdf(bytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const size = SIZE_MAP[fontSize];
      const color = rgb(0, 0, 0);
      const pages = doc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageNum = start + i;
        const text = String(pageNum);
        const textWidth = font.widthOfTextAtSize(text, size);
        const { width, height } = page.getSize();
        let x: number;
        let y: number;
        switch (position) {
          case "footer-center":
            x = (width - textWidth) / 2;
            y = MARGIN;
            break;
          case "footer-right":
            x = width - textWidth - MARGIN;
            y = MARGIN;
            break;
          case "header-right":
            x = width - textWidth - MARGIN;
            y = height - size - MARGIN;
            break;
        }
        page.drawText(text, {
          x,
          y,
          size,
          font,
          color,
          rotate: degrees(0),
        });
      }

      const outBytes = await savePdf(doc);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(`Numbered ${pages.length} page${pages.length === 1 ? "" : "s"} starting at ${start}.`);
      useAppStore.getState().addRecent({
        name: "numbered.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Page numbers added!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not number this PDF.");
      toast.error("Numbering failed.");
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
    setStart(1);
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
        title="Drop a PDF to number"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <p className="text-xs text-muted-foreground">
          Loaded {pageCount} page{pageCount === 1 ? "" : "s"}.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="number-position">Position</Label>
          <Select
            value={position}
            onValueChange={(v) => setPosition(v as Position)}
          >
            <SelectTrigger id="number-position" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="footer-center">Footer — center</SelectItem>
              <SelectItem value="footer-right">Footer — right</SelectItem>
              <SelectItem value="header-right">Header — right</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="number-size">Font size</Label>
          <Select
            value={fontSize}
            onValueChange={(v) => setFontSize(v as FontSize)}
          >
            <SelectTrigger id="number-size" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small ({SIZE_MAP.small}pt)</SelectItem>
              <SelectItem value="medium">Medium ({SIZE_MAP.medium}pt)</SelectItem>
              <SelectItem value="large">Large ({SIZE_MAP.large}pt)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="number-start">Starting page number</Label>
          <Input
            id="number-start"
            type="number"
            min={1}
            value={start}
            onChange={(e) => setStart(parseInt(e.target.value, 10) || 1)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length === 0 || status === "processing"}
        >
          <Hash className="h-4 w-4 mr-1.5" />
          Add page numbers
        </Button>
      </div>
    </ToolShell>
  );
}

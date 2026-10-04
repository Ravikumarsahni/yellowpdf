"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Stamp } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0.5, g: 0.5, b: 0.5 };
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16) / 255,
    g: parseInt(v.slice(2, 4), 16) / 255,
    b: parseInt(v.slice(4, 6), 16) / 255,
  };
}

export function WatermarkPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState(60);
  const [opacity, setOpacity] = useState(0.25);
  const [angle, setAngle] = useState(-45);
  const [color, setColor] = useState("#888888");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("watermarked.pdf");
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
    if (!text.trim()) {
      toast.error("Watermark text cannot be empty.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Adding watermark…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const doc = await loadPdf(bytes);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const { r, g, b } = hexToRgb(color);
      const colorVal = rgb(r, g, b);
      const pages = doc.getPages();

      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = fontSize;
        // Center the text geometrically, accounting for its width.
        const cx = width / 2;
        const cy = height / 2;
        // Anchor: text baseline at (cx - textWidth/2, cy - textHeight/2).
        // With rotation around (cx, cy), the text rotates around its center.
        page.drawText(text, {
          x: cx - textWidth / 2,
          y: cy - textHeight / 2,
          size: fontSize,
          font,
          color: colorVal,
          opacity,
          rotate: degrees(angle),
        });
      }

      const outBytes = await savePdf(doc);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(`Watermarked ${pages.length} page${pages.length === 1 ? "" : "s"}.`);
      useAppStore.getState().addRecent({
        name: "watermarked.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Watermark added!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not watermark this PDF.");
      toast.error("Watermark failed.");
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
        title="Drop a PDF to watermark"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <p className="text-xs text-muted-foreground">
          Loaded {pageCount} page{pageCount === 1 ? "" : "s"}.
        </p>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="wm-text">Watermark text</Label>
          <Input
            id="wm-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="CONFIDENTIAL"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="wm-size">Font size</Label>
            <span className="text-xs text-muted-foreground">{fontSize}pt</span>
          </div>
          <Slider
            id="wm-size"
            min={20}
            max={120}
            step={1}
            value={[fontSize]}
            onValueChange={(v) => setFontSize(v[0] ?? 60)}
            aria-label="Font size"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="wm-opacity">Opacity</Label>
            <span className="text-xs text-muted-foreground">
              {Math.round(opacity * 100)}%
            </span>
          </div>
          <Slider
            id="wm-opacity"
            min={10}
            max={100}
            step={1}
            value={[Math.round(opacity * 100)]}
            onValueChange={(v) => setOpacity((v[0] ?? 25) / 100)}
            aria-label="Opacity"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="wm-angle">Angle</Label>
            <span className="text-xs text-muted-foreground">{angle}°</span>
          </div>
          <Slider
            id="wm-angle"
            min={-90}
            max={90}
            step={1}
            value={[angle]}
            onValueChange={(v) => setAngle(v[0] ?? -45)}
            aria-label="Rotation angle"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wm-color">Color</Label>
          <div className="flex items-center gap-2">
            <input
              id="wm-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 rounded-md border border-border bg-background p-1 cursor-pointer"
              aria-label="Watermark color"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-32"
              aria-label="Watermark color hex value"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length === 0 || status === "processing"}
        >
          <Stamp className="h-4 w-4 mr-1.5" />
          Add watermark
        </Button>
      </div>
    </ToolShell>
  );
}

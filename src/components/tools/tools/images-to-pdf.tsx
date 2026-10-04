"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FileImage, Wand2 } from "lucide-react";
import { ToolShell } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  createPdf,
  embedStandardFonts,
  savePdf,
  pdfBlob,
  PAGE_SIZES,
  type PDFDocument,
} from "@/lib/pdf/client-pdf";
import { downloadBlob, formatBytes } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { Tool } from "@/lib/tools";

// pdf-lib's PDFImage type isn't exported through our wrapper. We only need
// the `.width`, `.height` and a `page.drawImage(img, opts)` use site, so a
// minimal structural type keeps callers happy without leaking pdf-lib types.
type EmbeddedImage = {
  width: number;
  height: number;
};

type PageSize = "A4" | "Letter" | "fit";
type Orientation = "portrait" | "landscape";
type MarginSize = "none" | "small" | "medium";

const MARGIN_PTS: Record<MarginSize, number> = {
  none: 0,
  small: 18, // ~0.25"
  medium: 36, // ~0.5"
};

/** Read a File as raw bytes. */
async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Decode an image File into an HTMLImageElement so we can rasterize it via
 * canvas later (used for formats pdf-lib doesn't embed natively).
 */
function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not decode image "${file.name}"`));
    };
    img.src = url;
  });
}

/**
 * Rasterize an image File to PNG bytes via an offscreen canvas. Used as a
 * fallback for image formats pdf-lib can't embed natively (webp, gif, bmp).
 */
async function imageFileToPngBytes(
  file: File,
): Promise<Uint8Array> {
  const img = await loadImageElement(file);
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("Failed to rasterize image to PNG");
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Embed an image into the doc. Detects MIME type to choose between
 * `embedJpg` (JPEG) and `embedPng` (PNG / webp / gif / etc. — rasterized
 * through a canvas first for non-PNG types).
 */
async function embedImageFile(
  doc: PDFDocument,
  file: File,
): Promise<EmbeddedImage> {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") {
    const bytes = await fileToBytes(file);
    const img = await doc.embedJpg(bytes);
    return img as unknown as EmbeddedImage;
  }
  if (type === "image/png") {
    const bytes = await fileToBytes(file);
    const img = await doc.embedPng(bytes);
    return img as unknown as EmbeddedImage;
  }
  // Fallback: rasterize via canvas → PNG, then embed.
  const pngBytes = await imageFileToPngBytes(file);
  const img = await doc.embedPng(pngBytes);
  return img as unknown as EmbeddedImage;
}

/** Type-safe wrapper around `page.drawImage`. */
function drawEmbeddedImage(
  doc: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  img: EmbeddedImage,
  opts: { x: number; y: number; width: number; height: number },
): void {
  page.drawImage(img as unknown as Parameters<typeof page.drawImage>[0], opts);
}

export function ImagesToPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [margin, setMargin] = useState<MarginSize>("small");
  const [status, setStatus] = useState<
    "idle" | "processing" | "done" | "error"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number>(0);

  const OUTPUT_NAME = "images.pdf";

  function handleFiles(newFiles: File[]) {
    const imgs = newFiles.filter((f) => f.type.startsWith("image/"));
    if (imgs.length !== newFiles.length) {
      toast.warning("Some files were skipped (not images).");
    }
    setFiles((prev) => [...prev, ...imgs]);
    if (status === "done" || status === "error") {
      setStatus("idle");
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
        setResultUrl(null);
      }
    }
  }

  function handleRemove(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i: number) {
    setFiles((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next;
    });
  }

  function reset() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setStatus("idle");
    setResultUrl(null);
    setResultSize(0);
    setStatusMsg("");
  }

  async function convert() {
    if (files.length === 0) {
      toast.error("Please add at least one image.");
      return;
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setStatus("processing");
    setStatusMsg(`Embedding ${files.length} image${files.length > 1 ? "s" : ""}…`);
    try {
      const doc = await createPdf();
      // Pre-embed Helvetica so metadata setters have a fallback font context.
      await embedStandardFonts(doc);

      const marginPts = MARGIN_PTS[margin];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStatusMsg(`Embedding image ${i + 1} of ${files.length}: ${f.name}`);
        const pdfImage = await embedImageFile(doc, f);

        let pageWidth: number;
        let pageHeight: number;
        if (pageSize === "fit") {
          pageWidth = pdfImage.width + marginPts * 2;
          pageHeight = pdfImage.height + marginPts * 2;
        } else {
          const base = PAGE_SIZES[pageSize];
          if (orientation === "landscape") {
            pageWidth = base.height;
            pageHeight = base.width;
          } else {
            pageWidth = base.width;
            pageHeight = base.height;
          }
        }

        const page = doc.addPage([pageWidth, pageHeight]);

        // Compute the largest draw rectangle that fits inside (page - margin)
        // while preserving the image's aspect ratio (contain).
        const availW = Math.max(pageWidth - marginPts * 2, 1);
        const availH = Math.max(pageHeight - marginPts * 2, 1);
        const imgRatio = pdfImage.width / pdfImage.height;
        const boxRatio = availW / availH;
        let drawW: number;
        let drawH: number;
        if (imgRatio > boxRatio) {
          drawW = availW;
          drawH = availW / imgRatio;
        } else {
          drawH = availH;
          drawW = availH * imgRatio;
        }
        const x = (pageWidth - drawW) / 2;
        const y = (pageHeight - drawH) / 2;

        drawEmbeddedImage(doc, page, pdfImage, {
          x,
          y,
          width: drawW,
          height: drawH,
        });
      }

      doc.setTitle("Images to PDF");
      doc.setCreator("YellowPDF");
      doc.setProducer("pdf-lib");
      doc.setModificationDate(new Date());
      doc.setCreationDate(new Date());

      const bytes = await savePdf(doc);
      const blob = pdfBlob(bytes);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
      setStatus("done");
      setStatusMsg(
        `Created a ${formatBytes(blob.size)} PDF from ${files.length} image${files.length > 1 ? "s" : ""}.`,
      );
      useAppStore.getState().addRecent({
        name: OUTPUT_NAME,
        toolId: tool.id,
        size: blob.size,
      });
      toast.success("PDF created from your images.");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMsg(
        err instanceof Error
          ? err.message
          : "Failed to convert images to PDF.",
      );
      toast.error("Conversion failed. See the error below.");
    }
  }

  function onDownload() {
    if (!resultUrl) return;
    fetch(resultUrl)
      .then((r) => r.blob())
      .then((blob) => downloadBlob(blob, OUTPUT_NAME))
      .catch(() => toast.error("Download failed."));
  }

  return (
    <ToolShell
      tool={tool}
      status={status}
      statusMessage={statusMsg}
      onReset={reset}
      resultUrl={resultUrl}
      resultName={OUTPUT_NAME}
      resultSize={resultSize}
      onDownload={onDownload}
    >
      <FileDropzone
        accept="image/*"
        multiple
        onFiles={handleFiles}
        files={files}
        onRemove={handleRemove}
        title="Drop images here"
        hint="or click to browse — JPG, PNG, WebP, GIF, BMP"
      />

      {files.length > 0 && (
        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            Order (top → bottom becomes page 1 → last)
          </Label>
          <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
              >
                <div className="grid place-items-center h-8 w-8 rounded-md bg-secondary text-primary shrink-0">
                  <FileImage className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {i + 1}. {f.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(f.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={i === 0}
                  onClick={() => moveUp(i)}
                  aria-label={`Move ${f.name} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={i === files.length - 1}
                  onClick={() => moveDown(i)}
                  aria-label={`Move ${f.name} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Page size
          </Label>
          <Select
            value={pageSize}
            onValueChange={(v) => setPageSize(v as PageSize)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Page size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">US Letter</SelectItem>
              <SelectItem value="fit">Fit to image</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Orientation
          </Label>
          <RadioGroup
            value={orientation}
            onValueChange={(v) => setOrientation(v as Orientation)}
            className="flex gap-4 pt-2"
          >
            <Label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="portrait" id="o-port" />
              <span>Portrait</span>
            </Label>
            <Label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="landscape" id="o-land" />
              <span>Landscape</span>
            </Label>
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Margin
          </Label>
          <Select
            value={margin}
            onValueChange={(v) => setMargin(v as MarginSize)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Margin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="small">Small (~0.25 in)</SelectItem>
              <SelectItem value="medium">Medium (~0.5 in)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {files.length > 0 && (
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
        )}
        <Button
          onClick={convert}
          disabled={files.length === 0 || status === "processing"}
        >
          <Wand2 className="h-4 w-4 mr-1.5" />
          {status === "processing" ? "Converting…" : "Convert to PDF"}
        </Button>
      </div>
    </ToolShell>
  );
}

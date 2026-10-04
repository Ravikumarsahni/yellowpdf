"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileSignature,
  Trash2,
  Undo2,
  PenLine,
  Type as TypeIcon,
  Pen,
} from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, downloadBlob } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { loadPdf, savePdf, pdfBlob } from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

// ── Constants ──────────────────────────────────────────────────────────────

const CANVAS_W = 480;
const CANVAS_H = 200;
// Pixel → PDF-point scale. At 0.5, a 480px-wide canvas renders as 240pt wide
// (~3.3") at 100% size, which is a comfortable default signature width.
const PT_PER_PX = 0.5;
// Margin (PDF points) kept between the signature and the page edge.
const MARGIN_PT = 36;
const RESULT_NAME = "signed.pdf";

type FontKey = "helvetica" | "helvetica-bold" | "times" | "courier";

interface FontOption {
  value: FontKey;
  label: string;
  // CSS font shorthand used for both the live preview and the canvas
  // rasterization that becomes the embedded PNG.
  css: string;
}

const FONT_OPTIONS: FontOption[] = [
  {
    value: "helvetica",
    label: "Helvetica Italic",
    css: "italic 400 56px Helvetica, Arial, sans-serif",
  },
  {
    value: "helvetica-bold",
    label: "Helvetica Bold Italic",
    css: "italic 700 56px Helvetica, Arial, sans-serif",
  },
  {
    value: "times",
    label: "Times Italic",
    css: "italic 400 56px Times, 'Times New Roman', serif",
  },
  {
    value: "courier",
    label: "Courier Italic",
    css: "italic 400 56px Courier, 'Courier New', monospace",
  },
];

type PositionPreset =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

const POSITION_PRESETS: {
  value: PositionPreset;
  label: string;
  /** Tailwind position classes for the chip's signature marker. */
  marker: string;
}[] = [
  { value: "top-left", label: "Top left", marker: "top-1 left-1" },
  { value: "top-right", label: "Top right", marker: "top-1 right-1" },
  { value: "center", label: "Center", marker: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" },
  { value: "bottom-left", label: "Bottom left", marker: "bottom-1 left-1" },
  { value: "bottom-right", label: "Bottom right", marker: "bottom-1 right-1" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

type Point = { x: number; y: number };

/**
 * Convert a `data:image/png;base64,...` URL into raw PNG bytes for pdf-lib.
 * pdf-lib's `embedPng` accepts `Uint8Array | ArrayBuffer | base64string` —
 * but it expects a raw base64 string (no data: prefix), so we decode here to
 * be safe across all pdf-lib versions.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return new Uint8Array();
  const b64 = dataUrl.slice(comma + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Render the typed-signature text to a transparent PNG data URL using a
 * dynamically-sized offscreen canvas so the embedded image has tight bounds.
 */
function typeSignatureToDataUrl(text: string, fontCss: string): string {
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) return "";
  mctx.font = fontCss;
  const pad = 14;
  const w = Math.max(80, Math.ceil(mctx.measureText(text).width + pad * 2));
  const h = 80;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.font = fontCss;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(text, pad, h / 2);
  return canvas.toDataURL("image/png");
}

/**
 * Rasterize the current "draw" strokes to a transparent PNG data URL. Matches
 * the live preview canvas pixel-for-pixel so what the user sees is exactly
 * what gets embedded.
 */
function drawSignatureToDataUrl(
  strokes: Point[][],
  color: string,
  width: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    if (stroke.length === 1) {
      // Single-tap dot — render a small filled circle so the user sees
      // something instead of nothing.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(stroke[0].x, stroke[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

/**
 * Compute the (x, y) PDF point coordinates for the signature's bottom-left
 * corner given the chosen preset. pdf-lib uses bottom-left origin, so
 * "top" = high y, "bottom" = low y.
 */
function computePosition(
  preset: PositionPreset,
  pageW: number,
  pageH: number,
  sigW: number,
  sigH: number,
): { x: number; y: number } {
  const m = MARGIN_PT;
  switch (preset) {
    case "top-left":
      return { x: m, y: pageH - sigH - m };
    case "top-right":
      return { x: pageW - sigW - m, y: pageH - sigH - m };
    case "bottom-left":
      return { x: m, y: m };
    case "bottom-right":
      return { x: pageW - sigW - m, y: m };
    case "center":
    default:
      return { x: (pageW - sigW) / 2, y: (pageH - sigH) / 2 };
  }
}

// ── SignaturePad (draw tab) ─────────────────────────────────────────────────

interface SignaturePadProps {
  strokes: Point[][];
  onStrokesChange: (next: Point[][]) => void;
  color: string;
  width: number;
}

function SignaturePad({
  strokes,
  onStrokesChange,
  color,
  width,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const currentRef = useRef<Point[] | null>(null);

  // Re-render the entire canvas from the strokes state when the state changes
  // externally (undo, clear, color, width). While a stroke is in progress we
  // draw directly to the canvas without triggering React state updates.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, color, width]);

  const getPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width ? canvas.width / rect.width : 1;
      const scaleY = rect.height ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Safari < 13 throws on already-captured pointers — ignore.
    }
    drawingRef.current = true;
    const p = getPoint(e);
    currentRef.current = [p];
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.fillStyle = color;
      // Render an initial dot so a single tap leaves a visible mark.
      ctx.beginPath();
      ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    const cur = currentRef.current;
    if (cur) cur.push(p);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Same Safari note as above.
    }
    const cur = currentRef.current;
    currentRef.current = null;
    if (cur && cur.length > 0) {
      onStrokesChange([...strokes, cur]);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={(e) => {
        // Don't end the stroke on leave if pointer capture is active — the
        // browser will keep delivering events. Only end if not drawing.
        if (!drawingRef.current) return;
        // Pointer capture should keep events flowing; this is a no-op safety.
        void e;
      }}
      role="img"
      aria-label="Signature drawing pad — draw with mouse, touch, or stylus"
      tabIndex={0}
      className="block w-full max-w-[480px] h-auto rounded-lg border border-border bg-white touch-none cursor-crosshair shadow-sm"
    />
  );
}

// ── Position chip ───────────────────────────────────────────────────────────

function PositionChip({
  preset,
  selected,
  onClick,
}: {
  preset: (typeof POSITION_PRESETS)[number];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Place signature: ${preset.label}`}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all",
        "hover:border-primary/60 hover:bg-accent/30",
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
          : "border-border bg-background",
      )}
    >
      <span className="relative block w-full aspect-[3/4] rounded bg-secondary/70 overflow-hidden">
        <span
          className={cn(
            "absolute h-1.5 w-7 rounded-sm bg-primary",
            preset.marker,
          )}
        />
      </span>
      <span className="text-[11px] font-medium text-foreground/80">
        {preset.label}
      </span>
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function SignPdfTool({ tool }: { tool: Tool }) {
  // ── File state ────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<File[]>([]);
  const [pageBytes, setPageBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  // ── Signature state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [drawColor, setDrawColor] = useState("#0f172a");
  const [drawWidth, setDrawWidth] = useState(2.5);
  const [typedText, setTypedText] = useState("");
  const [fontKey, setFontKey] = useState<FontKey>("helvetica");

  // ── Placement state ────────────────────────────────────────────────────────
  const [pageNum, setPageNum] = useState(1);
  const [position, setPosition] = useState<PositionPreset>("bottom-right");
  const [sizePercent, setSizePercent] = useState(80);

  // ── Result state ───────────────────────────────────────────────────────────
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number | undefined>(undefined);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const fontCss = useMemo(
    () => FONT_OPTIONS.find((f) => f.value === fontKey)?.css ?? FONT_OPTIONS[0].css,
    [fontKey],
  );

  const hasDrawSignature = strokes.some((s) => s.length > 0);
  const hasTypeSignature = typedText.trim().length > 0;
  const hasSignature = tab === "draw" ? hasDrawSignature : hasTypeSignature;
  const fileLoaded = pageBytes !== null && pageCount !== null && pageCount > 0;

  // Clamp the page number if the document changes.
  useEffect(() => {
    if (pageCount && pageNum > pageCount) setPageNum(pageCount);
  }, [pageCount, pageNum]);

  // ── File handlers ──────────────────────────────────────────────────────────
  const onFiles = async (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      toast.error("Only PDF files are supported.");
      return;
    }
    setFiles([f]);
    // Clear any prior result.
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
    setStatus("idle");
    setStatusMsg("");
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await loadPdf(bytes);
      const n = doc.getPageCount();
      setPageCount(n);
      setPageBytes(bytes);
      setPageNum(n); // Default to the last page (typical signature placement).
    } catch (err) {
      console.error(err);
      setPageCount(null);
      setPageBytes(null);
      toast.error("Could not read this PDF.");
    }
  };

  const onRemove = () => {
    setFiles([]);
    setPageBytes(null);
    setPageCount(null);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
    setStatus("idle");
    setStatusMsg("");
  };

  // ── Signature editing handlers ────────────────────────────────────────────
  const clearSignature = () => {
    if (tab === "draw") setStrokes([]);
    else setTypedText("");
  };

  const undoStroke = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  // ── Build the signature PNG data URL on demand ────────────────────────────
  const getSignatureDataUrl = useCallback((): string | null => {
    if (tab === "draw") {
      if (!hasDrawSignature) return null;
      return drawSignatureToDataUrl(strokes, drawColor, drawWidth);
    }
    if (!hasTypeSignature) return null;
    return typeSignatureToDataUrl(typedText.trim(), fontCss);
  }, [
    tab,
    hasDrawSignature,
    hasTypeSignature,
    strokes,
    drawColor,
    drawWidth,
    typedText,
    fontCss,
  ]);

  // Live preview data URL for the small thumbnail (only Type tab needs it since
  // the Draw tab's canvas IS its own preview).
  const typePreviewDataUrl = useMemo(() => {
    if (tab !== "type") return null;
    if (!hasTypeSignature) return null;
    return typeSignatureToDataUrl(typedText.trim(), fontCss);
  }, [tab, hasTypeSignature, typedText, fontCss]);

  // ── Sign & download ────────────────────────────────────────────────────────
  const onProcess = async () => {
    if (!fileLoaded || !pageBytes || !pageCount) {
      toast.error("Load a PDF first.");
      return;
    }
    if (!hasSignature) {
      toast.error("Create a signature first.");
      return;
    }
    if (pageNum < 1 || pageNum > pageCount) {
      toast.error("Choose a valid page.");
      return;
    }

    const dataUrl = getSignatureDataUrl();
    if (!dataUrl) {
      toast.error("Could not render your signature.");
      return;
    }

    setStatus("processing");
    setStatusMsg("Embedding your signature…");
    try {
      const pngBytes = dataUrlToBytes(dataUrl);
      const doc = await loadPdf(pageBytes);
      const png = await doc.embedPng(pngBytes);

      // pdf-lib uses bottom-left origin. Compute width from the PNG's natural
      // pixel width × PT_PER_PX × user size, then preserve aspect.
      const sigW = png.width * PT_PER_PX * (sizePercent / 100);
      const sigH = sigW * (png.height / png.width);

      const pageIdx = pageNum - 1;
      const page = doc.getPages()[pageIdx];
      if (!page) throw new Error("Selected page not found.");
      const pageW = page.getWidth();
      const pageH = page.getHeight();
      const { x, y } = computePosition(position, pageW, pageH, sigW, sigH);

      // The pdf-lib `drawImage` argument type is structural — our embedded
      // image has the `.width` and `.height` getters it needs, so cast.
      page.drawImage(png as unknown as Parameters<typeof page.drawImage>[0], {
        x,
        y,
        width: sigW,
        height: sigH,
      });

      const outBytes = await savePdf(doc);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMsg(
        `Signature placed on page ${pageNum} of ${pageCount}.`,
      );
      useAppStore.getState().addRecent({
        name: RESULT_NAME,
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("PDF signed!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMsg(
        err instanceof Error
          ? err.message
          : "Could not sign this PDF.",
      );
      toast.error("Signing failed.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
    setStatus("idle");
    setStatusMsg("");
  };

  const onDownload = () => {
    if (!resultBlob) return;
    downloadBlob(resultBlob, RESULT_NAME);
  };

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <ToolShell
      tool={tool}
      status={status}
      statusMessage={statusMsg}
      onReset={onReset}
      resultUrl={resultUrl}
      resultName={RESULT_NAME}
      resultSize={resultSize}
      onDownload={onDownload}
    >
      {/* Step 1: pick PDF */}
      <FileDropzone
        accept="application/pdf"
        onFiles={onFiles}
        files={files}
        onRemove={onRemove}
        title="Drop a PDF to sign"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <p className="text-xs text-muted-foreground">
          Loaded {pageCount} page{pageCount === 1 ? "" : "s"}.
        </p>
      )}

      {/* Step 2: create signature */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Create your signature</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearSignature}
              disabled={!hasSignature}
              aria-label="Clear signature"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
            {tab === "draw" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={undoStroke}
                disabled={strokes.length === 0}
                aria-label="Undo last stroke"
              >
                <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                Undo
              </Button>
            )}
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "draw" | "type")}
        >
          <TabsList className="w-full max-w-[280px]">
            <TabsTrigger value="draw" className="flex-1">
              <PenLine className="h-3.5 w-3.5" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="type" className="flex-1">
              <TypeIcon className="h-3.5 w-3.5" />
              Type
            </TabsTrigger>
          </TabsList>

          {/* Draw tab */}
          <TabsContent value="draw" className="pt-4 space-y-4">
            <SignaturePad
              strokes={strokes}
              onStrokesChange={setStrokes}
              color={drawColor}
              width={drawWidth}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sign-color">Stroke color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="sign-color"
                    type="color"
                    value={drawColor}
                    onChange={(e) => setDrawColor(e.target.value)}
                    className="h-9 w-14 rounded-md border border-border bg-background p-1 cursor-pointer"
                    aria-label="Stroke color"
                  />
                  <Input
                    value={drawColor}
                    onChange={(e) => setDrawColor(e.target.value)}
                    className="w-32"
                    aria-label="Stroke color hex value"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sign-width">Stroke width</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {drawWidth.toFixed(1)}px
                  </span>
                </div>
                <Slider
                  id="sign-width"
                  min={1}
                  max={6}
                  step={0.5}
                  value={[drawWidth]}
                  onValueChange={(v) => setDrawWidth(v[0] ?? 2.5)}
                  aria-label="Stroke width"
                />
              </div>
            </div>
          </TabsContent>

          {/* Type tab */}
          <TabsContent value="type" className="pt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sign-text">Your name</Label>
              <Input
                id="sign-text"
                type="text"
                maxLength={30}
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="e.g. Jane Doe"
              />
              <p className="text-[11px] text-muted-foreground">
                {typedText.length}/30 characters
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Font style</Label>
              <Select
                value={fontKey}
                onValueChange={(v) => setFontKey(v as FontKey)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a font style" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Preview</Label>
              <div className="rounded-lg border border-border bg-white p-4 min-h-[96px] flex items-center">
                {hasTypeSignature && typePreviewDataUrl ? (
                  <img
                    src={typePreviewDataUrl}
                    alt="Signature preview"
                    className="max-h-20 w-auto max-w-full"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    Type your name to preview your signature.
                  </span>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Step 3: place signature */}
      {fileLoaded && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Place your signature</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sign-page">Page</Label>
              <Select
                value={String(pageNum)}
                onValueChange={(v) => setPageNum(parseInt(v, 10) || 1)}
              >
                <SelectTrigger id="sign-page" className="w-full">
                  <SelectValue placeholder="Pick a page" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: pageCount ?? 0 }, (_, i) => i + 1).map(
                    (n) => (
                      <SelectItem key={n} value={String(n)}>
                        Page {n}
                        {n === pageCount ? " (last)" : ""}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="sign-size">Signature size</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sizePercent}%
                </span>
              </div>
              <Slider
                id="sign-size"
                min={40}
                max={100}
                step={1}
                value={[sizePercent]}
                onValueChange={(v) => setSizePercent(v[0] ?? 80)}
                aria-label="Signature size"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Position on page</Label>
            <div className="grid grid-cols-5 gap-2 max-w-md">
              {POSITION_PRESETS.map((p) => (
                <PositionChip
                  key={p.value}
                  preset={p}
                  selected={position === p.value}
                  onClick={() => setPosition(p.value)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: action */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={
            !fileLoaded || !hasSignature || status === "processing"
          }
        >
          <FileSignature className="h-4 w-4 mr-1.5" />
          {status === "processing" ? "Signing…" : "Sign PDF"}
        </Button>
        {!hasSignature && (
          <span className="text-xs text-muted-foreground">
            <Pen className="inline h-3 w-3 mr-1 align-[-2px]" />
            Create your signature first to continue.
          </span>
        )}
      </div>
    </ToolShell>
  );
}

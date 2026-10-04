"use client";

import * as pdfjsLib from "pdfjs-dist";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Loader2,
  MousePointer2,
  Save,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { downloadBlob, uid } from "@/lib/format";
import {
  loadPdf,
  pdfBlob,
  rgb,
  savePdf,
  StandardFonts,
  type PDFFont,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

// Wire up the pdfjs worker at module-eval time (browser only) — matches the
// CDN pattern used in `src/lib/pdf/extract-text.ts` and `render-pages.ts`.
if (typeof window !== "undefined" && "GlobalWorkerOptions" in pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@" +
    pdfjsLib.version +
    "/build/pdf.worker.min.mjs";
}

type FontId = "Helvetica" | "HelveticaBold" | "TimesRoman" | "Courier";

const FONT_STANDARD_MAP: Record<FontId, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  HelveticaBold: StandardFonts.HelveticaBold,
  TimesRoman: StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
};

const FONT_LABEL: Record<FontId, string> = {
  Helvetica: "Helvetica",
  HelveticaBold: "Helvetica Bold",
  TimesRoman: "Times Roman",
  Courier: "Courier",
};

const FONT_OPTIONS: FontId[] = [
  "Helvetica",
  "HelveticaBold",
  "TimesRoman",
  "Courier",
];

type Mode = "pan" | "erase" | "text";

// Pending operations are stored in CANVAS PIXELS at the scale that was
// active when the op was created. Storing `scale` per op future-proofs
// against the user resizing the window (which would change the render
// scale and break static coordinates).
type EditOp =
  | {
      id: string;
      type: "erase";
      page: number;
      scale: number;
      cx1: number;
      cy1: number;
      cx2: number;
      cy2: number;
    }
  | {
      id: string;
      type: "text";
      page: number;
      scale: number;
      cx: number;
      cy: number;
      text: string;
      size: number;
      color: string;
      font: FontId;
    };

const MAX_CANVAS_WIDTH = 800; // px — keeps big pages from blowing up memory
const MAX_RENDER_SCALE = 1.5; // crisp enough for text without over-rendering
const DEFAULT_TEXT_COLOR = "#000000"; // looks like real text, not annotation
const DRAG_THRESHOLD_PX = 5; // < 5px movement = click, not drag
const TEXT_HIT_RADIUS_PX = 20; // click tolerance for deleting text markers

/** Parse a `#rrggbb` hex string into pdf-lib's normalized 0–1 RGB channels. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

/**
 * Hit-test a canvas point (in current canvas px) against an op. The op was
 * created at `op.scale`; we rescale its coordinates to the current render
 * scale before comparing. Erase ops use their bounding box; text ops use a
 * small square hit area centered on the click point.
 */
function pointInOp(
  pt: { x: number; y: number },
  op: EditOp,
  currentScale: number,
): boolean {
  const f = currentScale / op.scale;
  if (op.type === "erase") {
    const left = Math.min(op.cx1, op.cx2) * f;
    const right = Math.max(op.cx1, op.cx2) * f;
    const top = Math.min(op.cy1, op.cy2) * f;
    const bottom = Math.max(op.cy1, op.cy2) * f;
    return pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom;
  }
  const x = op.cx * f;
  const y = op.cy * f;
  return (
    Math.abs(pt.x - x) <= TEXT_HIT_RADIUS_PX &&
    Math.abs(pt.y - y) <= TEXT_HIT_RADIUS_PX
  );
}

export function EditPdfTool({ tool }: { tool: Tool }) {
  // ── Refs ────────────────────────────────────────────────────────────────
  const fileBytesRef = useRef<Uint8Array | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // ── State ───────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(MAX_RENDER_SCALE);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  const [mode, setMode] = useState<Mode>("pan");
  const [ops, setOps] = useState<EditOp[]>([]);
  const [dragRect, setDragRect] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Text editor state — used for the NEXT text op the user places.
  const [text, setText] = useState("");
  const [size, setSize] = useState(14);
  const [color, setColor] = useState(DEFAULT_TEXT_COLOR);
  const [font, setFont] = useState<FontId>("Helvetica");

  // Process / result state surfaced into ToolShell's StatusBanner.
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("edited.pdf");
  const [resultSize, setResultSize] = useState<number | undefined>();

  const opsForCurrentPage = ops.filter((o) => o.page === currentPage);
  const pageEdits = opsForCurrentPage.length;
  const totalEdits = ops.length;

  // ── Cleanup helpers ──────────────────────────────────────────────────────
  const cleanupPdf = useCallback(() => {
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // best-effort — the task may already be done
      }
      renderTaskRef.current = null;
    }
    const doc = pdfDocRef.current;
    if (doc) {
      doc.cleanup().catch(() => {
        // ignore — tearing down anyway
      });
      // `destroy()` lives on the loading task, not the doc itself.
      doc.loadingTask.destroy().catch(() => {
        // same
      });
      pdfDocRef.current = null;
    }
  }, []);

  const resetResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResultBlob(null);
    setResultUrl(null);
    setResultSize(undefined);
    setStatus("idle");
    setStatusMessage("");
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupPdf();
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = null;
      }
    };
  }, [cleanupPdf]);

  // ── Render the current page into the canvas ──────────────────────────────
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || pageCount === null) return;
    if (currentPage < 1 || currentPage > pageCount) return;

    let cancelled = false;
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;

    // Cancel any in-flight render before starting a new one — otherwise
    // pdfjs throws an "Cannot use the same canvas during multiple render()"
    // error and the new render never starts cleanly.
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // best-effort
      }
      renderTaskRef.current = null;
    }

    void (async () => {
      try {
        const page = await doc.getPage(currentPage);
        if (cancelled) {
          page.cleanup();
          return;
        }
        // Pick the largest scale that fits the page width into our cap,
        // without exceeding the crispness cap.
        const baseViewport = page.getViewport({ scale: 1 });
        const widthScale =
          baseViewport.width > 0
            ? MAX_CANVAS_WIDTH / baseViewport.width
            : MAX_RENDER_SCALE;
        const sc = Math.min(MAX_RENDER_SCALE, widthScale);
        const viewport = page.getViewport({ scale: sc });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // Paint a white background — transparent PDF regions would render
        // as black through the canvas otherwise.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;
        setScale(sc);
        setCanvasSize({ w: viewport.width, h: viewport.height });
        page.cleanup();
      } catch (err: unknown) {
        // pdfjs throws `RenderingCancelledException` when a newer render
        // supersedes this one — that's expected, not a real error.
        const name = (err as { name?: string } | null)?.name;
        if (name !== "RenderingCancelledException") {
          console.error(err);
          toast.error(`Could not render page ${currentPage}.`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPage, pageCount]);

  // ── File handling ────────────────────────────────────────────────────────
  const onFiles = async (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      toast.error("Only PDF files are supported.");
      return;
    }
    cleanupPdf();
    resetResult();
    setFiles([f]);
    setOps([]);
    setText("");
    setSize(14);
    setColor(DEFAULT_TEXT_COLOR);
    setFont("Helvetica");
    setMode("pan");
    setCurrentPage(1);
    setScale(MAX_RENDER_SCALE);
    setCanvasSize({ w: 0, h: 0 });

    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      fileBytesRef.current = bytes;
      // Clone the bytes — pdfjs can transfer (detach) the underlying buffer
      // in some worker setups, which would corrupt the caller's copy.
      const loadingTask = pdfjsLib.getDocument({
        data: bytes.slice(),
        disableAutoFetch: true,
        disableStream: true,
      });
      const doc = await loadingTask.promise;
      pdfDocRef.current = doc;
      setPageCount(doc.numPages);
      setCurrentPage(1);
      toast.success(
        `Loaded ${doc.numPages} page${doc.numPages === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      console.error(err);
      fileBytesRef.current = null;
      toast.error("Could not read this PDF.");
    }
  };

  const onRemove = () => {
    cleanupPdf();
    resetResult();
    fileBytesRef.current = null;
    setFiles([]);
    setPageCount(null);
    setCurrentPage(1);
    setOps([]);
    setText("");
    setMode("pan");
    setScale(MAX_RENDER_SCALE);
    setCanvasSize({ w: 0, h: 0 });
  };

  // ── Canvas pointer helpers ───────────────────────────────────────────────
  const getCanvasPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Convert CSS px → internal canvas px so coordinates match the render
    // resolution (the canvas may be displayed at a different size than its
    // internal pixel buffer on small screens).
    const x =
      rect.width > 0
        ? ((e.clientX - rect.left) / rect.width) * canvas.width
        : 0;
    const y =
      rect.height > 0
        ? ((e.clientY - rect.top) / rect.height) * canvas.height
        : 0;
    return { x, y };
  };

  const deleteOpWithConfirm = (op: EditOp) => {
    if (op.type === "erase") {
      if (window.confirm("Delete this erase rectangle?")) {
        setOps((prev) => prev.filter((o) => o.id !== op.id));
      }
    } else {
      setOps((prev) => prev.filter((o) => o.id !== op.id));
    }
  };

  // ── Canvas pointer handlers ─────────────────────────────────────────────
  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (mode === "pan") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mode === "erase") {
      const pt = getCanvasPoint(e);
      dragStartRef.current = pt;
      setIsDragging(true);
      setDragRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      try {
        // Capture so dragging outside the canvas still tracks — important
        // when the user drags past the page edge to white out a region.
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // best-effort — some browsers throw on duplicate captures
      }
    }
    // text mode: no drag, just wait for pointerup
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (mode !== "erase" || !isDragging || !dragStartRef.current) return;
    const pt = getCanvasPoint(e);
    setDragRect({
      x1: dragStartRef.current.x,
      y1: dragStartRef.current.y,
      x2: pt.x,
      y2: pt.y,
    });
  };

  const onCanvasPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
    const pt = getCanvasPoint(e);
    const start = dragStartRef.current;
    dragStartRef.current = null;

    if (mode === "erase") {
      const wasDrag =
        start &&
        (Math.abs(pt.x - start.x) > DRAG_THRESHOLD_PX ||
          Math.abs(pt.y - start.y) > DRAG_THRESHOLD_PX);
      if (wasDrag && start) {
        const op: EditOp = {
          id: uid(),
          type: "erase",
          page: currentPage,
          scale,
          cx1: start.x,
          cy1: start.y,
          cx2: pt.x,
          cy2: pt.y,
        };
        setOps((prev) => [...prev, op]);
      } else {
        // Click (not drag): hit-test existing overlays on this page.
        const hit = ops.find(
          (o) => o.page === currentPage && pointInOp(pt, o, scale),
        );
        if (hit) deleteOpWithConfirm(hit);
      }
      setIsDragging(false);
      setDragRect(null);
      return;
    }

    if (mode === "text") {
      // Clicking on an existing overlay deletes it (per spec) — check
      // this BEFORE placing new text so the user can recover from a
      // misfired click.
      const hit = ops.find(
        (o) => o.page === currentPage && pointInOp(pt, o, scale),
      );
      if (hit) {
        deleteOpWithConfirm(hit);
        return;
      }
      if (!text.trim()) {
        toast.warning("Type your text first");
        return;
      }
      const op: EditOp = {
        id: uid(),
        type: "text",
        page: currentPage,
        scale,
        cx: pt.x,
        cy: pt.y,
        text,
        size,
        color,
        font,
      };
      setOps((prev) => [...prev, op]);
      toast.success("Text added — keep editing or Save.");
    }
  };

  // ── Undo / clear ────────────────────────────────────────────────────────
  const undoLastEdit = () => {
    // Most recently added op on the current page (iterate from the end).
    const last = [...ops].reverse().find((o) => o.page === currentPage);
    if (!last) {
      toast.error("No edits on this page to undo.");
      return;
    }
    setOps((prev) => prev.filter((o) => o.id !== last.id));
  };

  const clearPageEdits = () => {
    if (pageEdits === 0) return;
    if (
      !window.confirm(
        `Clear all ${pageEdits} edit${pageEdits === 1 ? "" : "s"} on this page?`,
      )
    )
      return;
    setOps((prev) => prev.filter((o) => o.page !== currentPage));
  };

  // ── Save (apply edits via pdf-lib) ───────────────────────────────────────
  const onSave = async () => {
    const bytes = fileBytesRef.current;
    if (!bytes) {
      toast.error("Add a PDF first.");
      return;
    }
    if (ops.length === 0) {
      toast.error("Add at least one edit before saving.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Applying edits…");
    try {
      // Reload from the ORIGINAL bytes every time — repeated saves don't
      // stack on top of each other.
      const doc = await loadPdf(bytes);
      const neededFonts = new Set<FontId>();
      for (const op of ops) {
        if (op.type === "text") neededFonts.add(op.font);
      }
      const fonts: Partial<Record<FontId, PDFFont>> = {};
      for (const fid of neededFonts) {
        fonts[fid] = await doc.embedFont(FONT_STANDARD_MAP[fid]);
      }
      const pages = doc.getPages();

      for (const op of ops) {
        const pdfPage = pages[op.page - 1];
        if (!pdfPage) continue;
        const { height: pageH } = pdfPage.getSize();
        const s = op.scale;
        // Canvas height (in canvas px) at the scale this op was created.
        const canvasH = pageH * s;

        if (op.type === "erase") {
          // Coordinates are stored as canvas px at scale `s`. Convert to
          // PDF points by dividing by `s`. Y-axis is flipped (PDF origin
          // is bottom-left, canvas origin is top-left).
          const left = Math.min(op.cx1, op.cx2);
          const right = Math.max(op.cx1, op.cx2);
          const top = Math.min(op.cy1, op.cy2);
          const bottom = Math.max(op.cy1, op.cy2);
          pdfPage.drawRectangle({
            x: left / s,
            y: (canvasH - bottom) / s, // bottom-left Y in PDF space
            width: (right - left) / s,
            height: (bottom - top) / s,
            color: rgb(1, 1, 1), // pure white — the "white-out" overlay
          });
        } else {
          const fontInst = fonts[op.font];
          if (!fontInst) continue;
          // Click point = top of the text. Offset the baseline down by
          // ~0.75 * size so the cap-height sits at the click.
          const pdfX = op.cx / s;
          const pdfY = (canvasH - op.cy) / s - op.size * 0.75;
          const { r, g, b } = hexToRgb(op.color);
          const colorVal = rgb(r, g, b);
          const lines = op.text.split(/\r?\n/);
          const lineH = op.size * 1.2;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            pdfPage.drawText(line, {
              x: pdfX,
              y: pdfY - i * lineH, // each subsequent line drops by lineH
              size: op.size,
              font: fontInst,
              color: colorVal,
            });
          }
        }
      }

      const outBytes = await savePdf(doc);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = url;
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(
        `Applied ${ops.length} edit${ops.length === 1 ? "" : "s"} to the PDF.`,
      );
      useAppStore.getState().addRecent({
        name: "edited.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Edits applied — ready to download");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not edit this PDF.");
      toast.error("Edit failed.");
    }
  };

  const onDownload = () => {
    if (!resultBlob) return;
    downloadBlob(resultBlob, resultName);
  };

  // ── Derived values for overlays ─────────────────────────────────────────
  const eraseOverlay = (op: Extract<EditOp, { type: "erase" }>) => {
    // Rescale op coords from op.scale → current render scale (rarely
    // different, but handles window resize gracefully).
    const f = scale / op.scale;
    const left = Math.min(op.cx1, op.cx2) * f;
    const top = Math.min(op.cy1, op.cy2) * f;
    const right = Math.max(op.cx1, op.cx2) * f;
    const bottom = Math.max(op.cy1, op.cy2) * f;
    return { left, top, width: right - left, height: bottom - top };
  };

  const textOverlay = (op: Extract<EditOp, { type: "text" }>) => {
    const f = scale / op.scale;
    return { left: op.cx * f, top: op.cy * f };
  };

  const dragPreview = dragRect
    ? {
        left: Math.min(dragRect.x1, dragRect.x2),
        top: Math.min(dragRect.y1, dragRect.y2),
        width: Math.abs(dragRect.x2 - dragRect.x1),
        height: Math.abs(dragRect.y2 - dragRect.y1),
      }
    : null;

  const pageW = canvasSize.w;
  const pageH = canvasSize.h;
  const hasCanvas = pageW > 0 && pageH > 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ToolShell
      tool={tool}
      status={status}
      statusMessage={statusMessage}
      onReset={onRemove}
      resultUrl={resultUrl}
      resultName={resultName}
      resultSize={resultSize}
      onDownload={onDownload}
    >
      <FileDropzone
        accept="application/pdf"
        onFiles={onFiles}
        files={files}
        onRemove={() => onRemove()}
        title="Drop a PDF to edit"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <div className="space-y-4">
          {/* Mode toolbar + pending ops counter */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-border bg-background p-0.5"
              role="group"
              aria-label="Edit mode"
            >
              <ModeButton
                active={mode === "pan"}
                onClick={() => setMode("pan")}
                icon={<MousePointer2 className="h-4 w-4" />}
                label="Move"
              />
              <ModeButton
                active={mode === "erase"}
                onClick={() => setMode("erase")}
                icon={<Eraser className="h-4 w-4" />}
                label="Erase"
              />
              <ModeButton
                active={mode === "text"}
                onClick={() => setMode("text")}
                icon={<Type className="h-4 w-4" />}
                label="Add Text"
              />
            </div>
            <span className="text-xs text-muted-foreground ml-1 tabular-nums">
              {pageEdits} edit{pageEdits === 1 ? "" : "s"} on this page ·{" "}
              {totalEdits} total
            </span>
          </div>

          {/* Page navigation */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-sm font-medium tabular-nums">
              Page {currentPage} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() =>
                setCurrentPage((p) => Math.min(pageCount ?? p, p + 1))
              }
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="w-40 shrink-0">
              <Select
                value={String(currentPage)}
                onValueChange={(v) => setCurrentPage(parseInt(v, 10))}
              >
                <SelectTrigger className="w-full" aria-label="Jump to page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                    (p) => (
                      <SelectItem key={p} value={String(p)}>
                        Page {p}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Page viewer */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3 overflow-x-auto">
            <div
              className="relative mx-auto"
              style={{
                width: hasCanvas ? `${pageW}px` : "100%",
                maxWidth: "100%",
              }}
            >
              <canvas
                ref={canvasRef}
                className="block w-full h-auto touch-none select-none"
                style={{
                  cursor:
                    mode === "erase"
                      ? "crosshair"
                      : mode === "text"
                        ? "text"
                        : "default",
                }}
                role="img"
                aria-label={`PDF page ${currentPage} of ${pageCount}. Mode: ${mode}. ${
                  mode === "erase"
                    ? "Drag to white out text. Click an overlay to delete it."
                    : mode === "text"
                      ? "Click to add text at the cursor. Click an overlay to delete it."
                      : "Read mode — switch to Erase or Add Text to make changes."
                }`}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
              />
              {/* Pending erase + text overlays (pointer-events:none so the
                  canvas handles all clicks; we hit-test in onPointerUp). */}
              {hasCanvas &&
                opsForCurrentPage.map((op) => {
                  if (op.type === "erase") {
                    const r = eraseOverlay(op);
                    return (
                      <div
                        key={op.id}
                        className="absolute pointer-events-none border-2 border-yellow-400 bg-white/85"
                        style={{
                          left: `${(r.left / pageW) * 100}%`,
                          top: `${(r.top / pageH) * 100}%`,
                          width: `${(r.width / pageW) * 100}%`,
                          height: `${(r.height / pageH) * 100}%`,
                        }}
                        aria-label="Pending erase rectangle"
                      />
                    );
                  }
                  const t = textOverlay(op);
                  return (
                    <div
                      key={op.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${(t.left / pageW) * 100}%`,
                        top: `${(t.top / pageH) * 100}%`,
                      }}
                      aria-label="Pending text annotation"
                    >
                      <div className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-600 -translate-x-1/2 -translate-y-1/2 shadow-sm" />
                      <div className="mt-1 max-w-32 truncate text-[10px] bg-yellow-50 border border-yellow-300 rounded px-1 py-0.5 text-yellow-900">
                        {op.text.slice(0, 20)}
                        {op.text.length > 20 ? "…" : ""}
                      </div>
                    </div>
                  );
                })}
              {/* Live drag preview (erase mode only) */}
              {dragPreview && hasCanvas && (
                <div
                  className="absolute pointer-events-none border-2 border-dashed border-yellow-500 bg-yellow-200/40"
                  style={{
                    left: `${(dragPreview.left / pageW) * 100}%`,
                    top: `${(dragPreview.top / pageH) * 100}%`,
                    width: `${(dragPreview.width / pageW) * 100}%`,
                    height: `${(dragPreview.height / pageH) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>

          {/* Mode-specific controls */}
          {mode === "pan" && (
            <div className="rounded-lg border border-border bg-background p-4 text-sm space-y-2">
              <p className="font-medium">Read mode</p>
              <p className="text-xs text-muted-foreground">
                Pan and inspect the page without making changes. Switch to{" "}
                <span className="font-medium text-foreground">Erase</span> to
                white-out text or{" "}
                <span className="font-medium text-foreground">Add Text</span>{" "}
                to type new text in place.
              </p>
              <p className="text-xs text-muted-foreground">
                Tip: clicking on an existing overlay deletes that edit.
              </p>
            </div>
          )}

          {mode === "erase" && (
            <div className="rounded-lg border border-border bg-background p-4 space-y-3">
              <p className="text-sm font-medium">Erase mode</p>
              <p className="text-xs text-muted-foreground">
                Drag on the page to white-out text. Click an existing
                rectangle to delete it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={undoLastEdit}
                  disabled={pageEdits === 0}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Undo last edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearPageEdits}
                  disabled={pageEdits === 0}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear all edits on this page
                </Button>
              </div>
            </div>
          )}

          {mode === "text" && (
            <div className="rounded-lg border border-border bg-background p-4 space-y-4">
              <p className="text-sm font-medium">Add Text mode</p>
              <div className="space-y-1.5">
                <Label htmlFor="ann-text">New text</Label>
                <Textarea
                  id="ann-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type the text you want to place on the page…"
                  rows={3}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ann-font">Font family</Label>
                  <Select
                    value={font}
                    onValueChange={(v) => setFont(v as FontId)}
                  >
                    <SelectTrigger id="ann-font" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FONT_LABEL[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ann-size">Font size</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {size}pt
                    </span>
                  </div>
                  <Slider
                    id="ann-size"
                    min={8}
                    max={72}
                    step={1}
                    value={[size]}
                    onValueChange={(v) => setSize(v[0] ?? 14)}
                    aria-label="Font size"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-color">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="ann-color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-14 rounded-md border border-border bg-background p-1 cursor-pointer"
                    aria-label="Text color"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-32"
                    aria-label="Text color hex value"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Click on the page where you want the{" "}
                <span className="font-medium text-foreground">top</span> of the
                text to appear. The current text, font, size and color will be
                used.
              </p>
            </div>
          )}

          {/* Honesty note */}
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
            <p>
              <strong className="font-semibold">
                How editing works here:
              </strong>{" "}
              YellowPDF overlays a white rectangle on text you erase and writes
              new text where you click. It does not modify the original text
              streams of the PDF (true inline text-stream editing is very
              limited in any free browser tool). The result looks and prints
              correctly — perfect for fixing typos, redacting sensitive info,
              or filling blanks.
            </p>
          </div>

          {/* Save button */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onSave}
              disabled={totalEdits === 0 || status === "processing"}
            >
              {status === "processing" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              {status === "processing" ? "Applying edits…" : "Save Edited PDF"}
            </Button>
            {totalEdits === 0 && (
              <p className="text-xs text-muted-foreground">
                Add at least one edit to enable saving.
              </p>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors bg-primary text-primary-foreground"
          : "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
      }
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

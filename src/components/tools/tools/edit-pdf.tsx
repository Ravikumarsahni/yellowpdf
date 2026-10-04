"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { PenLine, Plus, Trash2 } from "lucide-react";
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
  degrees,
  loadPdf,
  pdfBlob,
  rgb,
  savePdf,
  StandardFonts,
  type PDFFont,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

type FontId = "Helvetica" | "HelveticaBold" | "TimesRoman" | "Courier";

interface Annotation {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  font: FontId;
  page: number;
}

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

const PRESETS = ["tl", "tr", "c", "bl", "br"] as const;
type Preset = (typeof PRESETS)[number];

const PRESET_LABEL: Record<Preset, string> = {
  tl: "Top-left",
  tr: "Top-right",
  c: "Center",
  bl: "Bottom-left",
  br: "Bottom-right",
};

const MARGIN = 24;
const DEFAULT_COLOR = "#eab308"; // brand yellow

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16) / 255,
    g: parseInt(v.slice(2, 4), 16) / 255,
    b: parseInt(v.slice(4, 6), 16) / 255,
  };
}

export function EditPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageSizes, setPageSizes] = useState<
    { width: number; height: number }[]
  >([]);
  const [selectedPage, setSelectedPage] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Annotation editor state.
  const [text, setText] = useState("");
  const [size, setSize] = useState(14);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [font, setFont] = useState<FontId>("Helvetica");
  const [x, setX] = useState(72);
  const [y, setY] = useState(72);

  // Status / result.
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("edited.pdf");
  const [resultSize, setResultSize] = useState<number | undefined>();

  // Keep original bytes for save-time reload, plus a preview-doc font cache
  // for measuring text widths when applying preset positions.
  const fileBytesRef = useRef<Uint8Array | null>(null);
  const previewFontsRef = useRef<Partial<Record<FontId, PDFFont>> | null>(
    null,
  );

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
      setResultSize(undefined);
    }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      fileBytesRef.current = bytes;
      const doc = await loadPdf(bytes);
      const pages = doc.getPages();
      const sizes = pages.map((p) => p.getSize());
      setPageCount(pages.length);
      setPageSizes(sizes);
      setSelectedPage(1);
      setAnnotations([]);
      // Embed standard fonts once for preset width measurements.
      const fonts: Partial<Record<FontId, PDFFont>> = {};
      fonts.Helvetica = await doc.embedFont(StandardFonts.Helvetica);
      fonts.HelveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
      fonts.TimesRoman = await doc.embedFont(StandardFonts.TimesRoman);
      fonts.Courier = await doc.embedFont(StandardFonts.Courier);
      previewFontsRef.current = fonts;
      // Default the cursor to top-left of page 1.
      if (sizes[0]) {
        setX(MARGIN);
        setY(Math.round(sizes[0].height - size - MARGIN));
      }
      toast.success(`Loaded ${pages.length} page${pages.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      setPageCount(null);
      setPageSizes([]);
      fileBytesRef.current = null;
      previewFontsRef.current = null;
      toast.error("Could not read this PDF.");
    }
  };

  const onRemove = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
    setPageCount(null);
    setPageSizes([]);
    setSelectedPage(1);
    setAnnotations([]);
    setStatus("idle");
    setStatusMessage("");
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
    setText("");
    setSize(14);
    setColor(DEFAULT_COLOR);
    setFont("Helvetica");
    setX(72);
    setY(72);
    fileBytesRef.current = null;
    previewFontsRef.current = null;
  };

  const applyPreset = (preset: Preset) => {
    const page = pageSizes[selectedPage - 1];
    if (!page) return;
    const fontInst = previewFontsRef.current?.[font];
    const textWidth =
      text && fontInst ? fontInst.widthOfTextAtSize(text, size) : 0;
    let nx = x;
    let ny = y;
    switch (preset) {
      case "tl":
        nx = MARGIN;
        ny = page.height - size - MARGIN;
        break;
      case "tr":
        nx = page.width - textWidth - MARGIN;
        ny = page.height - size - MARGIN;
        break;
      case "c":
        nx = (page.width - textWidth) / 2;
        ny = (page.height - size) / 2;
        break;
      case "bl":
        nx = MARGIN;
        ny = MARGIN;
        break;
      case "br":
        nx = page.width - textWidth - MARGIN;
        ny = MARGIN;
        break;
    }
    setX(Math.max(0, Math.round(nx)));
    setY(Math.max(0, Math.round(ny)));
  };

  const addAnnotation = () => {
    if (!pageCount) {
      toast.error("Upload a PDF first.");
      return;
    }
    if (!text.trim()) {
      toast.error("Annotation text cannot be empty.");
      return;
    }
    const ann: Annotation = {
      id: uid(),
      text,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      size,
      color,
      font,
      page: Math.min(Math.max(selectedPage, 1), pageCount),
    };
    setAnnotations((prev) => [...prev, ann]);
    setText("");
    toast.success(`Annotation queued for page ${ann.page}.`);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const onProcess = async () => {
    const bytes = fileBytesRef.current;
    if (!bytes) {
      toast.error("Add a PDF first.");
      return;
    }
    if (annotations.length === 0) {
      toast.error("Add at least one annotation first.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Drawing annotations…");
    try {
      // Reload from the original bytes so repeated saves don't accumulate.
      const doc = await loadPdf(bytes);
      const neededFonts = new Set(annotations.map((a) => a.font));
      const fonts: Partial<Record<FontId, PDFFont>> = {};
      for (const f of neededFonts) {
        fonts[f] = await doc.embedFont(FONT_STANDARD_MAP[f]);
      }
      const pages = doc.getPages();
      for (const ann of annotations) {
        const page = pages[ann.page - 1];
        if (!page) continue;
        const fontInst = fonts[ann.font];
        if (!fontInst) continue;
        const { r, g, b } = hexToRgb(ann.color);
        const colorVal = rgb(r, g, b);
        // Multi-line: draw each line, descending by the line height.
        const lines = ann.text.split(/\r?\n/);
        const lineH = ann.size * 1.2;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          page.drawText(line, {
            x: ann.x,
            y: ann.y - i * lineH,
            size: ann.size,
            font: fontInst,
            color: colorVal,
            rotate: degrees(0),
          });
        }
      }

      const outBytes = await savePdf(doc);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(
        `Applied ${annotations.length} annotation${annotations.length === 1 ? "" : "s"} to the PDF.`,
      );
      useAppStore.getState().addRecent({
        name: "edited.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("PDF edited!");
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

  const page = pageSizes[selectedPage - 1];

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
        onRemove={onRemove}
        title="Drop a PDF to edit"
        hint="Single PDF file"
      />

      {/* Honest limitation note — yellow info box */}
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
        <strong className="font-semibold">Heads up:</strong> This tool adds
        new text on top of existing pages. To edit existing text in a PDF, use
        the AI Chat or AI Summarize tools to extract and work with the text.
      </div>

      {pageCount !== null && (
        <div className="space-y-5">
          {/* Step 2: choose page */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-page">Page to annotate</Label>
            <Select
              value={String(selectedPage)}
              onValueChange={(v) => setSelectedPage(parseInt(v, 10))}
            >
              <SelectTrigger id="edit-page" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                  (p) => (
                    <SelectItem key={p} value={String(p)}>
                      Page {p}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            {page && (
              <p className="text-xs text-muted-foreground">
                Page {selectedPage} size: {Math.round(page.width)} ×{" "}
                {Math.round(page.height)} pt
              </p>
            )}
          </div>

          {/* Step 3: annotation editor */}
          <div className="rounded-xl border border-border bg-background p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-text">Annotation text</Label>
              <Textarea
                id="ann-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type the text you want to add…"
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ann-size">Font size</Label>
                  <span className="text-xs text-muted-foreground">
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
                  aria-label="Annotation color"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-32"
                  aria-label="Annotation color hex value"
                />
              </div>
            </div>

            {/* Position */}
            <div className="space-y-2">
              <Label>Position (PDF points)</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label htmlFor="ann-x" className="sr-only">
                    X coordinate
                  </Label>
                  <Input
                    id="ann-x"
                    type="number"
                    min={0}
                    value={Number.isFinite(x) ? x : 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setX(Number.isFinite(v) ? v : 0);
                    }}
                    placeholder="X (pt)"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="ann-y" className="sr-only">
                    Y coordinate
                  </Label>
                  <Input
                    id="ann-y"
                    type="number"
                    min={0}
                    value={Number.isFinite(y) ? y : 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setY(Number.isFinite(v) ? v : 0);
                    }}
                    placeholder="Y (pt)"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(preset)}
                  >
                    {PRESET_LABEL[preset]}
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={addAnnotation} disabled={!text.trim()}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add annotation to page {selectedPage}
            </Button>
          </div>

          {/* Annotation list */}
          {annotations.length > 0 && (
            <div className="space-y-2">
              <Label>Annotations ({annotations.length})</Label>
              <ul className="max-h-96 overflow-y-auto space-y-2 pr-1">
                {annotations.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
                  >
                    <div
                      className="h-4 w-4 shrink-0 rounded-md border border-border"
                      style={{ backgroundColor: a.color }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {a.text || "(empty)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Page {a.page} · {a.size}pt · {FONT_LABEL[a.font]} · (
                        {a.x}, {a.y})
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeAnnotation(a.id)}
                      aria-label={`Remove annotation: ${a.text}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Step 4: apply & download */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onProcess}
              disabled={annotations.length === 0 || status === "processing"}
            >
              <PenLine className="h-4 w-4 mr-1.5" />
              Save edited PDF
            </Button>
            {annotations.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add at least one annotation to enable saving.
              </p>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}

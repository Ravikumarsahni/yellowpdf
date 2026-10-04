"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileJson, Wand2 } from "lucide-react";
import { ToolShell } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPdf,
  savePdf,
  pdfBlob,
  PAGE_SIZES,
  StandardFonts,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from "@/lib/pdf/client-pdf";
import { downloadBlob, formatBytes } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { Tool } from "@/lib/tools";

type PageSize = "A4" | "Letter";

const OUTPUT_NAME = "json.pdf";

const HEADER_FILL = rgb(0.95, 0.83, 0.32);
const HEADER_TEXT = rgb(0.12, 0.1, 0.05);
const ROW_ALT = rgb(0.98, 0.97, 0.9);
const KEY_COLOR = rgb(0.1, 0.2, 0.4);
const TEXT_COLOR = rgb(0.13, 0.13, 0.13);
const MONO_COLOR = rgb(0.05, 0.05, 0.25);
const TITLE_COLOR = rgb(0.05, 0.05, 0.2);

interface Layout {
  doc: PDFDocument;
  page: PDFPage;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  usableWidth: number;
  y: number;
  helv: PDFFont;
  helvBold: PDFFont;
  helvOblique: PDFFont;
  courier: PDFFont;
  newPage(): void;
  ensureSpace(h: number): void;
  drawText(
    line: string,
    opts: { x: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb> },
  ): void;
}

/** Word-aware wrap to fit `maxChars` per line. */
function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      if (w.length > maxChars) {
        for (let i = 0; i < w.length; i += maxChars) {
          lines.push(w.slice(i, i + maxChars));
        }
      } else {
        cur = w;
      }
      continue;
    }
    if (cur.length + 1 + w.length <= maxChars) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function isPrimitive(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

type JsonShape =
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "kv"; pairs: { key: string; value: string }[] }
  | { kind: "list"; items: string[] }
  | { kind: "raw" };

function classifyJson(value: unknown): JsonShape {
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "list", items: ["(empty array)"] };
    const allObjects = value.every(
      (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    );
    if (allObjects) {
      const headerSet: string[] = [];
      for (const obj of value as Record<string, unknown>[]) {
        for (const k of Object.keys(obj)) {
          if (!headerSet.includes(k)) headerSet.push(k);
        }
      }
      const rows = (value as Record<string, unknown>[]).map((obj) =>
        headerSet.map((h) => formatScalar(obj[h])),
      );
      return { kind: "table", headers: headerSet, rows };
    }
    return { kind: "list", items: value.map((v) => formatScalar(v)) };
  }
  if (value !== null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length === 0) {
      return { kind: "kv", pairs: [{ key: "(empty object)", value: "" }] };
    }
    if (keys.every((k) => isPrimitive(rec[k]))) {
      return {
        kind: "kv",
        pairs: keys.map((k) => ({ key: k, value: formatScalar(rec[k]) })),
      };
    }
    return { kind: "raw" };
  }
  return { kind: "list", items: [formatScalar(value)] };
}

function renderTable(layout: Layout, headers: string[], rows: string[][]) {
  if (headers.length === 0) return;
  const colW = layout.usableWidth / headers.length;
  const headerSize = 11;
  const cellSize = 10;
  const cellLH = cellSize * 1.3;
  const headerH = headerSize * 1.6;

  const wrapCell = (text: string): string[] => {
    const cw = layout.helv.widthOfTextAtSize("M", cellSize);
    const maxChars = Math.max(6, Math.floor((colW - 8) / cw));
    return wrapText(text, maxChars);
  };

  // Header row
  layout.ensureSpace(headerH);
  layout.page.drawRectangle({
    x: layout.margin,
    y: layout.y - headerH,
    width: layout.usableWidth,
    height: headerH,
    color: HEADER_FILL,
    borderWidth: 0,
  });
  for (let i = 0; i < headers.length; i++) {
    const headerLines = wrapText(
      headers[i] ?? "",
      Math.max(4, Math.floor((colW - 8) / layout.helvBold.widthOfTextAtSize("M", headerSize))),
    );
    layout.page.drawText(headerLines[0] ?? "", {
      x: layout.margin + i * colW + 4,
      y: layout.y - headerSize - 4,
      size: headerSize,
      font: layout.helvBold,
      color: HEADER_TEXT,
    });
  }
  layout.y -= headerH;

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const wrapped = row.map(wrapCell);
    const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
    const rowH = Math.max(cellLH, maxLines * cellLH + 6);
    layout.ensureSpace(rowH);
    if (r % 2 === 1) {
      layout.page.drawRectangle({
        x: layout.margin,
        y: layout.y - rowH,
        width: layout.usableWidth,
        height: rowH,
        color: ROW_ALT,
        borderWidth: 0,
      });
    }
    const topY = layout.y;
    for (let c = 0; c < headers.length; c++) {
      const cellLines = wrapped[c] ?? [];
      let cy = topY - cellSize - 2;
      for (const line of cellLines.slice(0, maxLines)) {
        layout.page.drawText(line, {
          x: layout.margin + c * colW + 4,
          y: cy,
          size: cellSize,
          font: layout.helv,
          color: TEXT_COLOR,
        });
        cy -= cellLH;
      }
    }
    layout.y = topY - rowH;
  }
}

function renderKv(
  layout: Layout,
  pairs: { key: string; value: string }[],
) {
  const bodySize = 11;
  const lineH = bodySize * 1.4;
  const keyIndent = 160;
  for (const { key, value } of pairs) {
    const lines = wrapText(value, 60);
    const blockH = Math.max(lineH, lines.length * lineH + 4);
    layout.ensureSpace(blockH);
    layout.page.drawText(key + ":", {
      x: layout.margin,
      y: layout.y - bodySize,
      size: bodySize,
      font: layout.helvOblique,
      color: KEY_COLOR,
    });
    let ly = layout.y - bodySize;
    for (const line of lines) {
      layout.page.drawText(line, {
        x: layout.margin + keyIndent,
        y: ly,
        size: bodySize,
        font: layout.helv,
        color: TEXT_COLOR,
      });
      ly -= lineH;
    }
    layout.y = Math.min(layout.y - bodySize, ly) - 4;
  }
}

function renderList(layout: Layout, items: string[]) {
  const bodySize = 11;
  const lineH = bodySize * 1.4;
  const cw = layout.helv.widthOfTextAtSize("M", bodySize);
  const maxChars = Math.max(20, Math.floor((layout.usableWidth - 20) / cw));
  for (const item of items) {
    const lines = wrapText(item, maxChars);
    const blockH = lines.length * lineH + 4;
    layout.ensureSpace(blockH);
    let ly = layout.y - bodySize;
    for (let i = 0; i < lines.length; i++) {
      const prefix = i === 0 ? "•  " : "   ";
      layout.page.drawText(prefix + lines[i], {
        x: layout.margin,
        y: ly,
        size: bodySize,
        font: layout.helv,
        color: TEXT_COLOR,
      });
      ly -= lineH;
    }
    layout.y = ly - 4;
  }
}

function renderRaw(layout: Layout, pretty: string) {
  const bodySize = 9.5;
  const lineH = bodySize * 1.3;
  const cw = layout.courier.widthOfTextAtSize("M", bodySize);
  const maxChars = Math.max(20, Math.floor(layout.usableWidth / cw));
  for (const rawLine of pretty.split("\n")) {
    const wrapped = wrapText(rawLine, maxChars);
    for (const w of wrapped) {
      layout.ensureSpace(lineH);
      layout.page.drawText(w, {
        x: layout.margin,
        y: layout.y - bodySize,
        size: bodySize,
        font: layout.courier,
        color: MONO_COLOR,
      });
      layout.y -= lineH;
    }
  }
}

export function JsonToPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState<string>("JSON Report");
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [includeRaw, setIncludeRaw] = useState<boolean>(false);
  const [status, setStatus] = useState<
    "idle" | "processing" | "done" | "error"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number>(0);

  function handleFiles(newFiles: File[]) {
    const jsons = newFiles.filter(
      (f) => f.type === "application/json" || /\.json$/i.test(f.name),
    );
    if (jsons.length !== newFiles.length) {
      toast.warning("Some files were skipped (not JSON).");
    }
    setFiles(jsons.slice(0, 1));
    if (status === "done" || status === "error") reset();
  }

  function reset() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultSize(0);
    setStatus("idle");
    setStatusMsg("");
  }

  function fullReset() {
    reset();
    setFiles([]);
  }

  async function convert() {
    const file = files[0];
    if (!file) {
      toast.error("Please select a JSON file.");
      return;
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setStatus("processing");
    setStatusMsg("Parsing JSON…");
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error(
          "Invalid JSON: " +
            (e instanceof Error ? e.message : "parse error"),
        );
      }
      const shape = classifyJson(parsed);
      const doc = await createPdf();

      const [helv, helvOblique, helvBold, courier] = await Promise.all([
        doc.embedFont(StandardFonts.Helvetica),
        doc.embedFont(StandardFonts.HelveticaOblique),
        doc.embedFont(StandardFonts.HelveticaBold),
        doc.embedFont(StandardFonts.Courier),
      ]);

      const base = PAGE_SIZES[pageSize];
      const margin = 50;
      const usableWidth = base.width - margin * 2;

      const layout: Layout = {
        doc,
        page: doc.addPage([base.width, base.height]),
        pageWidth: base.width,
        pageHeight: base.height,
        margin,
        usableWidth,
        y: base.height - margin,
        helv,
        helvBold,
        helvOblique,
        courier,
        newPage() {
          this.page = doc.addPage([base.width, base.height]);
          this.y = base.height - margin;
        },
        ensureSpace(h: number) {
          if (this.y - h < margin) this.newPage();
        },
        drawText(line, opts) {
          this.page.drawText(line, {
            x: opts.x,
            y: this.y - opts.size,
            size: opts.size,
            font: opts.font,
            color: opts.color ?? TEXT_COLOR,
          });
          this.y -= opts.size * 1.4;
        },
      };

      // Title block
      layout.ensureSpace(40);
      layout.drawText(title, {
        x: margin,
        size: 22,
        font: helvBold,
        color: TITLE_COLOR,
      });
      layout.y -= 6;
      layout.drawText(`Source: ${file.name}`, {
        x: margin,
        size: 9,
        font: helvOblique,
        color: rgb(0.4, 0.4, 0.4),
      });
      layout.y -= 12;

      setStatusMsg(`Rendering ${shape.kind} layout…`);

      if (shape.kind === "table") {
        renderTable(layout, shape.headers, shape.rows);
      } else if (shape.kind === "kv") {
        renderKv(layout, shape.pairs);
      } else if (shape.kind === "list") {
        renderList(layout, shape.items);
      }

      if (includeRaw || shape.kind === "raw") {
        layout.newPage();
        layout.drawText("Raw JSON", {
          x: margin,
          size: 16,
          font: helvBold,
          color: TITLE_COLOR,
        });
        layout.y -= 8;
        renderRaw(layout, JSON.stringify(parsed, null, 2));
      }

      doc.setTitle(title || "JSON Report");
      doc.setCreator("YellowPDF");
      doc.setProducer("pdf-lib");

      const bytes = await savePdf(doc);
      const blob = pdfBlob(bytes);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
      setStatus("done");
      setStatusMsg(
        `Rendered a ${formatBytes(blob.size)} PDF (${shape.kind} layout).`,
      );
      useAppStore.getState().addRecent({
        name: OUTPUT_NAME,
        toolId: tool.id,
        size: blob.size,
      });
      toast.success("JSON rendered to PDF.");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMsg(
        err instanceof Error ? err.message : "Failed to convert JSON to PDF.",
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
      onReset={fullReset}
      resultUrl={resultUrl}
      resultName={OUTPUT_NAME}
      resultSize={resultSize}
      onDownload={onDownload}
    >
      <FileDropzone
        accept=".json,application/json"
        onFiles={handleFiles}
        files={files}
        onRemove={() => setFiles([])}
        title="Drop a JSON file here"
        hint="or click to browse — single .json file"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="title-input"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Report title
          </Label>
          <Input
            id="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="JSON Report"
            maxLength={80}
          />
        </div>

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
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label
            htmlFor="raw-switch"
            className="text-sm font-medium cursor-pointer"
          >
            Include raw JSON page
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Append a final page with the pretty-printed source JSON in a monospace font.
          </p>
        </div>
        <Switch
          id="raw-switch"
          checked={includeRaw}
          onCheckedChange={setIncludeRaw}
        />
      </div>

      <div className="flex justify-end gap-2">
        {resultUrl && (
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
              Convert to PDF
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <FileJson className="h-3.5 w-3.5" />
        Layout adapts to your data: object arrays render as tables, primitive objects as key-value pairs, and nested structures as pretty-printed JSON.
      </p>
    </ToolShell>
  );
}

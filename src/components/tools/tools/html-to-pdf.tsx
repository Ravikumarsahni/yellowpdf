"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Code2, Wand2, Info } from "lucide-react";
import { ToolShell } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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

const OUTPUT_NAME = "html.pdf";

interface Block {
  kind: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "li" | "pre" | "quote";
  text: string;
}

/**
 * Walk an HTMLDocument body and produce a flat list of text blocks. We don't
 * try to preserve styles — just emit one block per meaningful element.
 */
function extractBlocks(doc: Document): Block[] {
  const blocks: Block[] = [];
  const body = doc.body;
  if (!body) return blocks;

  const skipTags = new Set([
    "script",
    "style",
    "noscript",
    "svg",
    "head",
    "meta",
    "link",
    "iframe",
  ]);

  function pushBlock(kind: Block["kind"], text: string) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned) blocks.push({ kind, text: cleaned });
  }

  // Walk via TreeFilter so we capture the natural document order.
  function walk(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (skipTags.has(tag)) return;

      if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
        pushBlock(tag, el.textContent || "");
        return; // skip nested children — already grabbed textContent
      }
      if (tag === "p") {
        pushBlock("p", el.textContent || "");
        return;
      }
      if (tag === "li") {
        pushBlock("li", el.textContent || "");
        return;
      }
      if (tag === "pre") {
        const t = el.textContent || "";
        const cleaned = t.replace(/\r\n/g, "\n");
        blocks.push({ kind: "pre", text: cleaned });
        return;
      }
      if (tag === "blockquote") {
        pushBlock("quote", el.textContent || "");
        return;
      }
      // For other container-like tags, walk children.
      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      // Bare text node outside a semantic block (e.g. text directly in <body>).
      const t = node.textContent || "";
      const cleaned = t.replace(/\s+/g, " ").trim();
      if (cleaned) blocks.push({ kind: "p", text: cleaned });
    }
  }

  walk(body);
  return blocks;
}

/**
 * Naive line-wrapping: split `text` into chunks no longer than `maxChars`.
 * Splits on whitespace first; only word-breaks very long tokens.
 */
function wrapLine(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      if (w.length > maxChars) {
        // Hard-break a very long word.
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
      cur = w.length > maxChars ? "" : w;
      if (w.length > maxChars) {
        for (let i = 0; i < w.length; i += maxChars) {
          lines.push(w.slice(i, i + maxChars));
        }
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Measure how wide a font is at a given size, in PDF points. */
function charWidth(font: PDFFont, size: number): number {
  // Use a representative average char. pdf-lib exposes widthOfTextAtSize.
  return font.widthOfTextAtSize("M", size);
}

export function HtmlToPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [fontSize, setFontSize] = useState<number>(11);
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [status, setStatus] = useState<
    "idle" | "processing" | "done" | "error"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number>(0);

  function handleFiles(newFiles: File[]) {
    const htmls = newFiles.filter(
      (f) =>
        f.type === "text/html" ||
        /\.html?$/i.test(f.name),
    );
    if (htmls.length !== newFiles.length) {
      toast.warning("Some files were skipped (not HTML).");
    }
    setFiles(htmls.slice(0, 1));
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
      toast.error("Please select an HTML file.");
      return;
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setStatus("processing");
    setStatusMsg("Parsing HTML…");
    try {
      const text = await file.text();
      // DOMParser is available in the browser — parse as HTML.
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const blocks = extractBlocks(doc);

      const doc2 = await createPdf();
      // Embed Helvetica regular + bold.
      const [helv, helvBold] = await Promise.all([
        doc2.embedFont(StandardFonts.Helvetica),
        doc2.embedFont(StandardFonts.HelveticaBold),
      ]);

      const base = PAGE_SIZES[pageSize];
      const margin = 50; // ~0.7"
      const usableWidth = base.width - margin * 2;
      const bodySize = fontSize;
      const bodyLineHeight = bodySize * 1.4;

      let page: PDFPage = doc2.addPage([base.width, base.height]);
      let y = base.height - margin;

      function newPage() {
        page = doc2.addPage([base.width, base.height]);
        y = base.height - margin;
      }

      function ensureSpace(lineHeight: number) {
        if (y - lineHeight < margin) newPage();
      }

      const cwidBody = charWidth(helv, bodySize);
      const maxCharsBody = Math.max(20, Math.floor(usableWidth / cwidBody));

      setStatusMsg(`Laying out ${blocks.length} block${blocks.length === 1 ? "" : "s"}…`);

      for (const block of blocks) {
        let font: PDFFont = helv;
        let size = bodySize;
        let prefix = "";
        let color = rgb(0.1, 0.1, 0.1);
        switch (block.kind) {
          case "h1":
            font = helvBold;
            size = bodySize * 2;
            color = rgb(0.05, 0.05, 0.05);
            break;
          case "h2":
            font = helvBold;
            size = bodySize * 1.6;
            color = rgb(0.08, 0.08, 0.08);
            break;
          case "h3":
            font = helvBold;
            size = bodySize * 1.35;
            break;
          case "h4":
            font = helvBold;
            size = bodySize * 1.2;
            break;
          case "h5":
            font = helvBold;
            size = bodySize * 1.1;
            break;
          case "h6":
            font = helvBold;
            size = bodySize;
            color = rgb(0.35, 0.35, 0.35);
            break;
          case "li":
            prefix = "• ";
            font = helv;
            size = bodySize;
            break;
          case "pre":
            font = helv; // Standard Courier isn't pre-embedded here; use Helvetica
            size = bodySize * 0.9;
            color = rgb(0.1, 0.1, 0.1);
            break;
          case "quote":
            font = helv;
            size = bodySize;
            color = rgb(0.3, 0.3, 0.3);
            break;
          default:
            font = helv;
            size = bodySize;
        }

        const cw = charWidth(font, size);
        const maxChars = Math.max(10, Math.floor(usableWidth / cw));
        const lines: string[] = [];
        if (block.kind === "pre") {
          // Preserve newlines; wrap each line individually.
          for (const rawLine of block.text.split("\n")) {
            if (rawLine.length === 0) {
              lines.push("");
            } else {
              lines.push(...wrapLine(rawLine, maxChars));
            }
          }
        } else {
          for (const raw of block.text.split("\n")) {
            lines.push(...wrapLine(prefix + raw, maxChars));
            // Only prefix the first line of a block.
            prefix = "";
          }
        }
        const lineH = size * 1.4;

        // Heading extra top space.
        if (block.kind.startsWith("h")) {
          ensureSpace(lineH * 1.5);
          y -= lineH * 0.5;
        }

        for (const line of lines) {
          ensureSpace(lineH);
          page.drawText(line, {
            x: margin,
            y: y - size,
            size,
            font,
            color,
          });
          y -= lineH;
        }

        // Gap between blocks (smaller for list items).
        y -= block.kind === "li" ? lineH * 0.2 : lineH * 0.4;
      }

      doc2.setTitle(file.name.replace(/\.html?$/i, ""));
      doc2.setCreator("YellowPDF");
      doc2.setProducer("pdf-lib");

      const bytes = await savePdf(doc2);
      const blob = pdfBlob(bytes);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
      setStatus("done");
      setStatusMsg(
        `Extracted ${blocks.length} block${blocks.length === 1 ? "" : "s"} into a ${formatBytes(blob.size)} PDF.`,
      );
      useAppStore.getState().addRecent({
        name: OUTPUT_NAME,
        toolId: tool.id,
        size: blob.size,
      });
      toast.success("HTML rendered to PDF (text content).");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMsg(
        err instanceof Error ? err.message : "Failed to convert HTML to PDF.",
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
        accept=".html,.htm,text/html"
        onFiles={handleFiles}
        files={files}
        onRemove={() => setFiles([])}
        title="Drop an HTML file here"
        hint="or click to browse — single .html / .htm file"
      />

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Best-effort text extraction.</span>{" "}
          This tool extracts the visible text content (headings, paragraphs, lists,
          preformatted blocks) and re-lays it into a clean PDF — it does{" "}
          <em>not</em> preserve CSS styling, images, or layout fidelity. URL
          fetching requires a backend proxy and is not supported in this version.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="fs-slider"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Body font size
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {fontSize} pt
            </span>
          </div>
          <Slider
            id="fs-slider"
            min={8}
            max={18}
            step={1}
            value={[fontSize]}
            onValueChange={(v) => setFontSize(v[0] ?? 11)}
          />
        </div>
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
        <Code2 className="h-3.5 w-3.5" />
        We use the browser&apos;s <code>DOMParser</code> — no server round-trip,
        your file never leaves your device.
      </p>
    </ToolShell>
  );
}

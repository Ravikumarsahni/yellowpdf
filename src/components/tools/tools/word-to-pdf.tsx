"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileType, Wand2, Info } from "lucide-react";
import { ToolShell } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
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
import mammoth from "mammoth";

const OUTPUT_NAME = "converted.pdf";

type ProcessStatus = "idle" | "processing" | "done" | "error";

interface Block {
  kind: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "li" | "pre" | "quote";
  text: string;
}

const TEXT_COLOR = rgb(0.1, 0.1, 0.1);
const HEADING_COLOR = rgb(0.05, 0.05, 0.05);

/**
 * Walk an HTMLDocument body (produced by mammoth's docx→HTML conversion)
 * and produce a flat list of text blocks. Inline styles are ignored —
 * headings become bold paragraphs, paragraphs stay paragraphs, list items
 * get a bullet prefix.
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

  function walk(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (skipTags.has(tag)) return;

      if (
        tag === "h1" ||
        tag === "h2" ||
        tag === "h3" ||
        tag === "h4" ||
        tag === "h5" ||
        tag === "h6"
      ) {
        pushBlock(tag, el.textContent || "");
        return;
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
        blocks.push({ kind: "pre", text: t.replace(/\r\n/g, "\n") });
        return;
      }
      if (tag === "blockquote") {
        pushBlock("quote", el.textContent || "");
        return;
      }
      // Walk children for container-like elements (div, section, ul, ol, table…)
      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || "";
      const cleaned = t.replace(/\s+/g, " ").trim();
      if (cleaned) blocks.push({ kind: "p", text: cleaned });
    }
  }

  walk(body);
  return blocks;
}

/**
 * Naive word-aware wrapping: split `text` into chunks no longer than
 * `maxChars` per line. Splits on whitespace; only hard-breaks very long tokens.
 */
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

/** Measure the average char width for a font at a given size, in PDF pts. */
function charWidth(font: PDFFont, size: number): number {
  return font.widthOfTextAtSize("M", size);
}

export function WordToPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number>(0);

  function isWordFile(f: File): boolean {
    return (
      /\.docx?$/i.test(f.name) ||
      f.type === "application/msword" ||
      f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  function handleFiles(newFiles: File[]) {
    const words = newFiles.filter(isWordFile);
    if (words.length !== newFiles.length) {
      toast.warning("Some files were skipped (not .doc/.docx).");
    }
    setFiles(words.slice(0, 1));
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
      toast.error("Please select a Word document.");
      return;
    }
    if (!isWordFile(file)) {
      toast.error("Please select a .doc or .docx file.");
      return;
    }
    if (/\.doc$/i.test(file.name) && !/\.docx$/i.test(file.name)) {
      toast.error(
        "Legacy .doc (Word 97-2003) is not supported in-browser. Save as .docx and try again.",
      );
      return;
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setStatus("processing");
    setStatusMsg("Reading document…");
    try {
      const arrayBuffer = await file.arrayBuffer();
      setStatusMsg("Extracting content with mammoth…");
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const htmlString = result.value || "";

      if (!htmlString.trim()) {
        throw new Error(
          "No text content could be extracted from this document. It may be empty or contain only images.",
        );
      }

      const parser = new DOMParser();
      const dom = parser.parseFromString(htmlString, "text/html");
      const blocks = extractBlocks(dom);

      if (blocks.length === 0) {
        throw new Error("The document appears to be empty.");
      }

      setStatusMsg(`Laying out ${blocks.length} block${blocks.length === 1 ? "" : "s"}…`);

      const doc: PDFDocument = await createPdf();
      const [helv, helvBold] = await Promise.all([
        doc.embedFont(StandardFonts.Helvetica),
        doc.embedFont(StandardFonts.HelveticaBold),
      ]);

      const base = PAGE_SIZES.A4;
      const margin = 50; // ~0.7"
      const usableWidth = base.width - margin * 2;
      const bodySize = 11;

      let page: PDFPage = doc.addPage([base.width, base.height]);
      let y = base.height - margin;

      const newPage = () => {
        page = doc.addPage([base.width, base.height]);
        y = base.height - margin;
      };
      const ensureSpace = (lineH: number) => {
        if (y - lineH < margin) newPage();
      };

      const bodyCw = charWidth(helv, bodySize);
      const bodyMaxChars = Math.max(20, Math.floor(usableWidth / bodyCw));

      for (const block of blocks) {
        let font: PDFFont = helv;
        let size = bodySize;
        let prefix = "";
        let color = TEXT_COLOR;

        switch (block.kind) {
          case "h1":
            font = helvBold;
            size = bodySize * 2;
            color = HEADING_COLOR;
            break;
          case "h2":
            font = helvBold;
            size = bodySize * 1.6;
            color = HEADING_COLOR;
            break;
          case "h3":
            font = helvBold;
            size = bodySize * 1.35;
            color = HEADING_COLOR;
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
            prefix = "•  ";
            font = helv;
            size = bodySize;
            break;
          case "pre":
            font = helv;
            size = bodySize * 0.9;
            color = TEXT_COLOR;
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
        // For non-pre blocks, derive the wrap budget from the body width
        // (avoid overly narrow headings) — the smaller of bodyMaxChars / maxChars.
        const wrapBudget =
          block.kind === "pre" ? maxChars : Math.min(bodyMaxChars, maxChars);

        const lines: string[] = [];
        if (block.kind === "pre") {
          for (const rawLine of block.text.split("\n")) {
            if (rawLine.length === 0) {
              lines.push("");
            } else {
              lines.push(...wrapText(rawLine, wrapBudget));
            }
          }
        } else {
          for (const raw of block.text.split("\n")) {
            lines.push(...wrapText(prefix + raw, wrapBudget));
            // Only prefix the first line of a block.
            prefix = "";
          }
        }
        const lineH = size * 1.4;

        // Extra top spacing before headings.
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

      doc.setTitle(file.name.replace(/\.docx?$/i, ""));
      doc.setCreator("YellowPDF");
      doc.setProducer("pdf-lib");

      const bytes = await savePdf(doc);
      const blob = pdfBlob(bytes);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
      setStatus("done");
      setStatusMsg(
        `Laid out ${blocks.length} block${blocks.length === 1 ? "" : "s"} into a ${formatBytes(blob.size)} PDF.`,
      );
      useAppStore.getState().addRecent({
        name: OUTPUT_NAME,
        toolId: tool.id,
        size: blob.size,
      });
      toast.success("Word document converted to PDF.");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMsg(
        err instanceof Error ? err.message : "Failed to convert Word to PDF.",
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
        accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onFiles={handleFiles}
        files={files}
        onRemove={() => setFiles([])}
        title="Drop a Word document here"
        hint="or click to browse — single .docx file (.doc needs re-saving)"
      />

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Best-effort text &amp; heading extraction.
          </span>{" "}
          Complex Word formatting (tables, images, custom fonts, colors, columns)
          is simplified to clean text + bold headings. Headings become bold
          paragraphs and lists become bulleted paragraphs.
        </p>
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
            "Converting…"
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-1.5" />
              Convert to PDF
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <FileType className="h-3.5 w-3.5" />
        Powered by mammoth (docx parser) + pdf-lib (PDF writer) — your document
        never leaves your browser.
      </p>
    </ToolShell>
  );
}

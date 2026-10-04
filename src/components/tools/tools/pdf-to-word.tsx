"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileType2, Wand2, Info } from "lucide-react";
import { ToolShell } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { downloadBlob, formatBytes } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { Tool } from "@/lib/tools";
import { Document, Packer, Paragraph, TextRun } from "docx";

const OUTPUT_NAME = "converted.docx";

type ProcessStatus = "idle" | "processing" | "done" | "error";

/**
 * Split the joined `--- Page N ---\n…` text produced by
 * `extractTextFromPdf` into per-page strings.
 */
function splitPages(joined: string): string[] {
  return joined
    .split(/^--- Page \d+ ---\n?/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Heuristically split a single page's text (which pdfjs emits as a
 * space-joined run of all line-items on the page) into paragraph-ish chunks.
 * Splits on 2+ consecutive spaces (a common paragraph/column break signal
 * from pdfjs) or any newline.
 */
function splitParagraphs(pageText: string): string[] {
  return pageText
    .split(/\s{2,}|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PdfToWordTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number>(0);

  function isPdfFile(f: File): boolean {
    return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  }

  function handleFiles(newFiles: File[]) {
    const pdfs = newFiles.filter(isPdfFile);
    if (pdfs.length !== newFiles.length) {
      toast.warning("Some files were skipped (not PDF).");
    }
    setFiles(pdfs.slice(0, 1));
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
      toast.error("Please select a PDF file.");
      return;
    }
    if (!isPdfFile(file)) {
      toast.error("Please select a PDF file.");
      return;
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setStatus("processing");
    setStatusMsg("Extracting text with pdfjs…");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const { text, pages } = await extractTextFromPdf(uint8);

      const pageTexts = splitPages(text);
      // Fall back to the raw text if no page markers were found.
      const effectivePages =
        pageTexts.length > 0 ? pageTexts : [text.trim()].filter(Boolean);

      setStatusMsg(
        `Building DOCX from ${pages} page${pages === 1 ? "" : "s"}…`,
      );

      const paragraphs: Paragraph[] = [];
      if (effectivePages.length === 0) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun("(No extractable text found in this PDF.)")],
          }),
        );
      } else {
        effectivePages.forEach((pageText, pageIdx) => {
          const chunks = splitParagraphs(pageText);
          if (chunks.length === 0) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun("")],
                pageBreakBefore: pageIdx > 0,
              }),
            );
            return;
          }
          chunks.forEach((chunk, chunkIdx) => {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun(chunk)],
                pageBreakBefore: pageIdx > 0 && chunkIdx === 0,
              }),
            );
          });
        });
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
      setStatus("done");
      setStatusMsg(
        `Extracted ${pages} page${pages === 1 ? "" : "s"} into a ${formatBytes(blob.size)} DOCX.`,
      );
      useAppStore.getState().addRecent({
        name: OUTPUT_NAME,
        toolId: tool.id,
        size: blob.size,
      });
      toast.success("PDF converted to Word.");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMsg(
        err instanceof Error ? err.message : "Failed to convert PDF to Word.",
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
        accept="application/pdf"
        onFiles={handleFiles}
        files={files}
        onRemove={() => setFiles([])}
        title="Drop a PDF here"
        hint="or click to browse — single .pdf file"
      />

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Plain-text extraction only.
          </span>{" "}
          Only embedded digital text is converted — scanned or image-only PDFs
          need OCR first (try the OCR PDF tool). Multi-column layouts, tables,
          and inline images are flattened into plain paragraphs.
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
              Convert to Word
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <FileType2 className="h-3.5 w-3.5" />
        Powered by pdfjs (text extraction) + docx (DOCX builder) — your file
        never leaves your browser.
      </p>
    </ToolShell>
  );
}

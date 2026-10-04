"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { downloadBlob } from "@/lib/format";
import {
  createPdf,
  loadPdf,
  PAGE_SIZES,
  pdfBlob,
  savePdf,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

export function PdfToA4Tool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("pdf-a4.pdf");
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
    setStatus("processing");
    setStatusMessage("Resizing pages to A4…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const src = await loadPdf(bytes);
      const out = await createPdf();
      const a4 = PAGE_SIZES.A4;

      for (let i = 0; i < src.getPageCount(); i++) {
        const srcPage = src.getPage(i);
        const { width: sw, height: sh } = srcPage.getSize();
        // Fit the source page inside A4 preserving aspect ratio.
        const scale = Math.min(a4.width / sw, a4.height / sh);
        const drawW = sw * scale;
        const drawH = sh * scale;
        const x = (a4.width - drawW) / 2;
        const y = (a4.height - drawH) / 2;

        const embedded = await out.embedPage(srcPage);
        const page = out.addPage([a4.width, a4.height]);
        page.drawPage(embedded, { x, y, width: drawW, height: drawH });
      }

      const outBytes = await savePdf(out);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(`Resized ${src.getPageCount()} page${src.getPageCount() === 1 ? "" : "s"} to A4.`);
      useAppStore.getState().addRecent({
        name: "pdf-a4.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Resized to A4!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not resize this PDF to A4.");
      toast.error("Resize failed.");
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
        title="Drop a PDF to resize to A4"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <p className="text-xs text-muted-foreground">
          Loaded {pageCount} page{pageCount === 1 ? "" : "s"}. Each page will be
          embedded onto a fresh A4 sheet, preserving aspect ratio.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length === 0 || status === "processing"}
        >
          <FileText className="h-4 w-4 mr-1.5" />
          Convert to A4
        </Button>
      </div>
    </ToolShell>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, FileStack } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { downloadBlob } from "@/lib/format";
import {
  createPdf,
  loadPdf,
  pdfBlob,
  savePdf,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

export function ReorderPagesTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("reordered.pdf");
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
      const n = doc.getPageCount();
      setPageCount(n);
      setOrder(Array.from({ length: n }, (_, i) => i));
    } catch (err) {
      console.error(err);
      setPageCount(null);
      setOrder([]);
      toast.error("Could not read this PDF.");
    }
  };

  const onRemove = () => {
    setFiles([]);
    setPageCount(null);
    setOrder([]);
    setStatus("idle");
    setStatusMessage("");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
  };

  const move = (i: number, dir: -1 | 1) => {
    setOrder((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const onProcess = async () => {
    if (files.length === 0) {
      toast.error("Add a PDF first.");
      return;
    }
    if (order.length === 0) {
      toast.error("No pages to reorder.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Saving new order…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const src = await loadPdf(bytes);
      const out = await createPdf();
      const copied = await out.copyPages(src, order);
      for (const p of copied) out.addPage(p);

      const outBytes = await savePdf(out);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(`Reordered ${order.length} pages.`);
      useAppStore.getState().addRecent({
        name: "reordered.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Reorder complete!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not reorder pages. Please try another file.");
      toast.error("Reorder failed.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
    setPageCount(null);
    setOrder([]);
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
        title="Drop a PDF to reorder"
        hint="Single PDF file"
      />

      {pageCount !== null && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {pageCount} page{pageCount === 1 ? "" : "s"} loaded. Use the arrows
            to reorder.
          </p>
          {order.length > 0 && (
            <ul
              className="flex flex-wrap gap-2 max-h-72 overflow-y-auto p-1"
              aria-label="Page order"
            >
              {order.map((pageIdx, pos) => (
                <li
                  key={pageIdx}
                  className="flex items-center gap-1 rounded-md border border-border bg-background p-1.5"
                >
                  <span className="grid place-items-center h-9 w-9 rounded-md bg-primary/10 text-primary text-sm font-bold">
                    {pageIdx + 1}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => move(pos, -1)}
                      disabled={pos === 0}
                      aria-label={`Move page ${pageIdx + 1} left`}
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => move(pos, 1)}
                      disabled={pos === order.length - 1}
                      aria-label={`Move page ${pageIdx + 1} right`}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length === 0 || order.length === 0 || status === "processing"}
        >
          <FileStack className="h-4 w-4 mr-1.5" />
          Save new order
        </Button>
      </div>
    </ToolShell>
  );
}

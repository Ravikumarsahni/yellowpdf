"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Combine } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { downloadBlob, formatBytes } from "@/lib/format";
import { createPdf, loadPdf, pdfBlob, savePdf } from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

export function MergePdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("merged.pdf");
  const [resultSize, setResultSize] = useState<number | undefined>();

  const onFiles = (incoming: File[]) => {
    const valid = incoming.filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
    );
    if (valid.length !== incoming.length) {
      toast.error("Only PDF files are supported.");
    }
    setFiles((prev) => [...prev, ...valid]);
    setStatus("idle");
    setStatusMessage("");
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setResultBlob(null);
    }
  };

  const onRemove = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setStatus("idle");
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (i: number) => {
    setFiles((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next;
    });
  };

  const onProcess = async () => {
    if (files.length < 2) {
      toast.error("Add at least 2 PDFs to merge.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Merging PDFs…");
    try {
      const out = await createPdf();
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const src = await loadPdf(bytes);
        const pageCount = src.getPageCount();
        const indices = Array.from({ length: pageCount }, (_, k) => k);
        const pages = await out.copyPages(src, indices);
        for (const p of pages) out.addPage(p);
      }
      const outBytes = await savePdf(out);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(`Merged ${files.length} PDFs into one file.`);
      useAppStore.getState().addRecent({
        name: "merged.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Merge complete!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage(
        "Could not merge these PDFs. Make sure every file is a valid PDF.",
      );
      toast.error("Merge failed. Make sure every file is a valid PDF.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
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
        multiple
        onFiles={onFiles}
        files={files}
        onRemove={onRemove}
        title="Drop PDFs to merge"
        hint="Add 2 or more PDF files, then arrange the order"
      />

      {files.length > 0 && (
        <div className="space-y-2">
          <Label>Order (top file appears first in the merged PDF)</Label>
          <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
              >
                <span className="grid place-items-center h-7 w-7 rounded-md bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(f.size)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    aria-label={`Move ${f.name} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveDown(i)}
                    disabled={i === files.length - 1}
                    aria-label={`Move ${f.name} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length < 2 || status === "processing"}
        >
          <Combine className="h-4 w-4 mr-1.5" />
          Merge {files.length > 0 ? `${files.length} PDFs` : "PDFs"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {files.length < 2 ? "Add at least 2 files to enable merge" : "Ready to merge"}
        </span>
      </div>
    </ToolShell>
  );
}

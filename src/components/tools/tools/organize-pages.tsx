"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Trash2,
  SquareStack,
} from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { downloadBlob } from "@/lib/format";
import {
  createPdf,
  degrees,
  loadPdf,
  pdfBlob,
  savePdf,
} from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

interface PageState {
  /** 0-indexed source page index. */
  sourceIndex: number;
  /** Cumulative clockwise rotation in degrees (0/90/180/270). */
  rotation: number;
}

export function OrganizePagesTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState<PageState[]>([]);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("organized.pdf");
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
      setPages(
        Array.from({ length: n }, (_, i) => ({
          sourceIndex: i,
          rotation: 0,
        })),
      );
    } catch (err) {
      console.error(err);
      setPages([]);
      toast.error("Could not read this PDF.");
    }
  };

  const onRemove = () => {
    setFiles([]);
    setPages([]);
    setStatus("idle");
    setStatusMessage("");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
  };

  const rotate = (pos: number) => {
    setPages((prev) =>
      prev.map((p, i) =>
        i === pos ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
      ),
    );
  };

  const remove = (pos: number) => {
    setPages((prev) => prev.filter((_, i) => i !== pos));
  };

  const move = (pos: number, dir: -1 | 1) => {
    setPages((prev) => {
      const j = pos + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[pos], next[j]] = [next[j], next[pos]];
      return next;
    });
  };

  const onProcess = async () => {
    if (files.length === 0) {
      toast.error("Add a PDF first.");
      return;
    }
    if (pages.length === 0) {
      toast.error("No pages left to save.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Saving organized PDF…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const src = await loadPdf(bytes);
      const out = await createPdf();
      const indices = pages.map((p) => p.sourceIndex);
      const copied = await out.copyPages(src, indices);
      for (let i = 0; i < copied.length; i++) {
        const page = copied[i];
        const state = pages[i];
        if (state.rotation) {
          const current = page.getRotation().angle;
          page.setRotation(degrees((current + state.rotation) % 360));
        }
        out.addPage(page);
      }

      const outBytes = await savePdf(out);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(`Saved ${pages.length} page${pages.length === 1 ? "" : "s"}.`);
      useAppStore.getState().addRecent({
        name: "organized.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Pages organized!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not organize this PDF.");
      toast.error("Organize failed.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
    setPages([]);
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
        title="Drop a PDF to organize"
        hint="Single PDF file"
      />

      {pages.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {pages.length} page{pages.length === 1 ? "" : "s"}. Use the controls
            on each card to rotate, delete, or reorder.
          </p>
          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 max-h-96 overflow-y-auto p-1"
            aria-label="Pages"
          >
            {pages.map((p, pos) => (
              <li
                key={`${p.sourceIndex}-${pos}`}
                className="rounded-md border border-border bg-background p-2 flex flex-col gap-2"
              >
                <div
                  className="grid place-items-center h-20 rounded bg-primary/5 text-primary text-lg font-bold"
                  style={{ transform: `rotate(${p.rotation}deg)` }}
                  aria-label={`Page ${p.sourceIndex + 1}, rotated ${p.rotation} degrees`}
                >
                  {p.sourceIndex + 1}
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-full"
                    onClick={() => rotate(pos)}
                    aria-label={`Rotate page ${p.sourceIndex + 1}`}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-full"
                    onClick={() => move(pos, -1)}
                    disabled={pos === 0}
                    aria-label={`Move page ${p.sourceIndex + 1} left`}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-full"
                    onClick={() => move(pos, 1)}
                    disabled={pos === pages.length - 1}
                    aria-label={`Move page ${p.sourceIndex + 1} right`}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-full text-muted-foreground hover:text-destructive"
                    onClick={() => remove(pos)}
                    aria-label={`Delete page ${p.sourceIndex + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
          disabled={files.length === 0 || pages.length === 0 || status === "processing"}
        >
          <SquareStack className="h-4 w-4 mr-1.5" />
          Save organized PDF
        </Button>
      </div>
    </ToolShell>
  );
}

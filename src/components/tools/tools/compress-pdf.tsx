"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Minimize2 } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useAppStore } from "@/lib/store";
import { downloadBlob, formatBytes } from "@/lib/format";
import { loadPdf, pdfBlob, savePdf } from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

type Quality = "low" | "medium" | "high";

const QUALITY_LABELS: Record<Quality, string> = {
  low: "Maximum compression",
  medium: "Balanced",
  high: "Best quality (largest)",
};

export function CompressPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState<Quality>("medium");
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("compressed.pdf");
  const [resultSize, setResultSize] = useState<number | undefined>();
  const [inputSize, setInputSize] = useState<number | undefined>();

  const onFiles = (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
      toast.error("Only PDF files are supported.");
      return;
    }
    setFiles([f]);
    setInputSize(f.size);
    setStatus("idle");
    setStatusMessage("");
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setResultBlob(null);
    }
  };

  const onRemove = () => {
    setFiles([]);
    setInputSize(undefined);
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
    setStatusMessage("Compressing PDF…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      const doc = await loadPdf(bytes);

      // Strip metadata on low/medium compression levels.
      if (quality === "low" || quality === "medium") {
        doc.setTitle("");
        doc.setAuthor("");
        doc.setSubject("");
        doc.setKeywords([]);
        doc.setProducer("YellowPDF");
        doc.setCreator("YellowPDF");
        doc.setCreationDate(new Date(0));
        doc.setModificationDate(new Date(0));
      }

      // useObjectStreams=true packs objects into compressed streams.
      const outBytes = await savePdf(doc, {
        useObjectStreams: quality !== "high",
      });
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      const reduction =
        inputSize && inputSize > 0 && outBytes.length < inputSize
          ? Math.round((1 - outBytes.length / inputSize) * 100)
          : 0;
      setStatusMessage(
        reduction > 0
          ? `Reduced from ${formatBytes(inputSize ?? 0)} to ${formatBytes(outBytes.length)} (${reduction}% smaller).`
          : `Output is ${formatBytes(outBytes.length)}. Already well-optimized.`,
      );
      useAppStore.getState().addRecent({
        name: "compressed.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Compression complete!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not compress this PDF. Please try another file.");
      toast.error("Compression failed.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
    setInputSize(undefined);
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
        title="Drop a PDF to compress"
        hint="Single PDF file"
      />

      {inputSize !== undefined && (
        <p className="text-xs text-muted-foreground">
          Input: {formatBytes(inputSize)}
        </p>
      )}

      <div className="space-y-3">
        <Label>Compression level</Label>
        <RadioGroup
          value={quality}
          onValueChange={(v) => setQuality(v as Quality)}
          className="grid gap-2 sm:grid-cols-3"
        >
          {(["low", "medium", "high"] as Quality[]).map((q) => (
            <Label
              key={q}
              htmlFor={`compress-${q}`}
              className="flex items-center gap-2 rounded-md border border-border bg-background p-3 cursor-pointer hover:bg-accent/30"
            >
              <RadioGroupItem id={`compress-${q}`} value={q} />
              <div className="flex flex-col">
                <span className="text-sm font-medium capitalize">{q}</span>
                <span className="text-xs text-muted-foreground">
                  {QUALITY_LABELS[q]}
                </span>
              </div>
            </Label>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Compression works by repacking PDF objects into compressed streams
          and stripping metadata. Image-heavy PDFs may see smaller gains —
          recompressing embedded images requires a separate tool.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={files.length === 0 || status === "processing"}
        >
          <Minimize2 className="h-4 w-4 mr-1.5" />
          Compress PDF
        </Button>
      </div>
    </ToolShell>
  );
}

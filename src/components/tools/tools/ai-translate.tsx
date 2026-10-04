"use client";

import { useCallback, useState } from "react";
import {
  Languages,
  Loader2,
  FileText,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  Info,
} from "lucide-react";
import { ToolShell, type ProcessStatus } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { formatBytes } from "@/lib/format";
import type { Tool } from "@/lib/tools";

const LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Italian", label: "Italian" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Hindi", label: "Hindi" },
  { value: "Chinese", label: "Chinese (Simplified)" },
  { value: "Japanese", label: "Japanese" },
  { value: "Korean", label: "Korean" },
  { value: "Arabic", label: "Arabic" },
  { value: "Russian", label: "Russian" },
] as const;

interface ExtractState {
  status: "idle" | "extracting" | "done" | "error";
  text: string;
  pages: number;
  error: string | null;
}

const INITIAL_EXTRACT: ExtractState = {
  status: "idle",
  text: "",
  pages: 0,
  error: null,
};

export function AiTranslateTool({ tool }: { tool: Tool }) {
  const addRecent = useAppStore((s) => s.addRecent);

  const [file, setFile] = useState<File | null>(null);
  const [extract, setExtract] = useState<ExtractState>(INITIAL_EXTRACT);

  const [target, setTarget] = useState<string>("English");
  const [apiState, setApiState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [translation, setTranslation] = useState<string>("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setExtract({ ...INITIAL_EXTRACT, status: "extracting" });
    setApiState("idle");
    setTranslation("");
    setApiError(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { text, pages } = await extractTextFromPdf(bytes);
      if (!text.trim()) {
        setExtract({
          status: "error",
          text: "",
          pages,
          error:
            "No selectable text could be extracted from this PDF. It may be a scanned image — try the OCR tool first.",
        });
        return;
      }
      setExtract({ status: "done", text, pages, error: null });
    } catch (err) {
      setExtract({
        status: "error",
        text: "",
        pages: 0,
        error:
          err instanceof Error ? err.message : "Failed to read the PDF file.",
      });
    }
  }, []);

  const handleResetFile = useCallback(() => {
    setFile(null);
    setExtract(INITIAL_EXTRACT);
    setApiState("idle");
    setTranslation("");
    setApiError(null);
  }, []);

  const handleTranslate = useCallback(async () => {
    if (!extract.text) return;
    setApiState("loading");
    setApiError(null);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extract.text, target }),
      });
      const data = (await res.json().catch(() => null)) as
        | { translation?: string; target?: string; error?: string }
        | null;
      if (!res.ok || !data?.translation) {
        throw new Error(
          data?.error ?? `Request failed with status ${res.status}`,
        );
      }
      setTranslation(data.translation);
      setApiState("done");
      addRecent({
        name: `translation-${target.toLowerCase()}.txt`,
        toolId: "ai-translate",
        size: data.translation.length,
      });
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to translate the document.",
      );
      setApiState("error");
    }
  }, [extract.text, target, addRecent]);

  const handleCopy = useCallback(async () => {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }, [translation]);

  const toolStatus: ProcessStatus =
    extract.status === "extracting" || apiState === "loading"
      ? "processing"
      : apiState === "error" || extract.status === "error"
        ? "error"
        : "idle";

  const statusMessage =
    extract.status === "extracting"
      ? "Extracting text from PDF…"
      : apiState === "loading"
        ? `Translating to ${target}…`
        : undefined;

  return (
    <ToolShell
      tool={tool}
      status={toolStatus}
      statusMessage={statusMessage}
      onReset={file ? handleResetFile : undefined}
    >
      {!file && (
        <FileDropzone
          accept="application/pdf"
          multiple={false}
          onFiles={handleFiles}
          title="Drop a PDF here"
          hint="or click to browse — single PDF file"
        />
      )}

      {file && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid place-items-center h-9 w-9 rounded-md bg-secondary text-primary shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {extract.status === "done"
                    ? ` · ${extract.pages} page${extract.pages === 1 ? "" : "s"} · ${extract.text.length.toLocaleString()} chars extracted`
                    : extract.status === "extracting"
                      ? " · extracting…"
                      : ""}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFile}
              aria-label="Remove file"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Replace
            </Button>
          </div>

          {extract.status === "error" && extract.error && (
            <p className="text-sm text-destructive">{extract.error}</p>
          )}

          {extract.status === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <p>
                  Text-only translation: the original PDF layout (columns,
                  fonts, tables, images) won&apos;t be preserved. The
                  translated text is delivered as plain text.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Translate to</p>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleTranslate}
                disabled={apiState === "loading"}
                size="lg"
                className="w-full"
              >
                {apiState === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Translating…
                  </>
                ) : (
                  <>
                    <Languages className="h-4 w-4" />
                    Translate to {target}
                  </>
                )}
              </Button>

              {apiState === "error" && apiError && (
                <p className="text-sm text-destructive">{apiError}</p>
              )}

              {apiState === "done" && translation && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Languages className="h-4 w-4 text-primary" />
                      Translation ({target})
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm leading-relaxed whitespace-pre-wrap">
                      {translation
                        .split(/\n{2,}/)
                        .map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI-specific privacy note */}
      <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          Only the extracted{" "}
          <strong className="text-foreground">text</strong> is sent to our AI
          backend — your PDF file never leaves your device.
        </p>
      </div>
    </ToolShell>
  );
}

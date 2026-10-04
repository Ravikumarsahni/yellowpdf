"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Unlock, AlertTriangle } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { downloadBlob, formatBytes } from "@/lib/format";
import { loadPdf, pdfBlob, savePdf } from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

const MAGIC = new Uint8Array([
  0x59, 0x50, 0x44, 0x46, 0x45, 0x4e, 0x43, 0x31,
]);

const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    } as Pbkdf2Params,
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptPdf(
  data: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  if (data.length < MAGIC.length + 16 + 12 + 1) {
    throw new Error("File is too small to be a protected PDF.");
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (data[i] !== MAGIC[i]) {
      throw new Error(
        "This file was not created by YellowPDF's Protect PDF tool.",
      );
    }
  }
  const salt = data.slice(MAGIC.length, MAGIC.length + 16);
  const iv = data.slice(MAGIC.length + 16, MAGIC.length + 16 + 12);
  const cipher = data.slice(MAGIC.length + 16 + 12);
  const key = await deriveKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource } as AesGcmParams,
    key,
    cipher as BufferSource,
  );
  return new Uint8Array(plainBuf);
}

export function UnlockPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState<"enc" | "pdf" | null>(null);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("unlocked.pdf");
  const [resultSize, setResultSize] = useState<number | undefined>();

  const onFiles = (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    const isEnc = /\.pdf\.enc$/i.test(f.name);
    const isPdf =
      f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!isEnc && !isPdf) {
      toast.error("Please choose a .pdf or .pdf.enc file.");
      return;
    }
    setFiles([f]);
    setMode(isEnc ? "enc" : "pdf");
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
    setMode(null);
    setStatus("idle");
    setStatusMessage("");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(undefined);
  };

  const onProcess = async () => {
    if (files.length === 0) {
      toast.error("Add a file first.");
      return;
    }
    if (mode === "enc" && !password) {
      toast.error("Password is required to decrypt a .pdf.enc file.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Unlocking…");
    try {
      const raw = new Uint8Array(await files[0].arrayBuffer());
      let pdfBytes: Uint8Array;
      if (mode === "enc") {
        try {
          pdfBytes = await decryptPdf(raw, password);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Decryption failed.";
          setStatus("error");
          setStatusMessage(
            msg.includes("Protect PDF")
              ? msg
              : "Could not decrypt — check that the password is correct.",
          );
          toast.error("Wrong password or invalid file.");
          return;
        }
      } else {
        // Plain .pdf — pdf-lib ignores permission-password encryption on
        // load and re-save strips the encryption flag.
        pdfBytes = raw;
      }
      const doc = await loadPdf(pdfBytes);
      const outBytes = await savePdf(doc);
      const blob = pdfBlob(outBytes);
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(outBytes.length);
      setStatus("done");
      setStatusMessage(
        mode === "enc"
          ? `Decrypted and restored (${formatBytes(outBytes.length)}).`
          : `Saved without encryption metadata (${formatBytes(outBytes.length)}).`,
      );
      useAppStore.getState().addRecent({
        name: "unlocked.pdf",
        toolId: tool.id,
        size: outBytes.length,
      });
      toast.success("Unlocked!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not unlock this file.");
      toast.error("Unlock failed.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
    setMode(null);
    setPassword("");
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
        accept="application/pdf,.enc"
        onFiles={onFiles}
        files={files}
        onRemove={onRemove}
        title="Drop a PDF or .pdf.enc file"
        hint="Single file"
      />

      {mode === "pdf" && (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-2"
          role="note"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            <strong>About PDF password removal:</strong> For PDFs that only have
            a permissions password (you can open them freely), this tool re-saves
            the file without the encryption flag. For PDFs that require a
            password to open, pdf-lib does not support decryption natively — use
            the <strong>Protect PDF</strong> + <strong>Unlock PDF</strong>{" "}
            pair for true AES-GCM encryption instead.
          </p>
        </div>
      )}

      {mode === "enc" && (
        <div className="space-y-1.5">
          <Label htmlFor="unlock-pw">Password</Label>
          <div className="relative">
            <Input
              id="unlock-pw"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the password used to protect this file"
              autoComplete="current-password"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-7 w-7"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={
            files.length === 0 ||
            (mode === "enc" && !password) ||
            status === "processing"
          }
        >
          <Unlock className="h-4 w-4 mr-1.5" />
          Unlock {mode === "enc" ? "file" : "PDF"}
        </Button>
      </div>
    </ToolShell>
  );
}

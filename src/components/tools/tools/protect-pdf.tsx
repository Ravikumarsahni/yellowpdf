"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, AlertTriangle } from "lucide-react";
import { ToolShell, type ProcessStatus } from "@/components/tools/tool-shell";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { downloadBlob, formatBytes } from "@/lib/format";
import { loadPdf, savePdf } from "@/lib/pdf/client-pdf";
import type { Tool } from "@/lib/tools";

// 8-byte magic for our protected file format: "YPDFENC1".
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
    ["encrypt"],
  );
}

async function encryptPdf(
  plain: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource } as AesGcmParams,
    key,
    plain as BufferSource,
  );
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(
    MAGIC.length + salt.length + iv.length + cipher.length,
  );
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + salt.length);
  out.set(cipher, MAGIC.length + salt.length + iv.length);
  return out;
}

export function ProtectPdfTool({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<ProcessStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName] = useState("protected.pdf.enc");
  const [resultSize, setResultSize] = useState<number | undefined>();

  const onFiles = (incoming: File[]) => {
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
  };

  const onRemove = () => {
    setFiles([]);
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
    if (!password) {
      toast.error("Please enter a password.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password should be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setStatus("processing");
    setStatusMessage("Encrypting PDF…");
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      // Re-save the PDF through pdf-lib so we control the byte stream we
      // encrypt (also normalizes the file).
      const doc = await loadPdf(bytes);
      const savedBytes = await savePdf(doc);
      const encBytes = await encryptPdf(savedBytes, password);
      const blob = new Blob([encBytes.slice()], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultSize(encBytes.length);
      setStatus("done");
      setStatusMessage(
        `Encrypted with AES-GCM (${formatBytes(encBytes.length)}). Use the Unlock PDF tool with the same password to restore.`,
      );
      useAppStore.getState().addRecent({
        name: "protected.pdf.enc",
        toolId: tool.id,
        size: encBytes.length,
      });
      toast.success("PDF protected!");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setStatusMessage("Could not protect this PDF.");
      toast.error("Protection failed.");
    }
  };

  const onReset = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFiles([]);
    setPassword("");
    setConfirm("");
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
      <div
        className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-2"
        role="note"
      >
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          <strong>Experimental implementation.</strong> pdf-lib does not write
          native PDF encryption. This tool encrypts the PDF bytes with AES-GCM
          (key derived from your password via PBKDF2) and produces a{" "}
          <code>.pdf.enc</code> file. Restore it with our{" "}
          <strong>Unlock PDF</strong> tool using the same password. Other PDF
          readers will not open the <code>.pdf.enc</code> file directly.
        </p>
      </div>

      <FileDropzone
        accept="application/pdf"
        onFiles={onFiles}
        files={files}
        onRemove={onRemove}
        title="Drop a PDF to protect"
        hint="Single PDF file"
      />

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="protect-pw">Password</Label>
          <div className="relative">
            <Input
              id="protect-pw"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
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

        <div className="space-y-1.5">
          <Label htmlFor="protect-confirm">Confirm password</Label>
          <Input
            id="protect-confirm"
            type={showPw ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter the password"
            autoComplete="new-password"
          />
          {confirm && password !== confirm && (
            <p className="text-xs text-destructive">Passwords do not match.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onProcess}
          disabled={
            files.length === 0 ||
            !password ||
            password !== confirm ||
            status === "processing"
          }
        >
          <Lock className="h-4 w-4 mr-1.5" />
          Protect PDF
        </Button>
      </div>
    </ToolShell>
  );
}

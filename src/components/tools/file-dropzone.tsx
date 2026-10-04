"use client";

import { useRef, useState, type ReactNode, type DragEvent } from "react";
import { Upload, X, File as FileIcon, Image as ImageIcon } from "lucide-react";
import { cn, formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface FileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  files?: File[];
  onRemove?: (index: number) => void;
  title?: string;
  hint?: string;
  className?: string;
}

export function FileDropzone({
  accept,
  multiple = false,
  onFiles,
  files = [],
  onRemove,
  title = "Drop files here",
  hint = "or click to browse",
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    onFiles(multiple ? arr : [arr[0]]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative rounded-xl border-2 border-dashed bg-card p-8 text-center cursor-pointer transition-all",
          "hover:border-primary/60 hover:bg-accent/30",
          dragging && "border-primary bg-accent/50 ring-4 ring-primary/20",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "grid place-items-center h-12 w-12 rounded-xl bg-secondary text-primary transition-transform",
              dragging && "scale-110",
            )}
          >
            <Upload className="h-6 w-6" />
          </div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
          {accept && (
            <p className="text-[11px] text-muted-foreground/80">
              Accepts: {accept.split(",").slice(0, 3).join(", ")}
              {multiple ? " · multiple files" : " · single file"}
            </p>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
            >
              <div className="grid place-items-center h-9 w-9 rounded-md bg-secondary text-primary shrink-0">
                {f.type.startsWith("image/") ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileIcon className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(f.size)}
                </p>
              </div>
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(i)}
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

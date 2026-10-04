// Small formatting & DOM utilities used across the app.

import { cn } from "./utils";

export { cn };

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Format a byte count as a short human-readable string (KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Format an epoch-millis timestamp as a relative phrase ("just now",
 * "5 minutes ago", "yesterday") or a short month-day string for older dates.
 */
export function formatDate(ts: number): string {
  if (!Number.isFinite(ts)) return "";
  const now = Date.now();
  const diff = now - ts;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const hrs = Math.floor(diff / HOUR);
    return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }
  if (diff < 2 * DAY) return "yesterday";
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days} days ago`;
  }
  const date = new Date(ts);
  const month = MONTHS[date.getMonth()] ?? "";
  return `${month} ${date.getDate()}`;
}

/** Trigger a browser download for a Blob with the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  // Some browsers require the link to be attached to the DOM to trigger.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on next tick so the click has time to register.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Generate a short random id (good enough for client-side records). */
export function uid(): string {
  // Prefer the native crypto.randomUUID when available (modern browsers).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to manual generator
    }
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

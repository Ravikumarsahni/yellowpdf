// Client-side PDF text extraction using `pdfjs-dist`.
//
// Critical architectural piece for the 100k-users scalability story:
// this runs ENTIRELY in the browser, never sends file bytes to any server.
// Only the extracted TEXT is shipped to the AI API routes — meaning the
// server is doing LLM work on a few KB of text instead of MB of file.
//
// Usage:
//   const bytes = new Uint8Array(await file.arrayBuffer());
//   const { text, pages } = await extractTextFromPdf(bytes);

import * as pdfjsLib from "pdfjs-dist";

// Structural type — pdfjs' `TextContent.items` is an array of `TextItem`
// (has `str`) or `TextMarkedContent` (no `str`). We only care about items
// that have a `str`, so this minimal shape is enough.
interface HasStr {
  str?: string;
}

// Wire up the worker from the CDN matching the installed package version.
// Doing this at module-eval time means the worker URL is configured before
// any `getDocument` call, and it's the same URL across all callers.
if (typeof window !== "undefined" && "GlobalWorkerOptions" in pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@" +
    pdfjsLib.version +
    "/build/pdf.worker.min.mjs";
}

export interface ExtractResult {
  /** Concatenated text from every page, separated by page markers. */
  text: string;
  /** Number of pages successfully processed. */
  pages: number;
}

/**
 * Extract all text content from a PDF using pdfjs-dist in the browser.
 *
 * @param data raw PDF bytes (e.g. from `new Uint8Array(await file.arrayBuffer())`)
 * @returns the joined text and page count
 */
export async function extractTextFromPdf(
  data: Uint8Array,
): Promise<ExtractResult> {
  // Clone the bytes into a fresh ArrayBuffer-backed Uint8Array. pdfjs's
  // `getDocument` transfers the underlying buffer in some worker setups,
  // which would detach the caller's buffer and cause subtle bugs.
  const safeData = data.slice();

  const loadingTask = pdfjsLib.getDocument({
    data: safeData,
    // Disable network streaming features we don't need (pure in-memory use).
    disableAutoFetch: true,
    disableStream: true,
  });

  const doc = await loadingTask.promise;

  try {
    const numPages: number = doc.numPages;
    const parts: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .map((it) => {
            const str = (it as HasStr).str;
            return typeof str === "string" ? str : "";
          })
          .join(" ")
          .trim();
        parts.push(`--- Page ${i} ---\n${pageText}`);
      } finally {
        // Release page-level resources so we don't leak memory on big files.
        page.cleanup();
      }
    }

    return {
      text: parts.join("\n\n"),
      pages: numPages,
    };
  } finally {
    // Release document-level caches, then destroy the loading task (which
    // aborts any pending network requests and tears down the worker).
    doc.cleanup().catch(() => {
      // Ignore cleanup failures — we're tearing down anyway.
    });
    loadingTask.destroy().catch(() => {
      // Same here — best-effort teardown.
    });
  }
}

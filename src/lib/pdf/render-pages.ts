// Client-side PDF → PNG/JPEG image renderer using `pdfjs-dist`.
//
// Used by the OCR tool (and only the OCR tool, for now). It walks every page,
// rasterises it to a <canvas>, and serialises the canvas to a base64 data URL
// that can be POSTed to /api/ai/ocr. The heavy rasterisation happens in the
// browser — the server only ever sees the resulting image bytes — keeping the
// backend light and preserving the 100k-users scalability story.
//
// Usage:
//   const bytes = new Uint8Array(await file.arrayBuffer());
//   const pages = await renderPdfPagesToImages(bytes, { scale: 2, maxPages: 30 });

import * as pdfjsLib from "pdfjs-dist";

// Wire up the worker from the CDN matching the installed package version.
// Only configure it in a browser context so SSR / module-eval-time stays clean.
if (typeof window !== "undefined" && "GlobalWorkerOptions" in pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@" +
    pdfjsLib.version +
    "/build/pdf.worker.min.mjs";
}

export interface RenderedPage {
  /** Base64 data URL (e.g. `data:image/png;base64,...`) ready to POST. */
  dataUrl: string;
  /** Pixel width of the rendered canvas. */
  width: number;
  /** Pixel height of the rendered canvas. */
  height: number;
}

export interface RenderOptions {
  /** Render scale multiplier (default 2.0). Caps so neither dimension
   *  exceeds ~2000px to avoid memory issues on big pages. */
  scale?: number;
  /** Max number of pages to render (default 30) — defends against runaway
   *  memory on huge PDFs. */
  maxPages?: number;
}

const DEFAULT_SCALE = 2.0;
const DEFAULT_MAX_PAGES = 30;
const MAX_DIMENSION = 2000;

/**
 * Render each page of a PDF to a base64 data URL using pdfjs-dist.
 *
 * @param data raw PDF bytes (cloned internally to prevent worker-driven
 *             buffer detachment)
 * @param opts scale & maxPages overrides
 */
export async function renderPdfPagesToImages(
  data: Uint8Array,
  opts: RenderOptions = {},
): Promise<RenderedPage[]> {
  const requestedScale = opts.scale ?? DEFAULT_SCALE;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

  // Clone the bytes into a fresh buffer — pdfjs's `getDocument` can transfer
  // (detach) the underlying ArrayBuffer in some worker setups, which would
  // corrupt the caller's copy if they reuse it after rendering.
  const safeData = data.slice();

  const loadingTask = pdfjsLib.getDocument({
    data: safeData,
    disableAutoFetch: true,
    disableStream: true,
  });

  const doc = await loadingTask.promise;

  try {
    const numPages: number = doc.numPages;
    const pagesToRender = Math.min(numPages, maxPages);
    const out: RenderedPage[] = [];

    for (let i = 1; i <= pagesToRender; i++) {
      const page = await doc.getPage(i);
      try {
        // Compute the viewport at scale=1 to derive a per-page scale that
        // keeps the largest dimension <= MAX_DIMENSION.
        const baseViewport = page.getViewport({ scale: 1 });
        const baseW = baseViewport.width;
        const baseH = baseViewport.height;
        const limit = Math.max(baseW, baseH);
        const capScale = limit > 0 ? MAX_DIMENSION / limit : requestedScale;
        const effectiveScale = Math.min(requestedScale, capScale);

        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Canvas 2D context unavailable");
        }
        // Paint a white background — JPEG has no alpha channel and would
        // otherwise render transparent regions as black. We always paint it
        // (cheap) so the output looks identical for both PNG and JPEG.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;

        // Prefer PNG (preserves crisp text edges — best for OCR). PNG can
        // balloon for photo-heavy pages but those PDFs are rare in OCR
        // workflows; switching to JPEG here would hurt recognition quality.
        const dataUrl = canvas.toDataURL("image/png");

        out.push({
          dataUrl,
          width: canvas.width,
          height: canvas.height,
        });

        // Drop the canvas memory eagerly — Chromium keeps the backing store
        // alive until GC, which is painful for 30-page PDFs.
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        // Release page-level caches so we don't leak memory across pages.
        page.cleanup();
      }
    }

    return out;
  } finally {
    // Release document-level caches, then destroy the loading task (which
    // aborts any pending worker requests and tears down the worker thread).
    doc.cleanup().catch(() => {
      // Ignore cleanup failures — we're tearing down anyway.
    });
    loadingTask.destroy().catch(() => {
      // Same here — best-effort teardown.
    });
  }
}

/**
 * Estimate the wire payload size (in bytes) of an array of base64 data URLs
 * BEFORE posting them. Used by the UI to warn the user when the upload is
 * going to be heavy and to cap the page count for performance.
 *
 * base64 encodes 3 bytes of source into 4 chars of output, so the decoded
 * byte count ≈ stringLength × 0.75. The `data:...;base64,` prefix is tiny
 * relative to the body and is ignored for this estimate.
 */
export function estimateImagePayloadBytes(dataUrls: string[]): number {
  return dataUrls.reduce((sum, s) => sum + s.length * 0.75, 0);
}

// Thin browser-safe wrapper around `pdf-lib` for use in client components.
//
// Tool components should import from here instead of importing pdf-lib
// directly: this gives us a single seam to swap implementations, add logging,
// or guard against malformed input without touching every tool.

import {
  PDFDocument,
  degrees,
  rgb,
  StandardFonts,
  PDFFont,
  PDFPage,
  SaveOptions,
  // Below are useful types we re-export so tool code can `import type` from a
  // single module.
  PDFName,
  PDFString,
  PDFNumber,
  PDFArray,
  PDFDict,
  PDFRawStream,
  PDFContentStream,
  LineCapStyle,
  BlendMode,
} from "pdf-lib";

export type {
  PDFDocument,
  PDFFont,
  PDFPage,
  SaveOptions,
  PDFName,
  PDFString,
  PDFNumber,
  PDFArray,
  PDFDict,
  PDFRawStream,
  PDFContentStream,
  LineCapStyle,
  BlendMode,
};

export { degrees, rgb, StandardFonts };

/**
 * Load a PDF document from raw bytes. Defaults to ignoring encryption so we
 * can open most user-supplied files (use the `unlock-pdf` tool for those that
 * actually need a password).
 */
export async function loadPdf(
  data: Uint8Array,
  options?: { ignoreEncryption?: boolean; updateMetadata?: boolean },
): Promise<PDFDocument> {
  return PDFDocument.load(data, {
    ignoreEncryption: options?.ignoreEncryption ?? true,
    updateMetadata: options?.updateMetadata ?? false,
  });
}

/**
 * Serialize a PDFDocument back to bytes ready for download or further
 * processing.
 */
export async function savePdf(
  doc: PDFDocument,
  options?: SaveOptions,
): Promise<Uint8Array> {
  return doc.save(options ?? { useObjectStreams: true });
}

/**
 * Convenience helper: open a PDF, mutate it with `mutator`, and return the
 * serialized bytes. Cuts boilerplate for tools that do a single pass.
 */
export async function transformPdf(
  data: Uint8Array,
  mutator: (doc: PDFDocument) => void | Promise<void>,
  options?: { ignoreEncryption?: boolean },
): Promise<Uint8Array> {
  const doc = await loadPdf(data, options);
  await mutator(doc);
  return savePdf(doc);
}

/**
 * Convert a `Uint8Array` into a `Blob` with the standard PDF MIME type, ready
 * for download or object URL generation.
 */
export function pdfBlob(bytes: Uint8Array): Blob {
  // Slice the underlying buffer so we don't leak shared memory into the Blob.
  return new Blob([bytes.slice()], { type: "application/pdf" });
}

/**
 * Create a fresh empty PDF document — used by tools that build new PDFs from
 * non-PDF sources (images, JSON, HTML).
 */
export async function createPdf(): Promise<PDFDocument> {
  return PDFDocument.create();
}

/**
 * Embed the most common standard fonts (Helvetica family). Returns a tuple
 * that tool components can destructure for convenience.
 */
export async function embedStandardFonts(doc: PDFDocument): Promise<{
  Helvetica: PDFFont;
  HelveticaBold: PDFFont;
  HelveticaOblique: PDFFont;
  TimesRoman: PDFFont;
}> {
  const [Helvetica, HelveticaBold, HelveticaOblique, TimesRoman] =
    await Promise.all([
      doc.embedFont(StandardFonts.Helvetica),
      doc.embedFont(StandardFonts.HelveticaBold),
      doc.embedFont(StandardFonts.HelveticaOblique),
      doc.embedFont(StandardFonts.TimesRoman),
    ]);
  return { Helvetica, HelveticaBold, HelveticaOblique, TimesRoman };
}

/** Page size constants in PDF points (1pt = 1/72"). */
export const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  A3: { width: 841.89, height: 1190.55 },
  A5: { width: 419.53, height: 595.28 },
} as const;

export type PageSizeName = keyof typeof PAGE_SIZES;

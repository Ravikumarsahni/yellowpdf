// AI OCR endpoint.
//
// Unlike the other AI endpoints (summarize/translate/chat/keypoints) which
// receive extracted TEXT, this endpoint receives an array of PAGE IMAGES
// (base64 data URLs) produced by `renderPdfPagesToImages` in the browser.
// For each image, we call the VLM (z-ai-web-dev-sdk
// `chat.completions.createVision`) with an OCR-focused prompt and concatenate
// the results page-by-page. This is the right tool for SCANNED / image-based
// PDFs that have no embedded text layer — for digital PDFs the other AI tools
// are faster and never send images.

import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard cap on number of images per request (defence-in-depth even though
 *  the client also caps it). */
const MAX_PAGES = 60;

const OCR_PROMPT =
  "Extract ALL text visible in this image. Preserve the original reading order, line breaks, and paragraph structure. Return ONLY the extracted text, no commentary or markdown formatting.";

interface PageResult {
  text: string;
  ok: boolean;
}

async function ocrSingleImage(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  dataUrl: string,
  index: number,
): Promise<PageResult> {
  try {
    if (!/^data:image\/(png|jpe?g|webp|gif|bmp);base64,/i.test(dataUrl)) {
      console.warn(
        `[ai/ocr] page ${index + 1}: not a valid base64 image data URL — skipping`,
      );
      return { text: "", ok: false };
    }
    const completion = await zai.chat.completions.createVision({
      model: "glm-4.6v",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    const text =
      completion?.choices?.[0]?.message?.content?.toString().trim() ?? "";
    return { text, ok: true };
  } catch (err) {
    // A single page failing must not kill the whole request — log and continue.
    console.warn(
      `[ai/ocr] page ${index + 1} failed:`,
      err instanceof Error ? err.message : err,
    );
    return { text: "", ok: false };
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let payloadChars = 0;
  let pages = 0;

  try {
    const body = (await req.json().catch(() => null)) as
      | { images?: unknown }
      | null;

    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    // Validate: `images` must be a non-empty array of strings.
    if (
      !Array.isArray(body.images) ||
      body.images.length === 0 ||
      !body.images.every((v) => typeof v === "string")
    ) {
      return NextResponse.json(
        {
          error:
            "images must be a non-empty array of base64 image data URLs",
        },
        { status: 400 },
      );
    }

    const images: string[] = body.images.slice(0, MAX_PAGES);
    payloadChars = images.reduce((sum, s) => sum + s.length, 0);
    pages = images.length;

    console.info(
      `[ai/ocr] request pages=${pages} payloadSize≈${Math.round(
        payloadChars * 0.75,
      )} bytes`,
    );

    const zai = await ZAI.create();

    // Sequential processing — VLM calls are heavy and running them in
    // parallel risks overwhelming the upstream provider.
    const results: PageResult[] = [];
    for (let i = 0; i < images.length; i++) {
      const r = await ocrSingleImage(zai, images[i]!, i);
      results.push(r);
      console.info(
        `[ai/ocr] page ${i + 1}/${pages} ${r.ok ? "ok" : "failed"} (${r.text.length} chars)`,
      );
    }

    // Concatenate page texts with a clear page marker so downstream tools
    // (summarize / translate / chat) can still split on `--- Page N ---`.
    const parts: string[] = [];
    let okCount = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.ok) okCount++;
      parts.push(`--- Page ${i + 1} ---\n${r.text}`);
    }
    const text = parts.join("\n\n").trim();
    const chars = text.length;

    const durationMs = Date.now() - startedAt;
    console.info(
      `[ai/ocr] done in ${durationMs}ms pages=${pages} ok=${okCount} chars=${chars}`,
    );

    // Best-effort analytics — never let DB issues break the API.
    try {
      await db.usageEvent.create({
        data: {
          toolId: "ocr-pdf",
          success: okCount > 0,
          durationMs,
          fileSizeBytes: Math.round(payloadChars * 0.75),
        },
      });
    } catch (dbErr) {
      console.warn("[ai/ocr] usage log failed:", dbErr);
    }

    return NextResponse.json({ text, pages, chars });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[ai/ocr] failed after ${durationMs}ms:`,
      err instanceof Error ? err.message : err,
    );

    // Best-effort analytics for failures too.
    try {
      await db.usageEvent.create({
        data: {
          toolId: "ocr-pdf",
          success: false,
          durationMs,
          fileSizeBytes: Math.round(payloadChars * 0.75),
        },
      });
    } catch {
      // Ignore — analytics must not block error responses.
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to OCR images",
      },
      { status: 500 },
    );
  }
}

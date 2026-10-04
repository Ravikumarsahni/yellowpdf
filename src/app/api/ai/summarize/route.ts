// AI Summarize endpoint.
//
// The client extracts text from the user's PDF entirely in the browser (via
// `pdfjs-dist`) and sends ONLY the extracted text + a length preference to
// this route. The server forwards the text to the LLM and returns a summary.
// Because no file bytes ever hit the server, this endpoint scales to 100k+
// users — the heavy work (PDF parsing) is offloaded to each visitor's
// browser, and the server only ever processes a single text payload.

import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe upper bound for the LLM context window (~30k chars ≈ 7-8k tokens). */
const MAX_TEXT_CHARS = 30_000;

type SummaryLength = "short" | "medium" | "long";

function coerceLength(value: unknown): SummaryLength {
  if (value === "short" || value === "medium" || value === "long") {
    return value;
  }
  return "medium";
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let textLength = 0;
  let length: SummaryLength = "medium";

  try {
    const body = (await req.json().catch(() => null)) as
      | { text?: unknown; length?: unknown }
      | null;

    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 },
      );
    }

    length = coerceLength(body.length);
    const rawText = body.text;
    const truncated =
      rawText.length > MAX_TEXT_CHARS
        ? rawText.slice(0, MAX_TEXT_CHARS)
        : rawText;
    textLength = truncated.length;

    console.info(
      `[ai/summarize] request size=${textLength} chars length=${length}`,
    );

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a helpful PDF assistant. Produce a ${length} summary of the following document text. Use clear paragraphs. Do not invent information.`,
        },
        {
          role: "user",
          content: truncated,
        },
      ],
      thinking: { type: "disabled" },
    });

    const summary =
      completion?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!summary) {
      throw new Error("Empty summary from LLM");
    }

    const durationMs = Date.now() - startedAt;
    console.info(
      `[ai/summarize] done in ${durationMs}ms, summary=${summary.length} chars`,
    );

    // Best-effort analytics — never let DB issues break the API.
    try {
      await db.usageEvent.create({
        data: {
          toolId: "ai-summarize",
          success: true,
          durationMs,
          fileSizeBytes: textLength,
        },
      });
    } catch (dbErr) {
      console.warn("[ai/summarize] usage log failed:", dbErr);
    }

    return NextResponse.json({ summary });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[ai/summarize] failed after ${durationMs}ms:`,
      err instanceof Error ? err.message : err,
    );

    // Best-effort analytics for failures too.
    try {
      await db.usageEvent.create({
        data: {
          toolId: "ai-summarize",
          success: false,
          durationMs,
          fileSizeBytes: textLength,
        },
      });
    } catch {
      // Ignore — analytics must not block error responses.
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate summary",
      },
      { status: 500 },
    );
  }
}

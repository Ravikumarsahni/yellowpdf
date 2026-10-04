// AI Translate endpoint.
//
// Same architecture as the other AI endpoints: the client extracts text from
// the PDF in the browser and sends only the text + target language here. The
// server forwards it to the LLM and returns the translation.
//
// NOTE: This tool translates the extracted TEXT only — the original PDF layout
// (columns, fonts, tables, images) is NOT preserved. The client UI surfaces a
// clear notice about this limitation so users aren't surprised.

import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_CHARS = 30_000;

export async function POST(req: Request) {
  const startedAt = Date.now();
  let textLength = 0;
  let target = "";

  try {
    const body = (await req.json().catch(() => null)) as
      | { text?: unknown; target?: unknown }
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

    if (typeof body.target !== "string" || body.target.trim().length === 0) {
      return NextResponse.json(
        { error: "target language is required" },
        { status: 400 },
      );
    }

    target = body.target.slice(0, 60); // language name/code, cap defensively
    const rawText = body.text;
    const truncated =
      rawText.length > MAX_TEXT_CHARS
        ? rawText.slice(0, MAX_TEXT_CHARS)
        : rawText;
    textLength = truncated.length;

    console.info(
      `[ai/translate] request size=${textLength} chars target=${target}`,
    );

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the user's document text into ${target}. Preserve formatting (paragraphs, lists). Return only the translation, no commentary.`,
        },
        {
          role: "user",
          content: truncated,
        },
      ],
      thinking: { type: "disabled" },
    });

    const translation =
      completion?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!translation) {
      throw new Error("Empty translation from LLM");
    }

    const durationMs = Date.now() - startedAt;
    console.info(
      `[ai/translate] done in ${durationMs}ms, translation=${translation.length} chars`,
    );

    try {
      await db.usageEvent.create({
        data: {
          toolId: "ai-translate",
          success: true,
          durationMs,
          fileSizeBytes: textLength,
        },
      });
    } catch (dbErr) {
      console.warn("[ai/translate] usage log failed:", dbErr);
    }

    return NextResponse.json({ translation, target });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[ai/translate] failed after ${durationMs}ms:`,
      err instanceof Error ? err.message : err,
    );

    try {
      await db.usageEvent.create({
        data: {
          toolId: "ai-translate",
          success: false,
          durationMs,
          fileSizeBytes: textLength,
        },
      });
    } catch {
      // ignore
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate translation",
      },
      { status: 500 },
    );
  }
}

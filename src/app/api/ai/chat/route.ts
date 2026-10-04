// AI Chat-with-PDF endpoint.
//
// The client maintains the conversation history and sends, on every request:
//   - `text`: the full extracted PDF text (truncated server-side to ~30k chars)
//   - `question`: the user's latest question
//   - `history`: prior user/assistant turns (excluding the document context)
//
// We assemble the messages as: system prompt → history → final user message
// (which embeds the document text + the question). That keeps the document
// context anchored to the most recent question while still letting the model
// reference earlier exchanges.

import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_CHARS = 30_000;
/** Cap history to keep the request well inside context limits. */
const MAX_HISTORY_TURNS = 12;

type ChatRole = "user" | "assistant";
interface HistoryMessage {
  role: ChatRole;
  content: string;
}

function sanitizeHistory(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = (item as { role?: unknown }).role;
    const c = (item as { content?: unknown }).content;
    if (
      (r === "user" || r === "assistant") &&
      typeof c === "string" &&
      c.trim().length > 0
    ) {
      // Cap each message length defensively (avoid a single huge turn).
      out.push({ role: r, content: c.slice(0, 8000) });
    }
    if (out.length >= MAX_HISTORY_TURNS) break;
  }
  return out;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let textLength = 0;

  try {
    const body = (await req.json().catch(() => null)) as
      | {
          text?: unknown;
          question?: unknown;
          history?: unknown;
        }
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

    if (
      typeof body.question !== "string" ||
      body.question.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 },
      );
    }

    const question = body.question.slice(0, 4000);
    const rawText = body.text;
    const truncated =
      rawText.length > MAX_TEXT_CHARS
        ? rawText.slice(0, MAX_TEXT_CHARS)
        : rawText;
    textLength = truncated.length;
    const history = sanitizeHistory(body.history);

    console.info(
      `[ai/chat] request size=${textLength} chars history=${history.length} turns question=${question.length} chars`,
    );

    const zai = await ZAI.create();

    // Final user message bundles document text + the user's question so the
    // model has both in scope when generating its answer.
    const finalUserContent = `Document text:\n"""\n${truncated}\n"""\n\nQuestion: ${question}`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content:
          "You are an assistant that answers questions about the following document. Only use information from the document. If the answer isn't in the document, say so. Quote relevant snippets when helpful.",
      },
      ...history,
      { role: "user", content: finalUserContent },
    ];

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const answer =
      completion?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!answer) {
      throw new Error("Empty answer from LLM");
    }

    const durationMs = Date.now() - startedAt;
    console.info(
      `[ai/chat] done in ${durationMs}ms, answer=${answer.length} chars`,
    );

    try {
      await db.usageEvent.create({
        data: {
          toolId: "ai-chat",
          success: true,
          durationMs,
          fileSizeBytes: textLength,
        },
      });
    } catch (dbErr) {
      console.warn("[ai/chat] usage log failed:", dbErr);
    }

    return NextResponse.json({ answer });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[ai/chat] failed after ${durationMs}ms:`,
      err instanceof Error ? err.message : err,
    );

    try {
      await db.usageEvent.create({
        data: {
          toolId: "ai-chat",
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
            : "Failed to answer question",
      },
      { status: 500 },
    );
  }
}
